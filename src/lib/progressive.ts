// Progressive (streak-based) point multipliers.
// Rules are evaluated from the user's point_logs history.

export type StreakRule =
  | { kind: "weekly_quota"; perWeek: number; bonusPerLevel: number; maxLevel: number; unitLabel?: string }
  | { kind: "daily_chain"; daysPerLevel: number; bonusPerLevel: number; maxLevel: number; unitLabel?: string };

// action_key -> rule. Multiple keys can share progress via `groupKey`.
export const STREAK_RULES: Record<string, StreakRule & { groupKeys?: string[]; label: string }> = {
  // Gym: 3x / week (covers "every other day" cadence too)
  gym_session: {
    kind: "weekly_quota", perWeek: 3, bonusPerLevel: 0.2, maxLevel: 10,
    label: "Gym streak", unitLabel: "wk", groupKeys: ["gym_session", "gym_with_hr"],
  },
  gym_with_hr: {
    kind: "weekly_quota", perWeek: 3, bonusPerLevel: 0.2, maxLevel: 10,
    label: "Gym streak", unitLabel: "wk", groupKeys: ["gym_session", "gym_with_hr"],
  },
  // No food delivery: daily chain. Every 30 consecutive days = +1 level. Capped at 9 (≈ 9 months).
  no_delivery: {
    kind: "daily_chain", daysPerLevel: 30, bonusPerLevel: 0.25, maxLevel: 9,
    label: "No-delivery chain", unitLabel: "mo",
  },
  // Supermarket: 2x / week
  supermarket_run: {
    kind: "weekly_quota", perWeek: 2, bonusPerLevel: 0.2, maxLevel: 10,
    label: "Supermarket streak", unitLabel: "wk",
  },
  // Cooking quotas
  cook_breakfast: {
    kind: "weekly_quota", perWeek: 5, bonusPerLevel: 0.15, maxLevel: 10,
    label: "Breakfast streak", unitLabel: "wk",
  },
  cook_lunch: {
    kind: "weekly_quota", perWeek: 3, bonusPerLevel: 0.2, maxLevel: 10,
    label: "Lunch streak", unitLabel: "wk",
  },
  cook_dinner: {
    kind: "weekly_quota", perWeek: 3, bonusPerLevel: 0.2, maxLevel: 10,
    label: "Dinner streak", unitLabel: "wk",
  },
};

export interface StreakState {
  level: number;          // completed levels, drives multiplier
  multiplier: number;     // applied to NEXT log
  progress: string;       // human label, e.g. "3/5 this week" or "12 day chain"
  isActive: boolean;      // currently building or carrying a chain
  currentInWindow: number; // logs in current period (for quotas)
  required: number;        // perWeek or daysPerLevel
}

// ISO week key: YYYY-Www (Monday start)
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

export function computeStreak(actionKey: string, allKeyLogs: Date[]): StreakState | null {
  const rule = STREAK_RULES[actionKey];
  if (!rule) return null;

  if (rule.kind === "weekly_quota") {
    const counts = new Map<string, number>();
    for (const d of allKeyLogs) {
      const k = isoWeek(d);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const now = new Date();
    const currentWeek = isoWeek(now);
    const currentInWindow = counts.get(currentWeek) ?? 0;

    // Walk back from previous week, counting consecutive complete weeks.
    let level = 0;
    const cursor = new Date(now);
    cursor.setDate(cursor.getDate() - 7);
    while (level < rule.maxLevel) {
      const k = isoWeek(cursor);
      if ((counts.get(k) ?? 0) >= rule.perWeek) {
        level++;
        cursor.setDate(cursor.getDate() - 7);
      } else break;
    }
    // If current week already complete, count it too (so the bonus locks in immediately).
    if (currentInWindow >= rule.perWeek && level < rule.maxLevel) level += 1;

    const multiplier = 1 + rule.bonusPerLevel * level;
    return {
      level,
      multiplier: Math.round(multiplier * 100) / 100,
      progress: `${currentInWindow}/${rule.perWeek} this week`,
      isActive: level > 0 || currentInWindow > 0,
      currentInWindow,
      required: rule.perWeek,
    };
  }

  // daily_chain
  const days = new Set(allKeyLogs.map(dayKey));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  // Streak ends at today if logged today, else yesterday (so they keep it by logging today).
  let chainDays = 0;
  let cursor = new Date(today);
  if (!days.has(dayKey(today)) && days.has(dayKey(yesterday))) cursor = yesterday;
  while (days.has(dayKey(cursor))) {
    chainDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const level = Math.min(rule.maxLevel, Math.floor(chainDays / rule.daysPerLevel));
  const multiplier = 1 + rule.bonusPerLevel * level;
  return {
    level,
    multiplier: Math.round(multiplier * 100) / 100,
    progress: `${chainDays} day chain`,
    isActive: chainDays > 0,
    currentInWindow: chainDays,
    required: rule.daysPerLevel,
  };
}

// Resolve effective key set (group) for a rule
export function keysForRule(actionKey: string): string[] {
  const r = STREAK_RULES[actionKey];
  if (!r) return [actionKey];
  return r.groupKeys ?? [actionKey];
}

export const ALL_STREAK_KEYS: string[] = Array.from(
  new Set(Object.keys(STREAK_RULES).flatMap(keysForRule))
);
