import { supabase } from "@/integrations/supabase/client";

export interface FoundationSession {
  id: string;
  user_id: string;
  started_at: string;
  ends_at: string;
  duration_months: number;
  commitment_why: string;
  commitment_want: string;
  stake_bump_sek: number;
  status: "active" | "completed" | "deactivated";
  deactivation_requested_at: string | null;
  deactivation_reason: string | null;
  ended_at: string | null;
}

export interface TriggerRow {
  id: string;
  created_at: string;
  underneath: string | null;
  redirect_chosen: string | null;
  redirect_completed: boolean;
  resolution: string | null;
}

export type TimeBand = "morning" | "afternoon" | "evening" | "late_night";

export function timeBand(d = new Date()): TimeBand {
  const h = d.getHours();
  if (h < 6) return "late_night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  if (h < 23) return "evening";
  return "late_night";
}

export interface Redirect { key: string; label: string; points: number; hint?: string; }

export function redirectsFor(band: TimeBand): Redirect[] {
  switch (band) {
    case "morning":
      return [
        { key: "walk_outside", label: "Walk outside 10 min", points: 800, hint: "Reset the day" },
        { key: "brain_dump", label: "Brain dump what's loud", points: 500 },
        { key: "message_someone", label: "Message one person", points: 800 },
      ];
    case "afternoon":
      return [
        { key: "pushups_20", label: "20 push-ups now", points: 1000 },
        { key: "step_outside", label: "Step outside, 5 min", points: 600 },
        { key: "queue_it", label: "Queue it for tonight", points: 400, hint: "Revisit later, deliberately" },
      ];
    case "evening":
      return [
        { key: "watch_saved", label: "Watch something you saved", points: 400 },
        { key: "brain_dump", label: "Brain dump what's actually up", points: 500 },
        { key: "message_someone", label: "Message one person — anyone", points: 800 },
      ];
    case "late_night":
      return [
        { key: "plan_trip", label: "Plan the next trip", points: 700, hint: "Channel the restlessness" },
        { key: "pushups_20", label: "20 push-ups, right now", points: 1000 },
        { key: "queue_it", label: "Queue it, revisit tomorrow", points: 400 },
      ];
  }
}

export function underneathChips(): string[] {
  return ["Boredom", "Loneliness", "Restlessness", "Stress", "Anger", "Sadness", "Just habit", "Not sure"];
}

export function weekStartISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // monday=0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export function monthStartISO(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

// Compute a 0-100 readiness score from the user's recent activity.
export interface ReadinessScore {
  physical: number; mental: number; social: number; regulation: number; total: number;
}

export async function computeReadiness(userId: string): Promise<ReadinessScore> {
  const since = new Date(); since.setDate(since.getDate() - 7);
  const sinceISO = since.toISOString();

  const [{ data: pts }, { data: dumps }, { data: triggers }] = await Promise.all([
    supabase.from("point_logs").select("action_key,domain,points,created_at")
      .eq("user_id", userId).gte("created_at", sinceISO).limit(500),
    supabase.from("brain_dumps").select("id,created_at")
      .eq("user_id", userId).gte("created_at", sinceISO).limit(50),
    supabase.from("foundation_triggers").select("id,redirect_completed,created_at")
      .eq("user_id", userId).gte("created_at", sinceISO).limit(50),
  ]);

  const rows = pts ?? [];
  const has = (k: string) => rows.filter((r) => r.action_key === k).length;
  const domSum = (d: string) => rows.filter((r) => r.domain === d).reduce((a, b) => a + b.points, 0);

  // Physical: gym/sport sessions (target 3/wk), steps days. Counts legacy keys too.
  const gym = has("gym_session") + has("gym_with_hr") + has("sport_session");
  const stepsDays = has("steps") + has("steps_7k") + has("steps_10k");
  const sleep = has("sleep_quality");
  const physical = clamp01(gym / 3) * 60 + clamp01(stepsDays / 5) * 25 + clamp01(sleep / 5) * 15;

  // Mental: brain dumps + reading + language
  const dumpsN = (dumps ?? []).length;
  const study = has("language_study") + has("reading") + has("course_lesson") + has("book_chapter");
  const mental = clamp01(dumpsN / 4) * 50 + clamp01(study / 4) * 50;

  // Social: left apartment + events + office
  const left = has("left_apartment");
  const events = has("group_event");
  const office = has("office_day");
  const social = clamp01(left / 5) * 50 + clamp01(events / 1) * 25 + clamp01(office / 2) * 25;

  // Self-regulation: triggers intercepted, no-binge (no spirals)
  const tr = triggers ?? [];
  const intercepted = tr.filter((t) => t.redirect_completed).length;
  const triggersN = tr.length;
  const interceptRate = triggersN ? intercepted / triggersN : 1;
  const spirals = rows.filter((r) => r.action_key === "spiral_logged").length;
  const regulation = interceptRate * 60 + clamp01(1 - spirals / 5) * 40;
  void domSum;

  const physical100 = Math.round(physical);
  const mental100 = Math.round(mental);
  const social100 = Math.round(social);
  const regulation100 = Math.round(regulation);
  const total = Math.round((physical100 + mental100 + social100 + regulation100) / 4);
  return { physical: physical100, mental: mental100, social: social100, regulation: regulation100, total };
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function readinessPhase(total: number): string {
  if (total <= 30) return "Foundation phase — focus on basics, not outcomes";
  if (total <= 55) return "Building phase — patterns are forming";
  if (total <= 75) return "Momentum phase — you're becoming someone different";
  return "Ready — not perfect, ready";
}
