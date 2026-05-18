import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ACTIONS, MONTHLY_TARGET_POINTS, STAKE_TIERS, pointsForQuantity, type Domain, type ScalingConfig } from "@/lib/points-catalog";
import { useCustomDomains, getDomainMeta, getAllDomainKeys, BUILTIN_DOMAIN_KEYS } from "@/lib/custom-domains";
import { toast } from "sonner";
import { Bell, BellOff, Flame, Target, Plus, X, Settings2, Sunrise, Sun, Moon, AlertTriangle, TrendingUp, Sparkles, Utensils, ChevronDown, CalendarDays } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ALL_STREAK_KEYS, STREAK_RULES, computeStreak, keysForRule, type StreakState } from "@/lib/progressive";
import { DEFAULT_PREFS, type DashboardPrefs } from "@/lib/onboarding";
import { PointsCounter } from "@/components/PointsCounter";
import { StreakFlame } from "@/components/StreakFlame";
import { LiveFeedStrip } from "@/components/LiveFeedStrip";
import { SurpriseBanner } from "@/components/SurpriseBanner";
import { ScratchCard } from "@/components/ScratchCard";
import { ComebackAmplifier } from "@/components/ComebackAmplifier";
import { DayCompleteOverlay } from "@/components/DayCompleteOverlay";
import { getActiveMultiplier, consumeBoost, shouldShowComeback, shouldFireDayComplete, markDayCompleteFired } from "@/lib/rewards";
import { pushSupported, pushIsSubscribed, subscribePush } from "@/lib/push";
import { sendTestPush } from "@/lib/notifications.functions";
import { InsightsCard } from "@/components/InsightsCard";
import { VaultPanel } from "@/components/VaultPanel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Today — MOMENTUM" },
      { name: "description", content: "Your daily MOMENTUM dashboard: log behavior, track streaks, recover your stake, and act on ACE insights." },
      { property: "og:title", content: "Today — MOMENTUM" },
      { property: "og:description", content: "Log today's actions, watch your stake recover in real time, and stay ahead of decay." },
      { property: "og:url", content: "https://stakes-and-streaks.lovable.app/dashboard" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

interface PointLog { id: string; action_key: string; action_label: string; domain: Domain; points: number; created_at: string; }
type Range = "day" | "week" | "month";

const CUSTOM_KEY = "momentum:custom-actions";
const CUSTOM_ROUTINES_KEY = "momentum:custom-routines";
const OVERRIDE_KEY = "momentum:point-overrides";
const ONCE_KEY = "momentum:once-per-day";
const HIDDEN_KEY = "momentum:hidden-actions";
const SPIRAL_DEDUCT_KEY = "momentum:spiral-deduct";

type CustomAction = { key: string; label: string; domain: Domain; points: number };
type CustomRoutineItem = { key: string; label: string; domain: Domain; points: number };
type CustomRoutinesMap = Record<string, CustomRoutineItem[]>;
type ActionLike = { key: string; label: string; domain: Domain; points: number; group?: string; scaling?: ScalingConfig };

function loadJSON<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { return JSON.parse(localStorage.getItem(k) || "null") ?? fb; } catch { return fb; }
}
function saveJSON(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)); }

function rangeStart(r: Range): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "day") return d;
  if (r === "week") { d.setDate(d.getDate() - 6); return d; }
  d.setDate(1); return d;
}

// Routine presets — once/day by default. Only universal basics ship by default;
// everything personal (skincare, medications, supplements, journaling, prayer, etc.)
// is added by the user via the "+ Add" button on each routine card.
type RoutineId = "morning" | "midday" | "evening";
const ROUTINES: { id: RoutineId; label: string; icon: typeof Sunrise; items: ActionLike[] }[] = [
  {
    id: "morning", label: "Morning routine", icon: Sunrise,
    items: [
      { key: "rt_morning_shower", label: "Shower", domain: "self_regulation", points: 200 },
      { key: "rt_morning_brush", label: "Brush teeth", domain: "self_regulation", points: 150 },
    ],
  },
  {
    id: "midday", label: "Midday reset", icon: Sun,
    items: [],
  },
  {
    id: "evening", label: "Evening routine", icon: Moon,
    items: [
      { key: "rt_evening_shower", label: "Shower", domain: "self_regulation", points: 200 },
      { key: "rt_evening_brush", label: "Brush teeth", domain: "self_regulation", points: 150 },
    ],
  },
];

// Built-in once/day defaults — anything that can only meaningfully happen once in a day.
const DEFAULT_ONCE_PER_DAY = new Set<string>([
  // sleep & daily-plan
  "sleep_quality", "completed_plan", "no_delivery", "no_impulse_buy",
  // physical (one main session per day) — covers new + legacy keys
  "gym_session", "gym_with_hr", "sport_session", "steps", "steps_7k", "steps_10k",
  // mental — one focused study session
  "language_study",
  // social — one per day
  "office_day", "left_apartment", "group_event",
  // self-regulation — one per day each
  "cook_breakfast", "cook_lunch", "cook_dinner", "supermarket_run", "screen_free_hour",
  // nourish flow — one per day each
  "meal_plan_created", "meal_shopped", "meal_ate_as_planned", "meal_morning_checkin",
  // all morning/midday/evening routine items
  ...ROUTINES.flatMap((g) => g.items.map((i) => i.key)),
]);

// How many days back the user can still LOG points for. Older days are read-only.
const LOG_WINDOW_DAYS = 2;
function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function Dashboard() {
  const { user, session } = useAuth();
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<PointLog[]>([]);
  const [todayLogs, setTodayLogs] = useState<PointLog[]>([]);
  const [energy, setEnergy] = useState<number | null>(null);
  const [commitment, setCommitment] = useState("");
  const [stake, setStake] = useState<{ monthly_amount_sek: number; recovered_amount_sek: number } | null>(null);
  const [streak, setStreak] = useState(0);
  const [filter, setFilter] = useState<Domain | "all">("all");
  const [range, setRange] = useState<Range>("day");
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
  const [insight, setInsight] = useState<{ content: string; created_at: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [custom, setCustom] = useState<CustomAction[]>([]);
  const [customRoutines, setCustomRoutines] = useState<CustomRoutinesMap>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [onceMap, setOnceMap] = useState<Record<string, boolean>>({});
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [cLabel, setCLabel] = useState("");
  const [cPoints, setCPoints] = useState(500);
  const [cDomain, setCDomain] = useState<Domain>("self_regulation");
  const [customDomains, setCustomDomains] = useCustomDomains();
  const [showDomainsForm, setShowDomainsForm] = useState(false);
  const [newDomainLabel, setNewDomainLabel] = useState("");
  const [newDomainEmoji, setNewDomainEmoji] = useState("✨");
  const allDomainKeys = useMemo(() => getAllDomainKeys(customDomains), [customDomains]);
  const [editing, setEditing] = useState<CustomAction | null>(null);
  // Routine item editor state
  const [routineEditor, setRoutineEditor] = useState<{ routineId: string; item: CustomRoutineItem | null } | null>(null);
  const [rLabel, setRLabel] = useState("");
  const [rPoints, setRPoints] = useState(200);
  const [rDomain, setRDomain] = useState<Domain>("self_regulation");
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionLike | null>(null);
  const [confirmQty, setConfirmQty] = useState<number | null>(null);
  const [spiralOpen, setSpiralOpen] = useState(false);
  const [spiralMin, setSpiralMin] = useState(15);
  const [spiralTopic, setSpiralTopic] = useState("");
  const [spiralNote, setSpiralNote] = useState("");
  const [spiralDeduct, setSpiralDeduct] = useState(false);
  const [streakLogs, setStreakLogs] = useState<Record<string, Date[]>>({});
  const [mealStreak, setMealStreak] = useState(0);
  const [tomorrowShopStatus, setTomorrowShopStatus] = useState<"none" | "list_ready" | "shop_needed" | "delivered">("none");
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const [showComeback, setShowComeback] = useState(false);
  const [dayComplete, setDayComplete] = useState<number | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  // Selected day for viewing/logging. Defaults to today; user can pick any past date.
  const [logDate, setLogDate] = useState<string>(todayStr);
  const isToday = logDate === todayStr;
  const daysBack = daysBetween(logDate, todayStr); // positive = past
  const logLocked = daysBack > LOG_WINDOW_DAYS;
  // Section open/closed state — persisted in localStorage so users keep their preferred view.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCustom(loadJSON<CustomAction[]>(CUSTOM_KEY, []));
    setOverrides(loadJSON<Record<string, number>>(OVERRIDE_KEY, {}));
    setCustomRoutines(loadJSON<CustomRoutinesMap>(CUSTOM_ROUTINES_KEY, {}));
    setOnceMap(loadJSON<Record<string, boolean>>(ONCE_KEY, {}));
    setHiddenMap(loadJSON<Record<string, boolean>>(HIDDEN_KEY, {}));
    setSpiralDeduct(loadJSON<boolean>(SPIRAL_DEDUCT_KEY, false));
    setOpenSections(loadJSON<Record<string, boolean>>("momentum:dash-sections", {
      stake: true, routines: true, tracking: true, log: true, recent: true, morning: true, insight: false,
    }));
  }, []);
  useEffect(() => { if (user) void load(); }, [user, range, logDate]);

  // Comeback detection — query latest log once on mount per user
  useEffect(() => {
    if (!user) return;
    void supabase.from("point_logs").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (shouldShowComeback(data?.created_at ?? null)) setShowComeback(true); });
  }, [user]);

  // Day-complete moment when crossing threshold
  const todayTotal = useMemo(() => todayLogs.reduce((s, l) => s + l.points, 0), [todayLogs]);
  useEffect(() => {
    if (shouldFireDayComplete(todayTotal)) {
      setDayComplete(todayTotal);
      markDayCompleteFired();
    }
  }, [todayTotal]);

  async function load() {
    if (!user) return;
    const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
    // Day bucket follows the selected date (logDate), not real today.
    const ds = new Date(`${logDate}T00:00:00`);
    const dsEnd = new Date(`${logDate}T23:59:59.999`);
    const rs = rangeStart(range);

    const streakWindow = new Date(); streakWindow.setDate(streakWindow.getDate() - 280);

    const [rangeRes, monthRes, todayRes, ckRes, stakeRes, streakRes, streakKeysRes, profRes, insRes] = await Promise.all([
      supabase.from("point_logs").select("*").eq("user_id", user.id).gte("created_at", rs.toISOString()).order("created_at", { ascending: false }),
      supabase.from("point_logs").select("*").eq("user_id", user.id).gte("created_at", ms.toISOString()).order("created_at", { ascending: false }),
      supabase.from("point_logs").select("*").eq("user_id", user.id).gte("created_at", ds.toISOString()).lte("created_at", dsEnd.toISOString()),
      supabase.from("daily_checkins").select("*").eq("user_id", user.id).eq("checkin_date", logDate).maybeSingle(),
      supabase.from("stakes").select("*").eq("user_id", user.id).eq("month_start", ms.toISOString().slice(0, 10)).maybeSingle(),
      supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("point_logs").select("action_key,created_at").eq("user_id", user.id).in("action_key", ALL_STREAK_KEYS).gte("created_at", streakWindow.toISOString()),
      supabase.from("profiles").select("dashboard_prefs").eq("id", user.id).maybeSingle(),
      supabase.from("ace_insights").select("content,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profRes.data?.dashboard_prefs) setPrefs({ ...DEFAULT_PREFS, ...(profRes.data.dashboard_prefs as Partial<DashboardPrefs>) });
    if (insRes.data) setInsight(insRes.data as { content: string; created_at: string });
    setLogs((rangeRes.data as PointLog[]) ?? []);
    setMonthLogs((monthRes.data as PointLog[]) ?? []);
    setTodayLogs((todayRes.data as PointLog[]) ?? []);
    if (ckRes.data) { setEnergy(ckRes.data.energy ?? null); setCommitment(ckRes.data.morning_commitment ?? ""); }
    else { setEnergy(null); setCommitment(""); }
    setStake(stakeRes.data ?? null);
    setStreak(streakRes.data?.current_days ?? 0);
    const sl: Record<string, Date[]> = {};
    for (const row of (streakKeysRes.data ?? []) as { action_key: string; created_at: string }[]) {
      (sl[row.action_key] ||= []).push(new Date(row.created_at));
    }
    setStreakLogs(sl);

    // Meal streak: consecutive prior days where ate_as_planned in (yes, partly).
    // Plus tomorrow's shop status badge.
    const mealWindowStart = new Date(); mealWindowStart.setDate(mealWindowStart.getDate() - 60);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const [{ data: mealRows }, { data: tomorrowRow }] = await Promise.all([
      supabase.from("meal_plans").select("plan_date,ate_as_planned").eq("user_id", user.id).gte("plan_date", mealWindowStart.toISOString().slice(0, 10)).order("plan_date", { ascending: false }),
      supabase.from("meal_plans").select("shop_status").eq("user_id", user.id).eq("plan_date", tomorrowStr).maybeSingle(),
    ]);
    const success = new Set((mealRows ?? []).filter((r) => r.ate_as_planned === "yes" || r.ate_as_planned === "partly").map((r) => r.plan_date as string));
    let count = 0;
    const cursor = new Date(); cursor.setDate(cursor.getDate() - 1); // start from yesterday (today's status not yet determined)
    while (success.has(cursor.toISOString().slice(0, 10))) { count++; cursor.setDate(cursor.getDate() - 1); }
    setMealStreak(count);
    setTomorrowShopStatus((tomorrowRow?.shop_status as "list_ready" | "shop_needed" | "delivered" | undefined) ?? "none");
  }

  const rangePoints = useMemo(() => logs.reduce((s, l) => s + l.points, 0), [logs]);
  const monthPoints = useMemo(() => monthLogs.reduce((s, l) => s + l.points, 0), [monthLogs]);
  const monthlySek = stake?.monthly_amount_sek ?? 1000;
  const targetPoints = (monthlySek / 1000) * MONTHLY_TARGET_POINTS;
  const recovered = Math.min(Math.max(monthPoints, 0) / targetPoints, 1);

  const breakdown = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of logs) acc[l.domain] = (acc[l.domain] ?? 0) + l.points;
    return acc;
  }, [logs]);

  const doneTodayKeys = useMemo(() => new Set(todayLogs.map((l) => l.action_key)), [todayLogs]);

  function pointsFor(a: ActionLike) { return overrides[a.key] ?? a.points; }
  function isOncePerDay(a: ActionLike) {
    if (onceMap[a.key] !== undefined) return onceMap[a.key];
    if (DEFAULT_ONCE_PER_DAY.has(a.key)) return true;
    // Custom routine items default to once/day (key prefix rt_custom_).
    if (a.key.startsWith("rt_custom_")) return true;
    return false;
  }

  function streakFor(actionKey: string): StreakState | null {
    if (!STREAK_RULES[actionKey]) return null;
    const keys = keysForRule(actionKey);
    const dates = keys.flatMap((k) => streakLogs[k] ?? []);
    return computeStreak(actionKey, dates);
  }

  function previewPoints(a: ActionLike): { base: number; multiplier: number; total: number; streak: StreakState | null } {
    const base = pointsFor(a);
    const streak = streakFor(a.key);
    const mult = streak?.multiplier ?? 1;
    return { base, multiplier: mult, total: Math.round(base * mult), streak };
  }

  function requestLog(a: ActionLike) {
    if (logLocked) {
      toast.info(`Logging is locked for days older than ${LOG_WINDOW_DAYS} days back. You can still view this day.`);
      return;
    }
    if (isOncePerDay(a) && doneTodayKeys.has(a.key)) {
      toast.info(`${a.label} — already logged for this day.`);
      return;
    }
    setConfirmQty(a.scaling ? a.scaling.default : null);
    setConfirmAction({ ...a, points: previewPoints(a).total });
  }

  async function logAction(a: ActionLike) {
    if (!user) return;
    // For scaling actions, recompute base points from the entered quantity, then
    // re-apply streak + boost multipliers on top.
    const qty = a.scaling && confirmQty != null ? confirmQty : null;
    const baseAction: ActionLike = qty != null && a.scaling
      ? { ...a, points: pointsForQuantity({ points: a.points, scaling: a.scaling }, qty) }
      : a;
    const { base, multiplier, total: streakTotal } = previewPoints(baseAction);
    const { mult: extraMult, source: extraLabel } = getActiveMultiplier();
    const total = Math.round(streakTotal * extraMult);
    // If user picked a past date, stamp created_at to noon local on that day so it lands in the right bucket.
    const backDated = logDate !== todayStr;
    const created_at = backDated ? new Date(`${logDate}T12:00:00`).toISOString() : undefined;
    const qtyLabel = qty != null && a.scaling ? ` · ${qty.toLocaleString()} ${a.scaling.unit}` : "";
    const finalLabel = `${a.label}${qtyLabel}${backDated ? ` · ${logDate}` : ""}`;
    const baseRow = {
      user_id: user.id, action_key: a.key,
      action_label: finalLabel,
      domain: a.domain, points: total,
      notes: qty != null && a.scaling ? `${a.scaling.label.toLowerCase()}:${qty}` : null,
    };
    const { error } = await supabase.from("point_logs").insert(
      (created_at ? { ...baseRow, created_at } : baseRow) as never,
    );
    if (error) return toast.error(error.message);
    if (extraMult > 1 && !backDated) consumeBoost();
    const parts: string[] = [];
    if (multiplier > 1) parts.push(`×${multiplier} streak`);
    if (extraMult > 1 && !backDated) parts.push(`${extraLabel}`);
    const bonusMsg = parts.length ? ` (${parts.join(" · ")}, base ${base.toLocaleString()})` : "";
    toast.success(`+${total.toLocaleString()} pts — ${finalLabel}${bonusMsg}`);
    setJustLogged(a.key);
    window.setTimeout(() => setJustLogged((k) => (k === a.key ? null : k)), 900);
    setConfirmAction(null);
    setConfirmQty(null);
    void load();
  }

  async function logSpiral() {
    if (!user) return;
    const min = Math.max(1, Math.min(240, Math.round(spiralMin)));
    const pts = spiralDeduct ? -Math.min(3000, 200 + min * 50) : 0;
    const topic = spiralTopic.trim() || "binge search";
    const note = spiralNote.trim();
    const label = `Spiral: ${topic} (${min}m)${note ? ` — ${note}` : ""}`;
    const { error } = await supabase.from("point_logs").insert({
      user_id: user.id, action_key: "spiral_logged", action_label: label, domain: "self_regulation", points: pts,
    });
    if (error) return toast.error(error.message);
    toast.success(pts < 0 ? `Logged. ${pts} pts — awareness > avoidance.` : `Logged. Awareness builds the loop.`);
    setSpiralOpen(false); setSpiralTopic(""); setSpiralNote(""); setSpiralMin(15);
    void load();
  }

  async function deleteLog(id: string) {
    if (!user) return;
    const { error } = await supabase.from("point_logs").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    void load();
  }

  async function saveCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("daily_checkins").upsert({
      user_id: user.id, checkin_date: logDate, energy, morning_commitment: commitment,
    }, { onConflict: "user_id,checkin_date" });
    if (error) return toast.error(error.message);
    toast.success("Locked in for today.");
  }

  async function pickStake(amount: number) {
    if (!user) return;
    const ms = new Date(); ms.setDate(1);
    const tier = amount === 500 ? "starter" : amount === 1000 ? "standard" : amount === 2000 ? "committed" : "all_in";
    const { error } = await supabase.from("stakes").upsert({
      user_id: user.id, tier, monthly_amount_sek: amount, month_start: ms.toISOString().slice(0, 10),
    }, { onConflict: "user_id,month_start" });
    if (error) return toast.error(error.message);
    toast.success(`Stake set: ${amount} SEK`);
    void load();
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    const label = cLabel.trim();
    if (!label) return;
    const pts = Math.max(50, Math.min(10_000, Math.round(cPoints)));
    if (editing) {
      const next = custom.map((c) => c.key === editing.key ? { ...editing, label, points: pts, domain: cDomain } : c);
      setCustom(next); saveJSON(CUSTOM_KEY, next);
    } else {
      const key = `custom_${Date.now()}`;
      const next = [...custom, { key, label, domain: cDomain, points: pts }];
      setCustom(next); saveJSON(CUSTOM_KEY, next);
    }
    setCLabel(""); setCPoints(500); setEditing(null); setShowCustomForm(false);
  }

  function startEdit(c: CustomAction) {
    setEditing(c); setCLabel(c.label); setCPoints(c.points); setCDomain(c.domain); setShowCustomForm(true);
  }

  function deleteCustom(key: string) {
    const next = custom.filter((c) => c.key !== key); setCustom(next); saveJSON(CUSTOM_KEY, next);
  }

  function openRoutineEditor(routineId: string, item: CustomRoutineItem | null) {
    setRoutineEditor({ routineId, item });
    setRLabel(item?.label ?? "");
    setRPoints(item?.points ?? 200);
    setRDomain(item?.domain ?? "self_regulation");
  }
  function closeRoutineEditor() {
    setRoutineEditor(null); setRLabel(""); setRPoints(200); setRDomain("self_regulation");
  }
  function submitRoutineItem(e: React.FormEvent) {
    e.preventDefault();
    if (!routineEditor) return;
    const label = rLabel.trim();
    if (!label) return;
    const pts = Math.max(50, Math.min(10_000, Math.round(rPoints)));
    const { routineId, item } = routineEditor;
    const existing = customRoutines[routineId] ?? [];
    let nextList: CustomRoutineItem[];
    if (item) {
      nextList = existing.map((i) => i.key === item.key ? { ...item, label, points: pts, domain: rDomain } : i);
    } else {
      const key = `rt_custom_${routineId}_${Date.now()}`;
      nextList = [...existing, { key, label, domain: rDomain, points: pts }];
    }
    const next = { ...customRoutines, [routineId]: nextList };
    setCustomRoutines(next); saveJSON(CUSTOM_ROUTINES_KEY, next);
    closeRoutineEditor();
  }
  function deleteRoutineItem(routineId: string, key: string) {
    const existing = customRoutines[routineId] ?? [];
    const next = { ...customRoutines, [routineId]: existing.filter((i) => i.key !== key) };
    setCustomRoutines(next); saveJSON(CUSTOM_ROUTINES_KEY, next);
  }

  function setOverride(key: string, pts: number) {
    const next = { ...overrides, [key]: Math.max(-5000, Math.min(10_000, Math.round(pts))) };
    setOverrides(next); saveJSON(OVERRIDE_KEY, next);
  }
  function clearOverride(key: string) {
    const next = { ...overrides }; delete next[key];
    setOverrides(next); saveJSON(OVERRIDE_KEY, next);
  }
  function toggleOnce(key: string, val: boolean) {
    const next = { ...onceMap, [key]: val };
    setOnceMap(next); saveJSON(ONCE_KEY, next);
  }
  function toggleHidden(key: string, val: boolean) {
    const next = { ...hiddenMap, [key]: val };
    if (!val) delete next[key];
    setHiddenMap(next); saveJSON(HIDDEN_KEY, next);
  }

  const allActions: ActionLike[] = [...ACTIONS, ...custom];
  const domainVisible = allActions.filter((a) => !prefs.hiddenDomains.includes(a.domain));
  const hiddenCount = domainVisible.filter((a) => hiddenMap[a.key]).length;
  const visibleActions = showHidden ? domainVisible : domainVisible.filter((a) => !hiddenMap[a.key]);
  const filteredActions = filter === "all" ? visibleActions : visibleActions.filter((a) => a.domain === filter);

  async function generateInsight() {
    if (!user || !session) return;
    setInsightLoading(true);
    try {
      const res = await fetch("/api/insights-generate", { method: "POST", headers: { authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error(await res.text());
      const ins = await res.json();
      setInsight(ins);
      toast.success("Fresh insight ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setInsightLoading(false); }
  }

  const renderActionCard = (a: ActionLike, isCustom: boolean) => {
    const done = isOncePerDay(a) && doneTodayKeys.has(a.key);
    const pts = pointsFor(a);
    const overridden = overrides[a.key] !== undefined;
    const streak = streakFor(a.key);
    const ruleMeta = STREAK_RULES[a.key];
    const boosted = streak ? Math.round(pts * streak.multiplier) : pts;
    return (
      <div key={a.key} className={`group relative overflow-hidden rounded-xl border bg-card p-4 transition ${done ? "border-primary/40 opacity-90" : "border-border hover:border-primary hover:shadow-stake"} ${hiddenMap[a.key] ? "opacity-50 border-dashed" : ""} ${justLogged === a.key ? "animate-lock-in" : ""}`}>
        {!done && <div className="shimmer-overlay" />}
        <button disabled={done} onClick={() => requestLog(a)} className="w-full text-left disabled:cursor-not-allowed">
          <div className={`text-xs font-mono uppercase ${getDomainMeta(a.domain, customDomains).tokenClass}`}>{getDomainMeta(a.domain, customDomains).emoji} {getDomainMeta(a.domain, customDomains).label}</div>
          <div className="font-display text-lg font-semibold mt-1 group-hover:text-primary">{a.label}</div>
          <div className="mt-2 flex items-center gap-2 font-mono text-sm flex-wrap">
            {streak && streak.multiplier > 1 ? (
              <>
                <span className="text-primary">+{boosted.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground line-through">{pts.toLocaleString()}</span>
              </>
            ) : (
              <span className={overridden ? "text-primary" : "text-muted-foreground"}>{pts >= 0 ? "+" : ""}{pts.toLocaleString()} pts</span>
            )}
            {overridden && <span className="text-[10px] uppercase tracking-widest text-primary/70">custom</span>}
            {done && <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">done today ✓</span>}
            {!done && isOncePerDay(a) && <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">1×/day</span>}
          </div>
          {ruleMeta && streak && (
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${streak.level > 0 ? "border-primary/60 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                <TrendingUp className="h-2.5 w-2.5" /> Lvl {streak.level} · ×{streak.multiplier}
              </span>
              <span className="text-muted-foreground truncate">{streak.progress}</span>
            </div>
          )}
        </button>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); setSettingsFor(settingsFor === a.key ? null : a.key); }} className="text-[10px] rounded-md border border-border px-2 py-0.5 hover:bg-accent flex items-center gap-1"><Settings2 className="h-3 w-3" /></button>
          {isCustom && (
            <>
              <button onClick={(e) => { e.stopPropagation(); startEdit(a as CustomAction); }} className="text-[10px] rounded-md border border-border px-2 py-0.5 hover:bg-accent">Edit</button>
              <button onClick={(e) => { e.stopPropagation(); deleteCustom(a.key); }} className="text-[10px] rounded-md border border-border px-2 py-0.5 hover:bg-destructive hover:text-destructive-foreground">Del</button>
            </>
          )}
        </div>
        {settingsFor === a.key && (
          <div className="mt-3 pt-3 border-t border-border space-y-2" onClick={(e) => e.stopPropagation()}>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Points</span>
              <input type="number" value={pts} onChange={(e) => setOverride(a.key, Number(e.target.value))} step={50} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs" />
              {overridden && <button onClick={() => clearOverride(a.key)} className="text-[10px] text-muted-foreground hover:text-foreground underline">reset</button>}
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={isOncePerDay(a)} onChange={(e) => toggleOnce(a.key, e.target.checked)} />
              <span>Limit to once per day</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={!!hiddenMap[a.key]} onChange={(e) => toggleHidden(a.key, e.target.checked)} />
              <span>Hide from list {hiddenMap[a.key] ? "(hidden)" : ""}</span>
            </label>
          </div>
        )}
      </div>
    );
  };

  const now = new Date();
  const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
  const todayPts = todayLogs.reduce((s, l) => s + l.points, 0);
  const atRisk = now.getHours() >= 18 && todayLogs.length === 0;

  return (
    <>
    {showComeback && <ComebackAmplifier onAccept={() => setShowComeback(false)} />}
    {dayComplete !== null && <DayCompleteOverlay points={dayComplete} onDone={() => setDayComplete(null)} />}
    <SurpriseBanner />
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{new Date(`${logDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="font-display text-5xl font-black mt-1 tracking-tight">{isToday ? "Today." : new Date(`${logDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }) + "."}</h1>
        </div>
      </div>

      {/* Date strip — pick which day you're viewing/logging for */}
      <DateStrip value={logDate} onChange={setLogDate} todayStr={todayStr} />
      {!isToday && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-mono flex items-center justify-between gap-2 ${logLocked ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"}`}>
          <span>
            {logLocked
              ? `View-only — ${daysBack} days back. Logging is locked beyond ${LOG_WINDOW_DAYS} days.`
              : `Logging for ${new Date(`${logDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} — past day. Streak boost & surprise multipliers don't apply.`}
          </span>
          <button onClick={() => setLogDate(todayStr)} className="underline shrink-0">Back to today</button>
        </div>
      )}

      {/* Hero: breathing points counter + flame */}
      <section className="mt-6 grid gap-6 md:grid-cols-[auto_1fr] items-center">
        <div className="flex justify-center md:justify-start">
          <PointsCounter points={monthPoints} recovered={recovered} monthlySek={monthlySek} isLastDayOfMonth={isLastDayOfMonth} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
            <StreakFlame days={streak} atRisk={atRisk} size={52} />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{atRisk ? "Streak at risk" : "Streak"}</div>
              <div className="font-display text-3xl font-black leading-none tabular-nums">{streak}<span className="text-base text-muted-foreground">d</span></div>
              <Link to="/nourish" className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary transition" title="Meal streak — separate from main streak">
                <Utensils className="h-2.5 w-2.5" /> Meals {mealStreak}d
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Target className="h-3 w-3 text-primary" /> Today</div>
            <div className="font-display text-3xl font-black tabular-nums">{todayPts.toLocaleString()}</div>
            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">{todayLogs.length} actions</div>
          </div>
        </div>
      </section>

      {/* Tomorrow's meal plan status */}
      <Link to="/nourish" className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary transition">
        <div className="flex items-center gap-3 min-w-0">
          <Utensils className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tomorrow</div>
            <div className="text-sm font-semibold truncate">
              {tomorrowShopStatus === "none" ? "Plan tomorrow's meals" : tomorrowShopStatus === "list_ready" ? "Plan ready · shopping list waiting" : tomorrowShopStatus === "delivered" ? "Plan ready · delivered ✓" : "Plan ready · shop needed"}
            </div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-widest ${
          tomorrowShopStatus === "delivered" ? "bg-primary/15 text-primary"
          : tomorrowShopStatus === "list_ready" ? "bg-secondary text-foreground"
          : tomorrowShopStatus === "shop_needed" ? "bg-destructive/15 text-destructive"
          : "border border-primary text-primary"
        }`}>
          {tomorrowShopStatus === "none" ? "+600 pts" : tomorrowShopStatus === "list_ready" ? "List ready" : tomorrowShopStatus === "delivered" ? "Delivered" : "Shop needed"}
        </span>
      </Link>

      <Link to="/integrations" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary transition">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Integrations</div>
            <div className="text-sm font-semibold truncate">Health · Banking</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-widest border border-primary text-primary">Open</span>
      </Link>

      <NotificationsCard />

      {/* Live trail — the social media feed equivalent, but for the user's own behavior */}
      <div className="mt-4">
        <LiveFeedStrip
          items={logs.slice(0, 12).map((l) => ({
            id: l.id,
            label: `${l.action_label} · ${l.points >= 0 ? "+" : ""}${l.points.toLocaleString()} pts`,
            createdAt: l.created_at,
            tone: l.points < 0 ? "burn" : "gold",
          }))}
        />
      </div>

      <VaultPanel monthPoints={monthPoints} targetPoints={targetPoints} />

      <section className="mt-8">
        <InsightsCard />
      </section>

      {/* Weekly scratch + AI insight */}
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <ScratchCard />
        <div className="rounded-2xl border border-primary/30 bg-card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Insight</div>
            <h2 className="font-display text-lg font-bold mt-1">{insight ? "Latest pattern read" : "No insight yet"}</h2>
            {insight && <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(insight.created_at).toLocaleString()}</p>}
          </div>
          <button onClick={generateInsight} disabled={insightLoading} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {insightLoading ? "Analyzing…" : insight ? "Refresh" : "Generate"}
          </button>
        </div>
        {insight && <div className="mt-3 text-sm whitespace-pre-wrap text-foreground/90">{insight.content}</div>}
        </div>
      </section>

      {/* Routines */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {ROUTINES.filter((r) => prefs.showRoutines[r.id]).map((g) => {
          const Icon = g.icon;
          const customItems = customRoutines[g.id] ?? [];
          const items: (ActionLike & { _custom?: boolean })[] = [
            ...g.items.map((i) => ({ ...i })),
            ...customItems.map((i) => ({ ...i, _custom: true })),
          ];
          const total = items.length;
          const done = items.filter((i) => doneTodayKeys.has(i.key)).length;
          return (
            <div key={g.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-base font-bold">{g.label}</h3>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{done}/{total}</span>
              </div>
              <div className="mt-3 space-y-2">
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">No items yet. Add your own below.</p>
                )}
                {items.map((it) => {
                  const isDone = doneTodayKeys.has(it.key);
                  const pts = pointsFor(it);
                  return (
                    <div key={it.key} className="group flex items-center gap-1">
                      <button disabled={isDone} onClick={() => requestLog(it)}
                        className={`flex-1 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${isDone ? "border-border/40 bg-background/40 text-muted-foreground line-through" : "border-border hover:border-primary hover:bg-accent/30"}`}>
                        <span className="truncate text-left">{it.label}</span>
                        <span className={`font-mono text-xs ${isDone ? "text-muted-foreground" : "text-primary"}`}>{isDone ? "✓" : `+${pts}`}</span>
                      </button>
                      {it._custom && (
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                          <button title="Edit"
                            onClick={() => openRoutineEditor(g.id, customItems.find((c) => c.key === it.key) ?? null)}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent">Edit</button>
                          <button title="Delete"
                            onClick={() => deleteRoutineItem(g.id, it.key)}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-destructive hover:text-destructive-foreground">Del</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button onClick={() => openRoutineEditor(g.id, null)}
                  className="w-full mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition flex items-center justify-center gap-1">
                  <Plus className="h-3 w-3" /> Add to {g.label.toLowerCase()}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Routine item editor modal */}
      {routineEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeRoutineEditor}>
          <form onSubmit={submitRoutineItem} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 space-y-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {ROUTINES.find((r) => r.id === routineEditor.routineId)?.label}
              </div>
              <h3 className="font-display text-lg font-bold mt-1">
                {routineEditor.item ? "Edit routine item" : "Add routine item"}
              </h3>
            </div>
            <label className="block text-xs">
              <span className="text-muted-foreground">Label</span>
              <input value={rLabel} onChange={(e) => setRLabel(e.target.value)} maxLength={80}
                placeholder="e.g. Stretch, Vitamins, Skincare…"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Points</span>
              <input type="number" value={rPoints} onChange={(e) => setRPoints(Number(e.target.value))} step={50} min={50} max={10000}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Domain</span>
              <select value={rDomain} onChange={(e) => setRDomain(e.target.value as Domain)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {allDomainKeys.map((d) => (
                  <option key={d} value={d}>{getDomainMeta(d, customDomains).label}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeRoutineEditor}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
              <button type="submit"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                {routineEditor.item ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Time range tracker */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tracking</div>
            <h2 className="font-display text-xl font-bold mt-1">
              {range === "day" ? "Today" : range === "week" ? "Last 7 days" : "This month"} — <span className="text-primary">{rangePoints.toLocaleString()} pts</span>
            </h2>
          </div>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 text-xs font-medium border transition ${range === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                {r === "day" ? "Day" : r === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {allDomainKeys.map((d) => {
            const pts = breakdown[d] ?? 0;
            const max = Math.max(1, ...Object.values(breakdown).map((v) => Math.abs(v)));
            return (
              <div key={d} className="rounded-lg border border-border/60 bg-background p-3">
                <div className={`text-[10px] font-mono uppercase tracking-widest ${getDomainMeta(d, customDomains).tokenClass}`}>{getDomainMeta(d, customDomains).emoji} {getDomainMeta(d, customDomains).label}</div>
                <div className="font-display text-lg font-bold mt-1">{pts.toLocaleString()}</div>
                <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full transition-all ${pts < 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${(Math.abs(pts) / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <form onSubmit={saveCheckin} className="rounded-2xl border border-border bg-card p-6">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Morning</div>
          <h2 className="font-display text-xl font-bold mt-1">Set the day in 30 seconds.</h2>
          <div className="mt-4">
            <label className="text-xs text-muted-foreground" id="energy-label">Energy</label>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-labelledby="energy-label">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setEnergy(n)} aria-label={`Energy level ${n} of 5`} aria-pressed={energy === n} className={`flex-1 rounded-lg border py-3 text-lg transition ${energy === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}>
                  {["💀", "😶", "🙂", "🔥", "⚡"][n - 1]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="commitment" className="text-xs text-muted-foreground">Today I will…</label>
            <input id="commitment" value={commitment} onChange={(e) => setCommitment(e.target.value)} maxLength={120} placeholder="One thing. Be specific." className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Lock it in</button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Recent</div>
              <h2 className="font-display text-xl font-bold mt-1">What you've banked ({range === "day" ? "today" : range === "week" ? "this week" : "this month"}).</h2>
            </div>
            <button onClick={() => setSpiralOpen(true)} title="Log a spiral / binge session" className="rounded-full px-3 py-1 text-xs font-semibold border border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground flex items-center gap-1 transition">
              <AlertTriangle className="h-3.5 w-3.5" /> Spiral
            </button>
          </div>
          <div className="mt-4 space-y-2 max-h-72 overflow-auto">
            {logs.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged yet. Pick something below.</p>}
            {logs.slice(0, 30).map((l) => (
              <div key={l.id} className="group flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                <span className="truncate">{getDomainMeta(l.domain, customDomains).emoji} {l.action_label}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono ${l.points < 0 ? "text-destructive" : "text-primary"}`}>{l.points >= 0 ? "+" : ""}{l.points.toLocaleString()}</span>
                  <button onClick={() => deleteLog(l.id)} title="Remove" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-primary">Log something</div>
            <h2 className="font-display text-3xl font-bold mt-1">Recover your stake.</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {(["all", ...allDomainKeys] as const).map((d) => (
                <button key={d} onClick={() => setFilter(d)} className={`rounded-full px-3 py-1 text-xs font-medium border transition ${filter === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                  {d === "all" ? "All" : getDomainMeta(d as Domain, customDomains).label}
                </button>
              ))}
            </div>
            <button onClick={() => { setEditing(null); setCLabel(""); setShowCustomForm((s) => !s); }} className="rounded-full px-3 py-1 text-xs font-semibold border border-primary text-primary hover:bg-primary hover:text-primary-foreground flex items-center gap-1 transition">
              <Plus className="h-3.5 w-3.5" /> Custom
            </button>
            <button onClick={() => setShowDomainsForm((s) => !s)} className="rounded-full px-3 py-1 text-xs font-semibold border border-border hover:bg-accent flex items-center gap-1 transition" title="Add or manage your own categories">
              <Settings2 className="h-3.5 w-3.5" /> Categories
            </button>
            {hiddenCount > 0 && (
              <button onClick={() => setShowHidden((s) => !s)} className={`rounded-full px-3 py-1 text-xs font-medium border transition ${showHidden ? "bg-accent border-primary text-primary" : "border-border hover:bg-accent text-muted-foreground"}`}>
                {showHidden ? `Hide hidden (${hiddenCount})` : `Show hidden (${hiddenCount})`}
              </button>
            )}
          </div>
        </div>

        {showDomainsForm && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Custom categories</div>
            <p className="text-xs text-muted-foreground mt-1">Add your own buckets (e.g. Creative, Finance, Spiritual). They show up in filters, the tracker, and every domain picker.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BUILTIN_DOMAIN_KEYS.map((d) => (
                <span key={d} className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                  {getDomainMeta(d, customDomains).emoji} {getDomainMeta(d, customDomains).label} <span className="opacity-50">· built-in</span>
                </span>
              ))}
              {customDomains.map((d) => (
                <span key={d.key} className="rounded-full border border-primary/60 px-3 py-1 text-xs flex items-center gap-2">
                  {d.emoji} {d.label}
                  <button
                    onClick={() => {
                      if (!confirm(`Remove category "${d.label}"? Existing logs keep their tag but the category vanishes from pickers.`)) return;
                      setCustomDomains(customDomains.filter((x) => x.key !== d.key));
                    }}
                    className="text-muted-foreground hover:text-destructive" title="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const label = newDomainLabel.trim();
                if (!label) return;
                const emoji = newDomainEmoji.trim().slice(0, 2) || "✨";
                const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "cat";
                const key = `cd_${slug}_${Date.now().toString(36)}`;
                setCustomDomains([...customDomains, { key, label, emoji }]);
                setNewDomainLabel(""); setNewDomainEmoji("✨");
              }}
              className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <input value={newDomainEmoji} onChange={(e) => setNewDomainEmoji(e.target.value)} maxLength={2} className="w-14 text-center rounded-lg border border-input bg-background px-2 py-2 text-lg" aria-label="Emoji" />
              <input value={newDomainLabel} onChange={(e) => setNewDomainLabel(e.target.value)} placeholder="Category name (e.g. Creative)" maxLength={32} className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add</button>
            </form>
          </div>
        )}

        {showCustomForm && (
          <form onSubmit={submitCustom} className="mt-5 rounded-2xl border border-primary/40 bg-card p-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="What did you do?" maxLength={60} className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={cDomain} onChange={(e) => setCDomain(e.target.value as Domain)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {allDomainKeys.map((d) => (
                <option key={d} value={d}>{getDomainMeta(d, customDomains).label}</option>
              ))}
            </select>
            <input type="number" value={cPoints} onChange={(e) => setCPoints(Number(e.target.value))} min={50} max={10000} step={50} className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{editing ? "Save" : "Add"}</button>
          </form>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredActions.map((a) => renderActionCard(a, custom.some((c) => c.key === a.key)))}
        </div>
      </section>

      {/* Confirm modal */}
      {confirmAction && (() => {
        const scaling = confirmAction.scaling;
        // Live points preview: when scaling, recompute from the quantity input + apply
        // the current streak multiplier so the user sees the real total before logging.
        const livePreview = (() => {
          if (!scaling || confirmQty == null) return confirmAction.points;
          const base = pointsForQuantity({ points: confirmAction.points, scaling }, confirmQty);
          const s = streakFor(confirmAction.key);
          const mult = s?.multiplier ?? 1;
          return Math.round((overrides[confirmAction.key] ?? base) * mult);
        })();
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => { setConfirmAction(null); setConfirmQty(null); }}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-stake" onClick={(e) => e.stopPropagation()}>
            <div className={`text-xs font-mono uppercase ${getDomainMeta(confirmAction.domain, customDomains).tokenClass}`}>{getDomainMeta(confirmAction.domain, customDomains).emoji} {getDomainMeta(confirmAction.domain, customDomains).label}</div>
            <h3 className="font-display text-2xl font-bold mt-1">{confirmAction.label}</h3>
            <p className="mt-2 text-sm text-muted-foreground">Confirm you actually did this. Honesty is the whole game.</p>

            {scaling && (
              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{scaling.label}</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={scaling.min} max={scaling.max} step={scaling.step}
                    value={confirmQty ?? scaling.default}
                    onChange={(e) => setConfirmQty(Math.max(scaling.min, Math.min(scaling.max, Number(e.target.value) || scaling.min)))}
                    className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm font-mono"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{scaling.unit}</span>
                </div>
                <input
                  type="range"
                  min={scaling.min} max={scaling.max} step={scaling.step}
                  value={confirmQty ?? scaling.default}
                  onChange={(e) => setConfirmQty(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>{scaling.min.toLocaleString()}</span>
                  <span>{scaling.max.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="mt-4 font-mono text-3xl font-black text-primary">+{livePreview.toLocaleString()} pts</div>
            {(() => {
              const s = streakFor(confirmAction.key);
              if (!s) return null;
              return (
                <div className="mt-2 text-xs font-mono text-muted-foreground">
                  Streak Lvl {s.level} · ×{s.multiplier} — {s.progress}
                </div>
              );
            })()}
            <div className="mt-6 flex gap-2">
              <button onClick={() => { setConfirmAction(null); setConfirmQty(null); }} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Cancel</button>
              <button onClick={() => logAction(confirmAction)} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Confirm</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Spiral modal */}
      {spiralOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setSpiralOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-stake" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-mono text-xs uppercase tracking-widest">Log a spiral</span>
            </div>
            <h3 className="font-display text-2xl font-bold mt-1">Caught yourself binging.</h3>
            <p className="mt-2 text-sm text-muted-foreground">Doom-scroll, product-search rabbit hole, political binge — naming it shrinks it. Logging it builds the awareness loop. Choose whether it costs points.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-muted-foreground">What were you searching / scrolling?
                <input value={spiralTopic} onChange={(e) => setSpiralTopic(e.target.value)} maxLength={80} placeholder="e.g. headphones research, news, X feed" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="text-xs text-muted-foreground">Roughly how many minutes?
                <input type="number" value={spiralMin} onChange={(e) => setSpiralMin(Number(e.target.value))} min={1} max={240} step={5} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted-foreground">Trigger or note (optional)
                <input value={spiralNote} onChange={(e) => setSpiralNote(e.target.value)} maxLength={120} placeholder="e.g. tired after work, anxious about X" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer rounded-lg border border-border bg-background px-3 py-2">
                <input type="checkbox" checked={spiralDeduct} onChange={(e) => { setSpiralDeduct(e.target.checked); saveJSON(SPIRAL_DEDUCT_KEY, e.target.checked); }} />
                <span className="flex-1">Subtract points for this spiral</span>
                <span className={`font-mono ${spiralDeduct ? "text-destructive" : "text-muted-foreground"}`}>
                  {spiralDeduct ? `${(-Math.min(3000, 200 + Math.max(1, Math.min(240, spiralMin)) * 50)).toLocaleString()} pts` : "0 pts"}
                </span>
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setSpiralOpen(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Cancel</button>
              <button onClick={logSpiral} className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90">Log it</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function DateStrip({ value, onChange, todayStr }: { value: string; onChange: (d: string) => void; todayStr: string }) {
  // Last 7 days strip + a native date input for going further back.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
      {days.map((d) => {
        const dt = new Date(`${d}T00:00:00`);
        const active = d === value;
        const isToday = d === todayStr;
        return (
          <button key={d} onClick={() => onChange(d)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-center transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"}`}>
            <div className="font-mono text-[9px] uppercase tracking-widest opacity-70">{isToday ? "Today" : dt.toLocaleDateString(undefined, { weekday: "short" })}</div>
            <div className="font-display text-sm font-bold tabular-nums">{dt.getDate()}</div>
          </button>
        );
      })}
      <label className="shrink-0 rounded-xl border border-dashed border-border bg-card px-3 py-2 flex items-center gap-1.5 cursor-pointer hover:border-primary/60">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="date"
          value={value}
          max={todayStr}
          onChange={(e) => onChange(e.target.value || todayStr)}
          className="bg-transparent text-xs font-mono outline-none w-[6.5rem]"
        />
      </label>
    </div>
  );
}

function NotificationsCard() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const sendTest = useServerFn(sendTestPush);

  useEffect(() => {
    const ok = pushSupported();
    setSupported(ok);
    if (ok) pushIsSubscribed().then(setSubscribed);
    if (typeof window !== "undefined") {
      setDismissed(localStorage.getItem("notif-card-dismissed") === "1");
    }
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const r = await subscribePush();
      if (r.ok) {
        setSubscribed(true);
        toast.success("Notifications on. Tap 'Send test' to verify.");
      } else {
        toast.error(r.reason || "Couldn't enable notifications.");
      }
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true);
    try {
      const r = await sendTest();
      if (r.sent > 0) toast.success(`Test sent to ${r.sent}/${r.total} device(s). Check your notification tray.`);
      else toast.error(r.reason || `0/${r.total} delivered. ${r.errors?.[0] ?? ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally { setBusy(false); }
  }

  if (!supported) return null;
  if (subscribed === null) return null;
  if (subscribed && dismissed) return null;

  // Detect preview/iframe — push isn't allowed there.
  const inPreview = typeof window !== "undefined" && (window.self !== window.top || window.location.hostname.includes("lovableproject.com") || window.location.hostname.includes("id-preview"));

  return (
    <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        {subscribed ? <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" /> : <BellOff className="h-5 w-5 text-primary mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">
            {subscribed ? "Notifications enabled" : "Turn on notifications"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {inPreview
              ? "Open the published app on your phone to enable push (the editor preview can't show system notifications)."
              : subscribed
                ? "Verify it works end-to-end. If you don't see the test in your tray, your phone OS is blocking the app."
                : "Get morning check-ins, evening logs and 2× surprise alerts. Permission must be granted on this device."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!subscribed && (
              <button onClick={enable} disabled={busy || inPreview}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {busy ? "Enabling…" : "Enable"}
              </button>
            )}
            {subscribed && (
              <>
                <button onClick={test} disabled={busy}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                  {busy ? "Sending…" : "Send test push"}
                </button>
                <button onClick={() => { localStorage.setItem("notif-card-dismissed", "1"); setDismissed(true); }}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground">
                  Hide
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
