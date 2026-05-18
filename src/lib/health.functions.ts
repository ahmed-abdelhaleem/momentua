import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Workout = z.object({
  kind: z.enum(["walk", "run", "gym", "yoga", "bike", "other"]),
  minutes: z.number().int().min(1).max(600),
});

const HealthInput = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(200000),
  sleep_hours: z.number().min(0).max(24),
  workouts: z.array(Workout).max(10),
});

export type HealthEntryInput = z.infer<typeof HealthInput>;

export function computeHealthPoints(d: { steps: number; sleep_hours: number; workouts: { minutes: number }[] }) {
  const stepPts = Math.floor(d.steps / 1000);
  const sleepPts = d.sleep_hours >= 7 ? 5 : d.sleep_hours >= 6 ? 2 : 0;
  const workoutPts = d.workouts.reduce((s, w) => s + Math.floor(w.minutes / 10), 0);
  return stepPts + sleepPts + workoutPts;
}

export const getHealthEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entry_date: string }) => z.object({ entry_date: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("health_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", data.entry_date)
      .maybeSingle();
    return { entry: row };
  });

export const confirmHealthEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: HealthEntryInput) => HealthInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const points = computeHealthPoints(data);

    const { data: existing } = await supabase
      .from("health_entries")
      .select("points_awarded")
      .eq("user_id", userId)
      .eq("entry_date", data.entry_date)
      .maybeSingle();

    const previous = existing?.points_awarded ?? 0;
    const delta = points - previous;

    const { error: upsertErr } = await supabase.from("health_entries").upsert(
      {
        user_id: userId,
        entry_date: data.entry_date,
        steps: data.steps,
        sleep_hours: data.sleep_hours,
        workouts: data.workouts,
        points_awarded: points,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entry_date" }
    );
    if (upsertErr) throw new Error(upsertErr.message);

    if (delta !== 0) {
      await supabase.from("point_logs").insert({
        user_id: userId,
        action_key: "health.daily",
        action_label: `Health day (${data.entry_date})`,
        domain: "physical",
        points: delta,
        notes: `steps:${data.steps} sleep:${data.sleep_hours}h workouts:${data.workouts.length}`,
      });
    }

    return { points, delta };
  });
