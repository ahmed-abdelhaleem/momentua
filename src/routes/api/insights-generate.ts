import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

export const Route = createFileRoute("/api/insights-generate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
        const { data: u } = await sb.auth.getUser();
        if (!u.user) return new Response("Unauthorized", { status: 401 });

        const since = new Date(); since.setDate(since.getDate() - 30);
        const accountCreatedAt = u.user.created_at ?? null;
        // First-ever log tells us when the user actually started doing things in the app.
        const firstLogRes = await sb.from("point_logs").select("created_at").eq("user_id", u.user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
        const firstLogAt = firstLogRes.data?.created_at ?? null;
        const [pointsRes, aceRes, spiralsRes, dumpRes, memoryRes] = await Promise.all([
          sb.from("point_logs").select("action_label,domain,points,created_at").eq("user_id", u.user.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(500),
          sb.from("ace_messages").select("role,content,created_at").eq("user_id", u.user.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(80),
          sb.from("point_logs").select("action_label,created_at").eq("user_id", u.user.id).eq("action_key", "spiral_logged").gte("created_at", since.toISOString()).limit(80),
          sb.from("brain_dumps").select("category,content,created_at").eq("user_id", u.user.id).gte("created_at", since.toISOString()).limit(40),
          sb.from("user_memory").select("*").eq("user_id", u.user.id).maybeSingle(),
        ]);

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const sys = `You are an analyst inside MOMENTUM. Read the available behavioral data for one user and produce a SHORT insight: 3-5 bullet points + one specific experiment for tomorrow. No shame, no generic motivation. Use real numbers from the data. Voice: calm, clear-eyed, brief.

CRITICAL: Days BEFORE \`first_active_at\` are NOT behavior — the user simply wasn't using the app yet. Never interpret pre-onboarding silence as "you only did X once in 30 days". Only analyze the window from \`first_active_at\` to now. If that window is less than ~5 days or the dataset is tiny, say so explicitly ("only N days of data so far") and offer 1-2 small things to track next, instead of inventing patterns.`;

        const daysActive = firstLogAt ? Math.max(1, Math.ceil((Date.now() - new Date(firstLogAt).getTime()) / 86400000)) : 0;
        const summary = JSON.stringify({
          account_created_at: accountCreatedAt,
          first_active_at: firstLogAt,
          days_active: daysActive,
          memory: memoryRes.data ?? null,
          points_summary: summarizePoints(pointsRes.data ?? []),
          spirals_count: spiralsRes.data?.length ?? 0,
          recent_spirals: (spiralsRes.data ?? []).slice(0, 10),
          ace_recent: (aceRes.data ?? []).slice(0, 30),
          brain_dumps_recent: (dumpRes.data ?? []).slice(0, 15),
        }, null, 2);

        try {
          const gw = createLovableAiGatewayProvider(key);
          const { text } = await generateText({
            model: gw("google/gemini-3-flash-preview"),
            system: sys,
            prompt: `User data (window: first_active_at → now, capped at 30 days):\n${summary}\n\nReturn an insight in markdown. Only analyze days the user was actually active in the app.`,
          });

          const { data: ins, error } = await sb.from("ace_insights").insert({
            user_id: u.user.id, kind: "manual", title: "30-day pattern", content: text,
          }).select().single();
          if (error) return new Response(error.message, { status: 500 });
          return Response.json(ins);
        } catch (e) {
          console.error(e);
          return new Response(e instanceof Error ? e.message : "Failed", { status: 500 });
        }
      },
    },
  },
});

function summarizePoints(rows: { action_label: string; domain: string; points: number; created_at: string }[]) {
  const byDomain: Record<string, number> = {};
  const byAction: Record<string, { count: number; pts: number }> = {};
  const byDay: Record<string, number> = {};
  for (const r of rows) {
    byDomain[r.domain] = (byDomain[r.domain] ?? 0) + r.points;
    const a = (byAction[r.action_label] ||= { count: 0, pts: 0 });
    a.count++; a.pts += r.points;
    const day = r.created_at.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + r.points;
  }
  const topActions = Object.entries(byAction).sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  return { total: rows.length, byDomain, topActions, dailyPoints: byDay };
}
