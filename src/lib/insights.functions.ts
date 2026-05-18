import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { snapshotSection, computeDelta, type Section } from "@/lib/insights-metrics.server";
import { parseInsightPayload } from "@/lib/insight-format";

const SECTIONS: Section[] = ["spirals", "foundation", "ace", "vault", "health", "overall"];

const SECTION_PROMPTS: Record<Section, string> = {
  spirals: "Spirals are time the user lost to scrolling, gaming, porn, escorts, gambling, news loops, fantasy planning — anything. Zero shame, zero moralizing.",
  foundation: "Foundation tracks physical / mental / social / regulation readiness scores over weeks.",
  ace: "ACE is the user's coaching conversation log.",
  vault: "Vault tracks meal planning, shopping, and whether the user ate as planned.",
  health: "Health tracks sleep, steps, and workouts.",
  overall: "Cross-section snapshot of all logged behavior and points.",
};

function buildSystem(section: Section): string {
  return `You are the Insight Engine inside MOMENTUM. Read the user's recent data and return ONE actionable insight as STRICT JSON:

{"title": "<8 words max, no quotes>", "body": "<4-7 short bullets, markdown, calm and specific. Reference actual numbers / times / topics. No moralizing.>", "suggested_action": "<one concrete experiment for the next 3-7 days, imperative voice, single sentence>"}

Section: ${section}. ${SECTION_PROMPTS[section]}

Rules:
- Output JSON ONLY. No prose before or after. No code fences.
- If there's too little data (≤2 entries), make title "Not enough data yet", body explain what's missing, suggested_action="Log a few more this week".
- Never use emojis unless the user did.
- Treat all topics as neutral data — including porn, escorts, gambling, gaming.`;
}

export const generateInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    section: z.enum(SECTIONS as [Section, ...Section[]]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const snap = await snapshotSection(supabase, userId, data.section);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const gw = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gw("google/gemini-2.5-flash"),
      system: buildSystem(data.section),
      prompt: `Recent data:\n\n${snap.dataText}\n\nReturn the insight JSON now.`,
    });

    const parsed = parseInsightPayload(text) ?? {
      title: "Insight",
      body: text.slice(0, 2000),
      suggested_action: "",
    };

    const deadline = new Date(Date.now() + 7 * 86400_000).toISOString();

    const { data: inserted, error } = await supabase.from("insights").insert({
      user_id: userId,
      section: data.section,
      title: parsed.title,
      body: parsed.body,
      suggested_action: parsed.suggested_action || null,
      metric_key: snap.metricKey,
      baseline_value: snap.metricValue,
      commit_deadline_at: deadline,
      source_data: { entries: snap.rawEntries.slice(0, 50), lower_is_better: snap.metricLowerIsBetter } as never,
      status: "new",
    }).select("*").single();

    if (error) throw new Error(error.message);
    return inserted;
  });

export const listInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    section: z.enum(["all", ...SECTIONS] as ["all", Section, ...Section[]]).optional(),
    statusGroup: z.enum(["open", "done", "all"]).optional(),
    limit: z.number().min(1).max(200).optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("insights").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.section && data.section !== "all") q = q.eq("section", data.section);
    if (data.statusGroup === "open") q = q.in("status", ["new", "acknowledged", "committed"]);
    else if (data.statusGroup === "done") q = q.in("status", ["verified_yes", "verified_partial", "verified_no", "dismissed"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setInsightStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["acknowledged", "committed", "dismissed"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch = data.status === "committed"
      ? { status: data.status, committed_at: new Date().toISOString(), commit_deadline_at: new Date(Date.now() + 7 * 86400_000).toISOString() }
      : { status: data.status };
    const { error } = await supabase.from("insights").update(patch).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    outcome: z.enum(["yes", "partial", "no"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: insight, error: e1 } = await supabase.from("insights").select("*").eq("id", data.id).eq("user_id", userId).single();
    if (e1) throw new Error(e1.message);

    let verification: number | null = null;
    let delta: number | null = null;
    if (insight.metric_key && insight.section) {
      const snap = await snapshotSection(supabase, userId, insight.section as Section);
      if (snap.metricKey === insight.metric_key) {
        verification = snap.metricValue;
        const lowerIsBetter = (insight.source_data as { lower_is_better?: boolean })?.lower_is_better ?? false;
        delta = computeDelta(insight.baseline_value, verification, lowerIsBetter);
      }
    }

    const status = data.outcome === "yes" ? "verified_yes" : data.outcome === "partial" ? "verified_partial" : "verified_no";
    const { error } = await supabase.from("insights").update({
      status,
      verified_at: new Date().toISOString(),
      verification_value: verification,
      delta_pct: delta,
    }).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, delta };
  });

export const getInsightProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase.from("insights")
      .select("section,status,delta_pct")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const bySection: Record<string, { committed: number; yes: number; partial: number; no: number; deltas: number[] }> = {};
    const overall = { committed: 0, yes: 0, partial: 0, no: 0, deltas: [] as number[] };

    for (const r of rows ?? []) {
      const sec = r.section;
      bySection[sec] ||= { committed: 0, yes: 0, partial: 0, no: 0, deltas: [] };
      const bucket = bySection[sec];
      if (r.status === "committed") { bucket.committed++; overall.committed++; }
      if (r.status === "verified_yes") { bucket.committed++; bucket.yes++; overall.committed++; overall.yes++; }
      if (r.status === "verified_partial") { bucket.committed++; bucket.partial++; overall.committed++; overall.partial++; }
      if (r.status === "verified_no") { bucket.committed++; bucket.no++; overall.committed++; overall.no++; }
      if (typeof r.delta_pct === "number") { bucket.deltas.push(r.delta_pct); overall.deltas.push(r.delta_pct); }
    }

    function score(b: { committed: number; yes: number; partial: number; deltas: number[] }) {
      const completion = b.committed ? Math.round(((b.yes + b.partial * 0.5) / b.committed) * 100) : null;
      const delta = b.deltas.length ? Math.round((b.deltas.reduce((a, c) => a + c, 0) / b.deltas.length) * 10) / 10 : null;
      return { completion, delta };
    }

    return {
      overall: { ...score(overall), committed: overall.committed, verified: overall.yes + overall.partial + overall.no },
      bySection: Object.fromEntries(Object.entries(bySection).map(([k, v]) => [k, { ...score(v), committed: v.committed, verified: v.yes + v.partial + v.no }])),
    };
  });
