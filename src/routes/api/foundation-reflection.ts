import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

export const Route = createFileRoute("/api/foundation-reflection")({
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
        const sinceISO = since.toISOString();

        const [sess, trig, ready, points] = await Promise.all([
          sb.from("foundation_sessions").select("*").eq("user_id", u.user.id).eq("status", "active").maybeSingle(),
          sb.from("foundation_triggers").select("created_at,underneath,redirect_chosen,redirect_completed,resolution").eq("user_id", u.user.id).gte("created_at", sinceISO).limit(300),
          sb.from("foundation_readiness").select("week_start,physical,mental,social,regulation,total").eq("user_id", u.user.id).order("week_start", { ascending: false }).limit(8),
          sb.from("point_logs").select("action_key,domain,created_at").eq("user_id", u.user.id).gte("created_at", sinceISO).limit(800),
        ]);

        const triggers = trig.data ?? [];
        const intercepted = triggers.filter((t) => t.redirect_completed).length;
        const interceptRate = triggers.length ? Math.round((intercepted / triggers.length) * 100) : 0;

        const ctx = {
          session: sess.data,
          trigger_count: triggers.length,
          intercepted,
          intercept_rate_pct: interceptRate,
          underneath_freq: tally(triggers.map((t) => t.underneath ?? "unspecified")),
          weekly_readiness: ready.data ?? [],
          point_actions_30d: tally((points.data ?? []).map((p) => p.action_key)),
        };

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const sys = `You are ACE inside MOMENTUM. Generate the user's monthly "Honest Month" reflection for Foundation Mode. Voice: calm, specific, no shame, no moralizing. Use real numbers. Output 5 short sections in markdown:
1. **Trigger log** — count + intercept rate + the dominant "underneath" emotion if any
2. **Redirect success** — what worked, what didn't
3. **Readiness score change** — biggest driver pillar (physical/mental/social/regulation)
4. **One specific observation** — name a real pattern (e.g. "4 trigger events on Sunday evenings")
5. **One forward question** — for next month
Never use words like unhealthy, inappropriate, addiction, failure.`;

        try {
          const gw = createLovableAiGatewayProvider(key);
          const { text } = await generateText({
            model: gw("google/gemini-3-flash-preview"),
            system: sys,
            prompt: `Foundation Mode month data:\n${JSON.stringify(ctx, null, 2)}`,
          });
          const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
          const { data: ins, error } = await sb.from("foundation_reflections").upsert({
            user_id: u.user.id,
            session_id: sess.data?.id ?? null,
            month_start: monthStart.toISOString().slice(0,10),
            content: text,
            data: ctx,
          }, { onConflict: "user_id,month_start" }).select().single();
          if (error) return new Response(error.message, { status: 500 });
          return Response.json(ins);
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Failed", { status: 500 });
        }
      },
    },
  },
});

function tally(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of arr) out[a] = (out[a] ?? 0) + 1;
  return out;
}
