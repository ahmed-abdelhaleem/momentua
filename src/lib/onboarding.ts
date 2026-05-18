import type { Domain } from "@/lib/points-catalog";

export type OnboardingAnswers = Record<string, string | string[]>;

export interface DashboardPrefs {
  showRoutines: { morning: boolean; midday: boolean; evening: boolean };
  hiddenDomains: Domain[];
  pinnedActions: string[];
  showSpiral: boolean;
  showStakes: boolean;
}

export const DEFAULT_PREFS: DashboardPrefs = {
  showRoutines: { morning: true, midday: true, evening: true },
  hiddenDomains: [],
  pinnedActions: [],
  showSpiral: true,
  showStakes: true,
};

export interface OnboardingQuestion {
  id: string;
  prompt: string;
  help?: string;
  multi?: boolean;
  options: { value: string; label: string }[];
}

export const QUESTIONS: OnboardingQuestion[] = [
  {
    id: "subtype",
    prompt: "Which attention pattern fits you best right now?",
    help: "No diagnosis needed — this just tunes how the app talks to you.",
    options: [
      { value: "inattentive", label: "Mostly inattentive — drift, forget, lose time" },
      { value: "hyperactive", label: "Restless / impulsive — can't sit still" },
      { value: "combined", label: "Both — drift and restlessness" },
      { value: "neither", label: "Neither really — I just want better consistency" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    id: "biggest_friction",
    prompt: "What ruins your days most?",
    multi: true,
    options: [
      { value: "starting", label: "Starting tasks (initiation)" },
      { value: "finishing", label: "Finishing what I start" },
      { value: "switching", label: "Switching between tasks" },
      { value: "doomscroll", label: "Doomscrolling / binge searching" },
      { value: "sleep", label: "Sleep schedule" },
      { value: "food", label: "Food / eating habits" },
      { value: "movement", label: "Moving my body" },
      { value: "social", label: "Going outside / socializing" },
      { value: "money", label: "Money / impulsive spending" },
    ],
  },
  {
    id: "energy_peak",
    prompt: "When are you most useful?",
    options: [
      { value: "morning", label: "Morning person" },
      { value: "midday", label: "Midday" },
      { value: "evening", label: "Evening / night owl" },
      { value: "chaotic", label: "Random — chaotic" },
    ],
  },
  {
    id: "motivation",
    prompt: "What actually moves you to act?",
    options: [
      { value: "stakes", label: "Saving toward a personal goal" },
      { value: "streak", label: "Streaks / not breaking the chain" },
      { value: "points", label: "Points & gamification" },
      { value: "accountability", label: "Someone watching / coach" },
      { value: "novelty", label: "Novelty / new tricks" },
    ],
  },
  {
    id: "sensory",
    prompt: "Sensory needs?",
    multi: true,
    options: [
      { value: "low_stim", label: "Need low stimulation (quiet, dim)" },
      { value: "high_stim", label: "Need high stimulation (music, motion)" },
      { value: "tactile", label: "Fidget / tactile helps" },
      { value: "none", label: "Not really a factor" },
    ],
  },
  {
    id: "time_blindness",
    prompt: "How bad is time blindness?",
    options: [
      { value: "mild", label: "Mild — usually on time" },
      { value: "moderate", label: "Moderate — frequently late or surprised" },
      { value: "severe", label: "Severe — time barely exists" },
    ],
  },
  {
    id: "rewards",
    prompt: "Reward style you respond to?",
    options: [
      { value: "small_often", label: "Small wins, often" },
      { value: "big_milestones", label: "Big milestones" },
      { value: "social_proof", label: "Sharing wins / showing up" },
      { value: "money_back", label: "Hitting a savings target each month" },
    ],
  },
  {
    id: "domain_focus",
    prompt: "Which areas matter most right now?",
    multi: true,
    options: [
      { value: "physical", label: "Physical (gym, walking, sleep)" },
      { value: "mental", label: "Mental & learning" },
      { value: "social", label: "Social / leaving the house" },
      { value: "self_regulation", label: "Self-regulation (food, screens, money)" },
    ],
  },
];

export function derivePrefs(answers: OnboardingAnswers): DashboardPrefs {
  const focus = (answers.domain_focus as string[] | undefined) ?? [];
  const friction = (answers.biggest_friction as string[] | undefined) ?? [];
  const peak = answers.energy_peak as string | undefined;
  const motivation = answers.motivation as string | undefined;

  const allDomains: Domain[] = ["physical", "mental", "social", "self_regulation"];
  const hiddenDomains: Domain[] = focus.length > 0
    ? allDomains.filter((d) => !focus.includes(d))
    : [];

  const showRoutines = {
    morning: peak !== "evening",
    midday: peak !== "evening",
    evening: peak !== "morning",
  };

  const pinned: string[] = [];
  if (friction.includes("doomscroll")) pinned.push("screen_free_hour");
  if (friction.includes("sleep")) pinned.push("sleep_quality");
  if (friction.includes("movement")) pinned.push("steps", "gym_session");
  if (friction.includes("social")) pinned.push("left_apartment");
  if (friction.includes("food")) pinned.push("cook_lunch", "no_delivery");
  if (friction.includes("money")) pinned.push("no_impulse_buy");

  return {
    showRoutines,
    hiddenDomains,
    pinnedActions: pinned,
    showSpiral: friction.includes("doomscroll") || true,
    showStakes: motivation === "stakes" || motivation === "money_back" || true,
  };
}
