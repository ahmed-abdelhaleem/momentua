// Built-in domain identifiers. Custom user-defined domains use arbitrary string keys,
// so anywhere a Domain is stored or rendered the value can also be a plain string.
export type BuiltinDomain = "physical" | "mental" | "social" | "self_regulation" | "consistency";
export type Domain = BuiltinDomain | string;

// Some actions naturally scale with a quantity the user enters at log-time
// (steps walked, minutes worked out, minutes studied). `scaling` describes
// the input control and how to turn a quantity into points.
export interface ScalingConfig {
  unit: string;          // short label shown in the input ("steps", "min")
  label: string;         // header label ("Steps", "Minutes")
  ptsPerUnit: number;    // points awarded per single unit
  min: number;
  max: number;
  step: number;
  default: number;       // pre-filled quantity in the confirm modal
}

export interface ActionDef {
  key: string;
  label: string;
  domain: Domain;
  points: number;        // baseline points (used when no scaling, or as preview)
  hint?: string;
  scaling?: ScalingConfig;
}

// Helper: compute points for an action given an optional quantity.
export function pointsForQuantity(a: Pick<ActionDef, "points" | "scaling">, quantity?: number): number {
  if (!a.scaling) return a.points;
  const q = Math.max(a.scaling.min, Math.min(a.scaling.max, Math.round(quantity ?? a.scaling.default)));
  return Math.round(q * a.scaling.ptsPerUnit);
}

export const ACTIONS: ActionDef[] = [
  // Physical
  {
    key: "gym_session", label: "Gym session", domain: "physical", points: 2400,
    scaling: { unit: "min", label: "Minutes", ptsPerUnit: 80, min: 10, max: 180, step: 5, default: 30 },
  },
  {
    key: "steps", label: "Steps walked", domain: "physical", points: 980,
    scaling: { unit: "steps", label: "Total steps", ptsPerUnit: 0.14, min: 1000, max: 30000, step: 500, default: 7000 },
  },
  {
    key: "sport_session", label: "Sport session", domain: "physical", points: 4200,
    scaling: { unit: "min", label: "Minutes", ptsPerUnit: 70, min: 10, max: 240, step: 5, default: 60 },
  },
  { key: "sleep_quality", label: "Slept 7–9 hours", domain: "physical", points: 600, hint: "Outside that range isn't tracked here — it doesn't mean you didn't sleep." },

  // Mental
  {
    key: "language_study", label: "Language study", domain: "mental", points: 1800,
    scaling: { unit: "min", label: "Minutes", ptsPerUnit: 90, min: 5, max: 120, step: 5, default: 20 },
  },
  {
    key: "reading", label: "Reading", domain: "mental", points: 900,
    scaling: { unit: "min", label: "Minutes", ptsPerUnit: 45, min: 5, max: 180, step: 5, default: 20 },
  },
  { key: "book_chapter", label: "Finished a book chapter", domain: "mental", points: 2000 },
  {
    key: "course_lesson", label: "Online course lesson", domain: "mental", points: 1200,
    scaling: { unit: "min", label: "Minutes", ptsPerUnit: 60, min: 5, max: 180, step: 5, default: 20 },
  },
  { key: "brain_dump", label: "Brain dump completed", domain: "mental", points: 500 },

  // Social
  { key: "left_apartment", label: "Left home (social)", domain: "social", points: 2000 },
  { key: "group_event", label: "Attended a group / class / event", domain: "social", points: 2800 },
  { key: "office_day", label: "Worked from office", domain: "social", points: 1500 },
  { key: "connected_person", label: "Connected w/ a person", domain: "social", points: 800 },

  // Self-regulation
  { key: "cook_breakfast", label: "Cooked breakfast", domain: "self_regulation", points: 400 },
  { key: "cook_lunch", label: "Cooked lunch", domain: "self_regulation", points: 600 },
  { key: "cook_dinner", label: "Cooked dinner", domain: "self_regulation", points: 700 },
  { key: "supermarket_run", label: "Supermarket run", domain: "self_regulation", points: 500 },
  { key: "no_delivery", label: "No food delivery today", domain: "self_regulation", points: 700 },
  { key: "screen_free_hour", label: "Screen-free hour (evening)", domain: "self_regulation", points: 500 },
  { key: "completed_plan", label: "Completed daily plan", domain: "self_regulation", points: 1000 },
  { key: "no_impulse_buy", label: "No impulse purchase today", domain: "self_regulation", points: 400 },

  // NourishPlan
  { key: "meal_plan_created", label: "Plan tomorrow's meals", domain: "self_regulation", points: 600 },
  { key: "meal_shopped", label: "Shopped as planned", domain: "self_regulation", points: 800 },
  { key: "meal_ate_as_planned", label: "Ate as planned (self-log)", domain: "self_regulation", points: 500 },
  { key: "meal_morning_checkin", label: "Logged yesterday's eating", domain: "self_regulation", points: 400 },
];

// Action keys that NourishPlan owns — used for streak math + dashboard wiring.
export const MEAL_ACTION_KEYS = {
  PLAN: "meal_plan_created",
  SHOP: "meal_shopped",
  ATE: "meal_ate_as_planned",
  CHECKIN: "meal_morning_checkin",
} as const;

export const DOMAIN_META: Record<BuiltinDomain, { label: string; tokenClass: string; emoji: string }> = {
  physical: { label: "Physical", tokenClass: "text-domain-physical", emoji: "⚡" },
  mental: { label: "Mental & Learning", tokenClass: "text-domain-mental", emoji: "✦" },
  social: { label: "Social", tokenClass: "text-domain-social", emoji: "◆" },
  self_regulation: { label: "Self-regulation", tokenClass: "text-domain-self", emoji: "◐" },
  consistency: { label: "Consistency", tokenClass: "text-domain-streak", emoji: "▲" },
};

export const STAKE_TIERS = [
  { key: "starter", label: "Starter", monthly: 500 },
  { key: "standard", label: "Standard", monthly: 1000 },
  { key: "committed", label: "Committed", monthly: 2000 },
  { key: "all_in", label: "All-in", monthly: 5000 },
] as const;

export const MONTHLY_TARGET_POINTS = 100_000; // standard tier reference
