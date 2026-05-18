// Cron-driven push dispatcher. Runs every ~5 min via pg_cron.
// Picks users whose local time matches their preferred slot, respects caps,
// and ACE-learns: shifts send time toward hours with highest open rate.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendFcm, isFcmTokenDead } from "@/lib/fcm-send.server";

type Pref = {
  user_id: string;
  morning_checkin: boolean;
  evening_log: boolean;
  plan_nudge: boolean;
  surprise_window: boolean;
  morning_hour: number;
  evening_hour: number;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
  max_per_day: number;
};

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

const KIND_LABELS: Record<string, { title: string; body: string; url: string }> = {
  morning_checkin: { title: "Morning check-in", body: "60 seconds. How did you sleep, and did yesterday's meals land?", url: "/ace?flow=morning" },
  evening_log: { title: "Evening log", body: "Lock in today's points and plan tomorrow's meals.", url: "/ace?flow=evening" },
  plan_nudge: { title: "No meals planned for tomorrow", body: "2 minutes now saves a chaotic morning. +600 pts.", url: "/nourish" },
  surprise_window: { title: "Surprise: 2× points active", body: "Next 60 minutes. Anything you log counts double.", url: "/dashboard" },
};

function localHour(tz: string, now: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    return parseInt(fmt.format(now), 10);
  } catch { return now.getUTCHours(); }
}
function localDateKey(tz: string, now: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(now);
  } catch { return now.toISOString().slice(0, 10); }
}
function inQuiet(hour: number, qs: number, qe: number): boolean {
  if (qs === qe) return false;
  if (qs < qe) return hour >= qs && hour < qe;
  return hour >= qs || hour < qe;
}

export const Route = createFileRoute("/api/public/hooks/send-notifications")({
  server: {
    handlers: {
      POST: async () => {
        const subject = process.env.VAPID_SUBJECT || "mailto:notifications@momentum.app";
        const publicKey = "BL7StFf8qzcUI13hqiIQh9l12PHLMpmJRPmmsqOqxqSWVZqS6xQUTP8ITDXRxxIwyoTYMWG94SOdKX1fEwp7vtY";
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (!privateKey) return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not set" }), { status: 500 });
        webpush.setVapidDetails(subject, publicKey, privateKey);

        const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const now = new Date();

        const { data: prefs } = await admin.from("notification_preferences").select("*");
        if (!prefs?.length) return Response.json({ sent: 0, skipped: 0 });

        let sent = 0, skipped = 0, failed = 0;

        for (const p of prefs as Pref[]) {
          const hour = localHour(p.timezone, now);
          if (inQuiet(hour, p.quiet_start, p.quiet_end)) { skipped++; continue; }

          const dayStart = new Date(localDateKey(p.timezone, now) + "T00:00:00Z").toISOString();
          const { data: todayLogs } = await admin
            .from("notification_log").select("kind, opened_at, sent_at")
            .eq("user_id", p.user_id).gte("sent_at", dayStart);
          const todayCount = todayLogs?.length || 0;
          if (todayCount >= p.max_per_day) { skipped++; continue; }

          const sentKinds = new Set((todayLogs || []).map((l) => l.kind));

          // ACE learning: pick best hour offset based on open rate over last 30 days.
          const { data: history } = await admin
            .from("notification_log").select("kind, sent_at, opened_at")
            .eq("user_id", p.user_id).gte("sent_at", new Date(Date.now() - 30 * 86400_000).toISOString());
          const learnedShift = (kind: string): number => {
            const items = (history || []).filter((h) => h.kind === kind && h.opened_at);
            if (items.length < 3) return 0;
            const hours = items.map((i) => {
              try { return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: p.timezone, hour: "numeric", hour12: false }).format(new Date(i.sent_at)), 10); } catch { return 0; }
            });
            const avg = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
            const base = kind === "morning_checkin" ? p.morning_hour : kind === "evening_log" ? p.evening_hour : null;
            if (base === null) return 0;
            return Math.max(-2, Math.min(2, avg - base));
          };

          const candidates: { kind: keyof typeof KIND_LABELS; targetHour: number; enabled: boolean }[] = [
            { kind: "morning_checkin", targetHour: p.morning_hour + learnedShift("morning_checkin"), enabled: p.morning_checkin },
            { kind: "evening_log", targetHour: p.evening_hour + learnedShift("evening_log"), enabled: p.evening_log },
            { kind: "plan_nudge", targetHour: 21, enabled: p.plan_nudge },
          ];

          for (const c of candidates) {
            if (!c.enabled) continue;
            if (sentKinds.has(c.kind)) continue;
            if (hour !== c.targetHour) continue;

            // Plan nudge gating: only fire if user has NOT planned tomorrow's meals.
            if (c.kind === "plan_nudge") {
              const tomorrowDate = new Date(now.getTime() + 86400_000);
              const tomorrow = localDateKey(p.timezone, tomorrowDate);
              const { count } = await admin.from("meal_plans").select("id", { count: "exact", head: true })
                .eq("user_id", p.user_id).eq("plan_date", tomorrow);
              if ((count || 0) > 0) continue;
            }

            const meta = KIND_LABELS[c.kind];
            const { data: logRow } = await admin.from("notification_log").insert({
              user_id: p.user_id, kind: c.kind, title: meta.title, body: meta.body,
              meta: { url: meta.url, learned_shift: c.targetHour - (c.kind === "morning_checkin" ? p.morning_hour : c.kind === "evening_log" ? p.evening_hour : c.targetHour) },
            }).select("id").single();

            const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.user_id);
            const payload = JSON.stringify({ title: meta.title, body: meta.body, url: meta.url, kind: c.kind, id: logRow?.id, tag: c.kind });

            for (const s of (subs || []) as Sub[]) {
              try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
                sent++;
                await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
              } catch (e: any) {
                failed++;
                if (e?.statusCode === 404 || e?.statusCode === 410) {
                  await admin.from("push_subscriptions").delete().eq("id", s.id);
                }
              }
            }

            // Native Android (FCM) fan-out
            const { data: fcm } = await admin.from("fcm_tokens").select("id, token").eq("user_id", p.user_id);
            if (fcm && fcm.length > 0) {
              const fcmResults = await sendFcm(fcm.map((f) => f.token), {
                title: meta.title, body: meta.body, tag: c.kind,
                data: { url: meta.url, kind: c.kind, id: logRow?.id ?? "" },
              });
              for (const r of fcmResults) {
                if (r.ok) {
                  sent++;
                  await admin.from("fcm_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", r.token);
                } else {
                  failed++;
                  if (isFcmTokenDead(r.status, r.error)) {
                    await admin.from("fcm_tokens").delete().eq("token", r.token);
                  }
                }
              }
            }

            sentKinds.add(c.kind);
            if (sentKinds.size + todayCount >= p.max_per_day) break;
          }
        }

        return Response.json({ sent, skipped, failed, at: now.toISOString() });
      },
    },
  },
});
