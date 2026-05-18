// Section data fetchers + metric snapshots for the insights system.
// Each function returns { data: <human-readable lines>, metricKey, metricValue }.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Section = "spirals" | "foundation" | "ace" | "vault" | "health" | "overall";

export interface SectionSnapshot {
  /** Human-readable data lines for the AI prompt. */
  dataText: string;
  /** Raw entries for source_data. */
  rawEntries: unknown[];
  /** Metric we track to compute delta after verification. Null if section doesn't have one. */
  metricKey: string | null;
  metricValue: number | null;
  /** True when "lower number = better" (e.g. spiral minutes). Used to sign delta. */
  metricLowerIsBetter: boolean;
}

const DAYS = 14;

export async function snapshotSection(
  supabase: SupabaseClient,
  userId: string,
  section: Section,
): Promise<SectionSnapshot> {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  switch (section) {
    case "spirals": {
      const { data } = await supabase
        .from("point_logs")
        .select("id,action_label,points,created_at")
        .eq("user_id", userId).eq("action_key", "spiral_logged")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(200);
      const rows = data ?? [];
      let totalMin = 0;
      const lines = rows.map((e) => {
        const m = String(e.action_label).match(/\((\d+)m\)/);
        const mins = m ? Number(m[1]) : 0;
        totalMin += mins;
        const d = new Date(e.created_at);
        return `- ${d.toISOString().slice(0, 16).replace("T", " ")} | ${e.action_label}`;
      });
      const avgMinPerDay = rows.length ? totalMin / DAYS : 0;
      return {
        dataText: lines.length ? lines.join("\n") : "No spirals logged in the last 14 days.",
        rawEntries: rows,
        metricKey: "spirals_avg_min_per_day",
        metricValue: Math.round(avgMinPerDay * 10) / 10,
        metricLowerIsBetter: true,
      };
    }
    case "foundation": {
      const { data } = await supabase
        .from("foundation_readiness").select("week_start,total,physical,mental,social,regulation")
        .eq("user_id", userId).gte("week_start", new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10))
        .order("week_start", { ascending: false }).limit(8);
      const rows = data ?? [];
      const avg = rows.length ? rows.reduce((s, r) => s + (r.total ?? 0), 0) / rows.length : 0;
      const lines = rows.map((r) => `- ${r.week_start} | total ${r.total} (phys ${r.physical}, ment ${r.mental}, soc ${r.social}, reg ${r.regulation})`);
      return {
        dataText: lines.length ? lines.join("\n") : "No foundation readiness scores yet.",
        rawEntries: rows,
        metricKey: "foundation_avg_total",
        metricValue: Math.round(avg * 10) / 10,
        metricLowerIsBetter: false,
      };
    }
    case "vault": {
      const { data } = await supabase
        .from("meal_plans").select("plan_date,ate_as_planned,shop_status")
        .eq("user_id", userId).gte("plan_date", new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10))
        .order("plan_date", { ascending: false }).limit(50);
      const rows = data ?? [];
      const successes = rows.filter((r) => r.ate_as_planned === "yes" || r.ate_as_planned === "partly").length;
      const rate = rows.length ? successes / rows.length : 0;
      const lines = rows.map((r) => `- ${r.plan_date} | ate ${r.ate_as_planned ?? "—"} | shop ${r.shop_status}`);
      return {
        dataText: lines.length ? lines.join("\n") : "No meal plans in the last 14 days.",
        rawEntries: rows,
        metricKey: "vault_meal_adherence",
        metricValue: Math.round(rate * 100),
        metricLowerIsBetter: false,
      };
    }
    case "health": {
      const { data } = await supabase
        .from("health_entries").select("entry_date,sleep_hours,steps,workouts")
        .eq("user_id", userId).gte("entry_date", new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10))
        .order("entry_date", { ascending: false }).limit(30);
      const rows = data ?? [];
      const avgSleep = rows.length ? rows.reduce((s, r) => s + Number(r.sleep_hours ?? 0), 0) / rows.length : 0;
      const lines = rows.map((r) => `- ${r.entry_date} | sleep ${r.sleep_hours}h | steps ${r.steps}`);
      return {
        dataText: lines.length ? lines.join("\n") : "No health entries in the last 14 days.",
        rawEntries: rows,
        metricKey: "health_avg_sleep",
        metricValue: Math.round(avgSleep * 10) / 10,
        metricLowerIsBetter: false,
      };
    }
    case "ace": {
      const { data } = await supabase
        .from("ace_messages").select("role,content,created_at")
        .eq("user_id", userId).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(80);
      const rows = data ?? [];
      const lines = rows.map((r) => `- ${new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")} | ${r.role}: ${String(r.content).slice(0, 200)}`);
      return {
        dataText: lines.length ? lines.join("\n") : "No ACE conversations in the last 14 days.",
        rawEntries: rows,
        metricKey: null,
        metricValue: null,
        metricLowerIsBetter: false,
      };
    }
    case "overall": {
      const { data } = await supabase
        .from("point_logs").select("action_key,action_label,domain,points,created_at")
        .eq("user_id", userId).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(300);
      const rows = data ?? [];
      const totals: Record<string, number> = {};
      for (const r of rows) totals[r.domain] = (totals[r.domain] ?? 0) + Number(r.points);
      const avgPerDay = rows.length ? rows.reduce((s, r) => s + Number(r.points), 0) / DAYS : 0;
      const summary = Object.entries(totals).map(([d, p]) => `${d}: ${p}`).join(", ");
      const recent = rows.slice(0, 60).map((r) => `- ${new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")} | ${r.domain} | ${r.action_label} | ${r.points}`);
      return {
        dataText: `Domain totals (14d): ${summary}\n\nRecent:\n${recent.join("\n")}`,
        rawEntries: rows,
        metricKey: "overall_avg_points_per_day",
        metricValue: Math.round(avgPerDay),
        metricLowerIsBetter: false,
      };
    }
  }
}

export function computeDelta(
  baseline: number | null,
  verification: number | null,
  lowerIsBetter: boolean,
): number | null {
  if (baseline == null || verification == null || baseline === 0) return null;
  const raw = (verification - baseline) / Math.abs(baseline);
  return Math.round((lowerIsBetter ? -raw : raw) * 1000) / 10; // percent, sign = improvement
}
