import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Check, ChefHat, Clock, Loader2, MapPin, Plus, RefreshCw, ShoppingBag,
  Snowflake, Sparkles, Store, Tag, Trash2, Utensils, X, Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  SLOT_ICONS, STORE_COLORS, todayKey, tomorrowKey,
} from "@/lib/nourish-data";
import { MEAL_ACTION_KEYS } from "@/lib/points-catalog";
import {
  addCustomDealSource, listCustomDealSources, listCustomDeals,
  refreshCustomDealSource, removeCustomDealSource,
} from "@/lib/custom-deals.functions";
import {
  deleteCookSession, findNearbyStoresFn, getPreferredStores,
  importNearbyStoresFn, listCookSessions, resuggestSwapMeal, saveCookSession,
  setPreferredStores, suggestCookOptions, updatePostCook, updateShopOverrides,
} from "@/lib/cook-engine.functions";
import {
  addPantryItem, listPantry, lookupBarcode, removePantryItem,
} from "@/lib/pantry.functions";
import { STORES, type StoreId } from "@/lib/baseline-prices";

export const Route = createFileRoute("/_authenticated/nourish")({
  component: NourishPlan,
});

type Tab = "today" | "cook" | "shop" | "deals" | "pantry" | "stores";

type SlotKey = "today_lunch" | "today_dinner" | "tomorrow_lunch" | "tomorrow_dinner";

interface SuggestionIngredient {
  item: string;
  qty: string;
  weight_g?: number;
  store: string;
  unit_price_sek: number;
  source: "deal" | "baseline" | "pantry";
  deal_label?: string;
}
interface CookStep { id: string; text: string; duration_min?: number; requires_timer?: boolean }
interface DefrostInfo { required: boolean; items?: string[]; hours_ahead?: number }
interface MacroInfo { calories: number; protein_g: number; carbs_g: number; fat_g: number }
interface MealSuggestion {
  name: string;
  cuisine?: string;
  time_min: number;
  active_time_min?: number;
  ingredients: SuggestionIngredient[];
  total_cost_sek: number;
  why_picked: string;
  steps?: CookStep[];
  defrost?: DefrostInfo;
  equipment?: string[];
  per_portion?: MacroInfo;
  pantry_used?: number;
}
interface PostCook {
  portions_eaten?: number;
  portions_stored?: number;
  storage?: "fridge" | "freezer" | "none";
  notes?: string | null;
  updated_at?: string;
}
interface ShopOverrides {
  removed?: string[];
  quantities?: Record<string, string>;
  added?: Array<{ item: string; qty: string; store: string; unit_price_sek: number }>;
}
interface CookSession {
  id: string;
  style: "quick" | "sophisticated";
  portions: number;
  slots: SlotKey[];
  meal: MealSuggestion;
  total_cost_sek: number | null;
  cook_for_date: string;
  created_at: string;
  post_cook?: PostCook;
  shop_overrides?: ShopOverrides;
  follow_up_at?: string | null;
}

const SLOT_LABELS: Record<SlotKey, string> = {
  today_lunch: "Today · Lunch",
  today_dinner: "Today · Dinner",
  tomorrow_lunch: "Tomorrow · Lunch",
  tomorrow_dinner: "Tomorrow · Dinner",
};
const SLOT_ORDER: SlotKey[] = ["today_lunch", "today_dinner", "tomorrow_lunch", "tomorrow_dinner"];

function NourishPlan() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [sessions, setSessions] = useState<CookSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const listSessionsFn = useServerFn(listCookSessions);

  useEffect(() => { if (user) void load(); }, [user]);

  async function load() {
    setLoadingSessions(true);
    try {
      const res = await listSessionsFn();
      setSessions((res?.sessions ?? []) as unknown as CookSession[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingSessions(false);
    }
  }

  const today = todayKey();
  const tomorrow = tomorrowKey();

  const todaySessions = sessions.filter(
    (s) => s.cook_for_date === today || s.slots.some((sl) => sl.startsWith("today_")),
  );
  const upcomingSessions = sessions.filter(
    (s) => s.cook_for_date === tomorrow || s.slots.some((sl) => sl.startsWith("tomorrow_")),
  );

  const todayBySlot = useMemo(() => {
    const map = new Map<SlotKey, CookSession>();
    for (const s of sessions) {
      for (const sl of s.slots) {
        if (!map.has(sl)) map.set(sl, s);
      }
    }
    return map;
  }, [sessions]);

  return (
    <div className="px-4 md:px-10 py-6 md:py-10 max-w-3xl mx-auto pb-24">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">NourishPlan</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Cook once. Eat smart.</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Suggestions built from your scraped store deals + Swedish baseline prices. One cook covers lunch and dinner.
        </p>
      </header>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 mb-6 overflow-x-auto">
        {([
          { id: "today", label: "TODAY" },
          { id: "cook", label: "COOK" },
          { id: "shop", label: "SHOP" },
          { id: "pantry", label: "PANTRY" },
          { id: "deals", label: "DEALS" },
          { id: "stores", label: "STORES" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[64px] rounded-lg px-3 py-2 text-[11px] font-mono font-bold tracking-widest transition ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <TodayTab
          loading={loadingSessions}
          todayBySlot={todayBySlot}
          onPlan={() => setTab("cook")}
          onChanged={load}
        />
      )}
      {tab === "cook" && (
        <CookTab onSaved={async () => { await load(); setTab("today"); }} />
      )}
      {tab === "shop" && (
        <ShopTab sessions={[...todaySessions, ...upcomingSessions]} onChanged={load} />
      )}
      {tab === "pantry" && <PantryTab />}
      {tab === "deals" && <DealsTab />}
      {tab === "stores" && <StoresTab />}
    </div>
  );
}

// ---------------------- TODAY ----------------------

function TodayTab({
  loading, todayBySlot, onPlan, onChanged,
}: {
  loading: boolean;
  todayBySlot: Map<SlotKey, CookSession>;
  onPlan: () => void;
  onChanged: () => Promise<void>;
}) {
  const deleteFn = useServerFn(deleteCookSession);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filled = SLOT_ORDER.filter((k) => todayBySlot.has(k));
  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (filled.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-border">
        <Utensils className="h-12 w-12 text-muted-foreground mx-auto" />
        <h3 className="font-display text-xl font-bold mt-4">Nothing planned</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Plan your next cook. One session covers up to four slots.
        </p>
        <button onClick={onPlan} className="mt-6 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">
          PLAN A COOK
        </button>
      </div>
    );
  }

  // Group sessions so we render one card per cook session with one delete button.
  const seen = new Set<string>();
  const grouped: { session: CookSession; slots: SlotKey[] }[] = [];
  for (const slot of filled) {
    const s = todayBySlot.get(slot)!;
    if (seen.has(s.id)) {
      const g = grouped.find((g) => g.session.id === s.id)!;
      g.slots.push(slot);
    } else {
      seen.add(s.id);
      grouped.push({ session: s, slots: [slot] });
    }
  }

  async function handleDelete(id: string, name: string) {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${name}"?`)) return;
    setDeleting(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Plan deleted");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="space-y-3">
      {grouped.map(({ session: s, slots }) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{SLOT_ICONS[slots[0].endsWith("_lunch") ? "lunch" : "dinner"]}</span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {slots.map((sl) => SLOT_LABELS[sl]).join(" · ")}
              </div>
              <div className="font-semibold truncate">{s.meal.name}</div>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex gap-2">
                <span>⏱ {s.meal.time_min}m</span>
                <span>·</span>
                <span>{s.meal.total_cost_sek} kr / {s.portions}p</span>
                {s.post_cook?.storage && s.post_cook.storage !== "none" && (
                  <>
                    <span>·</span>
                    <span className="text-primary inline-flex items-center gap-0.5">
                      {s.post_cook.storage === "freezer" ? <Snowflake className="h-3 w-3" /> : "🧊"}
                      {s.post_cook.portions_stored}p stored
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDelete(s.id, s.meal.name)}
              disabled={deleting === s.id}
              className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive hover:border-destructive transition disabled:opacity-50"
              aria-label="Delete cook plan"
              title="Delete cook plan"
            >
              {deleting === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
          <PostCookSection session={s} onChanged={onChanged} />
        </div>
      ))}
    </section>
  );
}

// ---------------------- POST-COOK ----------------------

function PostCookSection({ session, onChanged }: { session: CookSession; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const updateFn = useServerFn(updatePostCook);
  const pc = session.post_cook ?? {};
  const [eaten, setEaten] = useState<number>(pc.portions_eaten ?? 1);
  const [stored, setStored] = useState<number>(pc.portions_stored ?? Math.max(0, session.portions - 1));
  const [storage, setStorage] = useState<"fridge" | "freezer" | "none">(pc.storage ?? "fridge");
  const [notes, setNotes] = useState<string>(pc.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (eaten + stored > session.portions) return toast.error("Eaten + stored exceeds total portions");
    setSaving(true);
    try {
      const days = storage === "freezer" ? 30 : storage === "fridge" ? 3 : 0;
      const followUp = days > 0 && stored > 0
        ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
        : null;
      await updateFn({
        data: {
          id: session.id,
          portions_eaten: eaten,
          portions_stored: stored,
          storage,
          notes: notes || undefined,
          follow_up_at: followUp,
        },
      });
      toast.success(stored > 0
        ? `Logged. Reminder set for ~${days} days.`
        : "Logged.");
      setOpen(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-3 w-full text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary text-left">
        + {pc.storage ? "edit leftovers log" : "log leftovers / refrigerate"}
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Eaten now" value={eaten} setValue={setEaten} max={session.portions} />
        <NumField label="Stored" value={stored} setValue={setStored} max={session.portions} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["fridge", "freezer", "none"] as const).map((opt) => (
          <button key={opt} onClick={() => setStorage(opt)}
            className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold capitalize transition ${storage === opt ? "border-primary bg-primary/10" : "border-border"}`}>
            {opt === "freezer" ? "❄ freeze" : opt === "fridge" ? "🧊 fridge" : "skip"}
          </button>
        ))}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)" rows={2} maxLength={500}
        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
        <button onClick={save} disabled={saving}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-1">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}Save log
        </button>
      </div>
    </div>
  );
}

function NumField({ label, value, setValue, max }: { label: string; value: number; setValue: (n: number) => void; max: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => setValue(Math.max(0, value - 1))} className="w-6 h-6 rounded border border-border text-sm">−</button>
        <span className="w-5 text-center text-sm font-bold">{value}</span>
        <button onClick={() => setValue(Math.min(max, value + 1))} className="w-6 h-6 rounded border border-border text-sm">+</button>
      </div>
    </div>
  );
}

// ---------------------- COOK (suggest) ----------------------

function CookTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const suggestFn = useServerFn(suggestCookOptions);
  const saveFn = useServerFn(saveCookSession);

  const [style, setStyle] = useState<"quick" | "sophisticated">("quick");
  const [portions, setPortions] = useState(2);
  const [slots, setSlots] = useState<SlotKey[]>(["today_lunch", "today_dinner"]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [dealCount, setDealCount] = useState<number | null>(null);

  function toggleSlot(s: SlotKey) {
    setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function getSuggestions() {
    if (!slots.length) return toast.error("Pick at least one meal slot");
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await suggestFn({ data: { style, portions, slots } });
      setSuggestions(res.suggestions ?? []);
      setDealCount(res.dealCount ?? 0);
      if (!res.suggestions?.length) toast.error("No suggestions returned. Try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to suggest");
    } finally {
      setLoading(false);
    }
  }

  async function pick(meal: MealSuggestion) {
    if (!user) return;
    try {
      const cookFor = slots.some((s) => s.startsWith("tomorrow_")) && !slots.some((s) => s.startsWith("today_"))
        ? tomorrowKey()
        : todayKey();
      await saveFn({ data: { style, portions, slots, meal, cook_for_date: cookFor } });
      await supabase.from("point_logs").insert({
        user_id: user.id,
        action_key: MEAL_ACTION_KEYS.PLAN,
        action_label: `Planned cook: ${meal.name}`,
        domain: "self_regulation",
        points: 600,
      });
      toast.success(`${meal.name} locked in. +600 pts`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold mb-2">1 · Style</h3>
        <div className="grid grid-cols-2 gap-2">
          <StyleCard active={style === "quick"} onClick={() => setStyle("quick")}
            icon={<Zap className="h-5 w-5" />} title="Quick" sub="≤15 min · one pan" />
          <StyleCard active={style === "sophisticated"} onClick={() => setStyle("sophisticated")}
            icon={<ChefHat className="h-5 w-5" />} title="Sophisticated" sub="25–45 min · technique" />
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-bold mb-2">2 · Portions</h3>
        <p className="text-xs text-muted-foreground mb-2">Solo? 2 portions = lunch + dinner from one cook.</p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => setPortions(n)}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition ${portions === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>
              {n}p
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-bold mb-2">3 · Cover which meals?</h3>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_ORDER.map((s) => (
            <button key={s} onClick={() => toggleSlot(s)}
              className={`rounded-lg border-2 px-3 py-2.5 text-xs font-semibold text-left transition ${slots.includes(s) ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}>
              {slots.includes(s) ? "✓ " : ""}{SLOT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <button onClick={getSuggestions} disabled={loading || !slots.length}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Cooking up options…" : "Suggest meals"}
      </button>

      {dealCount !== null && !loading && (
        <p className="text-xs text-muted-foreground text-center">
          Considering {dealCount} active deal{dealCount === 1 ? "" : "s"} from your sources.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold">4 · Pick one</h3>
          {suggestions.map((m, i) => (
            <SuggestionCard key={i} meal={m} onPick={() => pick(m)} />
          ))}
        </div>
      )}
    </section>
  );
}

function StyleCard({
  active, onClick, icon, title, sub,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}>
      <div className="text-primary">{icon}</div>
      <div className="font-bold">{title}</div>
      <div className="text-[11px] font-mono text-muted-foreground">{sub}</div>
    </button>
  );
}

function SuggestionCard({ meal, onPick }: { meal: MealSuggestion; onPick: () => void }) {
  const dealCount = meal.ingredients.filter((i) => i.source === "deal").length;
  const pantryCount = meal.pantry_used ?? meal.ingredients.filter((i) => i.source === "pantry").length;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{meal.name}</div>
          {meal.cuisine && <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{meal.cuisine}</div>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {meal.time_min}m{meal.active_time_min ? ` (${meal.active_time_min}m active)` : ""}</span>
            <span>· {meal.total_cost_sek} kr total</span>
            {pantryCount > 0 && <span className="text-emerald-500">· 🥫 {pantryCount} from pantry</span>}
            {dealCount > 0 && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Tag className="h-3 w-3" /> {dealCount} deal{dealCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {meal.per_portion && (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono">
              <span className="rounded bg-secondary px-1.5 py-0.5">{meal.per_portion.calories} kcal/p</span>
              <span className="rounded bg-secondary px-1.5 py-0.5">P {meal.per_portion.protein_g}g</span>
              <span className="rounded bg-secondary px-1.5 py-0.5">C {meal.per_portion.carbs_g}g</span>
              <span className="rounded bg-secondary px-1.5 py-0.5">F {meal.per_portion.fat_g}g</span>
            </div>
          )}
          {meal.defrost?.required && (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <Snowflake className="inline h-3 w-3 mr-1" />
              Defrost {meal.defrost.items?.join(", ") || "ahead"} · ~{meal.defrost.hours_ahead ?? 8}h before
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 italic">{meal.why_picked}</p>
        </div>
      </div>
      <details className="mt-3">
        <summary className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer">
          Ingredients ({meal.ingredients.length})
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {meal.ingredients.map((ing, i) => {
            const color = STORE_COLORS[ing.store];
            const isPantry = ing.source === "pantry";
            return (
              <li key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[9px] font-mono font-bold rounded px-1 py-0.5 ${isPantry ? "bg-emerald-500/20 text-emerald-600" : ing.source === "deal" ? "" : "text-muted-foreground bg-secondary"}`}
                    style={ing.source === "deal" ? { backgroundColor: (color || "#666") + "22", color: color || "#666" } : {}}>
                    {isPantry ? "PANTRY" : ing.source === "deal" ? `${ing.store} DEAL` : ing.store}
                  </span>
                  <span className="truncate">{ing.qty} {ing.item}</span>
                </div>
                <span className="font-mono text-muted-foreground shrink-0">{isPantry ? "free" : `${ing.unit_price_sek} kr`}</span>
              </li>
            );
          })}
        </ul>
      </details>
      {meal.steps && meal.steps.length > 0 && (
        <details className="mt-2">
          <summary className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer">
            Steps ({meal.steps.length})
          </summary>
          <ol className="mt-2 space-y-1.5 text-xs list-decimal pl-5">
            {meal.steps.map((st) => (
              <li key={st.id}>
                {st.text}
                {st.duration_min ? <span className="text-muted-foreground font-mono"> · {st.duration_min}m{st.requires_timer ? " ⏲" : ""}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      )}
      <button onClick={onPick} className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
        Cook this
      </button>
    </div>
  );
}

// ---------------------- SHOP ----------------------

function ShopTab({ sessions, onChanged }: { sessions: CookSession[]; onChanged: () => Promise<void> }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-border">
        <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground mt-4">No cook session yet — plan one to generate a list.</p>
      </div>
    );
  }
  return (
    <section className="space-y-4">
      {sessions.map((s) => <ShopSessionCard key={s.id} session={s} onChanged={onChanged} />)}
    </section>
  );
}

function ShopSessionCard({ session, onChanged }: { session: CookSession; onChanged: () => Promise<void> }) {
  const overridesFn = useServerFn(updateShopOverrides);
  const swapFn = useServerFn(resuggestSwapMeal);
  const saveFn = useServerFn(saveCookSession);
  const deleteFn = useServerFn(deleteCookSession);

  const initial = session.shop_overrides ?? {};
  const [removed, setRemoved] = useState<string[]>(initial.removed ?? []);
  const [quantities, setQuantities] = useState<Record<string, string>>(initial.quantities ?? {});
  const [added, setAdded] = useState<NonNullable<ShopOverrides["added"]>>(initial.added ?? []);
  const [newItem, setNewItem] = useState({ item: "", qty: "", store: "any", price: "" });
  const [persistTimer, setPersistTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [swaps, setSwaps] = useState<MealSuggestion[] | null>(null);
  const [swapping, setSwapping] = useState(false);

  function persistDebounced(next: ShopOverrides) {
    if (persistTimer) clearTimeout(persistTimer);
    const t = setTimeout(() => {
      void overridesFn({ data: { id: session.id, overrides: {
        removed: next.removed ?? [], quantities: next.quantities ?? {}, added: next.added ?? [],
      } } }).catch(() => undefined);
    }, 500);
    setPersistTimer(t);
  }

  function toggleRemove(item: string) {
    const next = removed.includes(item) ? removed.filter((x) => x !== item) : [...removed, item];
    setRemoved(next);
    persistDebounced({ removed: next, quantities, added });
  }
  function setQty(item: string, qty: string) {
    const next = { ...quantities, [item]: qty };
    setQuantities(next);
    persistDebounced({ removed, quantities: next, added });
  }
  function addItem() {
    if (!newItem.item.trim() || !newItem.price) return;
    const next = [...added, {
      item: newItem.item.trim(), qty: newItem.qty.trim() || "—",
      store: newItem.store, unit_price_sek: Number(newItem.price) || 0,
    }];
    setAdded(next);
    setNewItem({ item: "", qty: "", store: "any", price: "" });
    persistDebounced({ removed, quantities, added: next });
  }
  function dropAdded(i: number) {
    const next = added.filter((_, j) => j !== i);
    setAdded(next);
    persistDebounced({ removed, quantities, added: next });
  }

  async function suggestSwap() {
    if (!removed.length) return;
    setSwapping(true);
    try {
      const r = await swapFn({ data: { style: session.style, portions: session.portions, slots: session.slots, avoidItems: removed } });
      setSwaps(r.suggestions ?? []);
      if (!r.suggestions?.length) toast.error("No swap meals returned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setSwapping(false);
    }
  }
  async function applySwap(meal: MealSuggestion) {
    try {
      await saveFn({ data: {
        style: session.style, portions: session.portions, slots: session.slots,
        meal, cook_for_date: session.cook_for_date,
      } });
      await deleteFn({ data: { id: session.id } });
      toast.success(`Swapped to ${meal.name}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Swap save failed");
    }
  }

  const ingTotal = (session.meal.ingredients ?? []).reduce(
    (n, ing) => n + (removed.includes(ing.item) ? 0 : ing.unit_price_sek), 0,
  );
  const addedTotal = added.reduce((n, a) => n + a.unit_price_sek, 0);
  const total = ingTotal + addedTotal;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{session.cook_for_date}</div>
          <div className="font-semibold">{session.meal.name}</div>
        </div>
        <span className="font-mono text-xs">~{Math.round(total)} kr</span>
      </div>
      <ul className="space-y-1.5">
        {(session.meal.ingredients ?? []).map((ing) => {
          const isRemoved = removed.includes(ing.item);
          const color = STORE_COLORS[ing.store];
          return (
            <li key={ing.item} className={`flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm ${isRemoved ? "opacity-40 line-through" : ""}`}>
              <span className="text-[9px] font-mono font-bold rounded px-1 py-0.5"
                style={ing.source === "deal" && color ? { backgroundColor: color + "22", color } : { color: "hsl(var(--muted-foreground))" }}>
                {ing.store}
              </span>
              <input value={quantities[ing.item] ?? ing.qty}
                onChange={(e) => setQty(ing.item, e.target.value)}
                className="w-16 bg-transparent border-b border-border text-xs px-1" />
              <span className="flex-1 truncate">{ing.item}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{ing.unit_price_sek} kr</span>
              <button onClick={() => toggleRemove(ing.item)}
                className="p-1 text-muted-foreground hover:text-destructive" aria-label="Toggle remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {added.map((a, i) => (
          <li key={`added-${i}`} className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1.5 text-sm">
            <span className="text-[9px] font-mono font-bold text-primary">+{a.store}</span>
            <span className="text-xs">{a.qty}</span>
            <span className="flex-1 truncate">{a.item}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{a.unit_price_sek} kr</span>
            <button onClick={() => dropAdded(i)} className="p-1 text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={newItem.item} onChange={(e) => setNewItem({ ...newItem, item: e.target.value })}
          placeholder="Add item" maxLength={120}
          className="flex-1 min-w-[110px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
        <input value={newItem.qty} onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
          placeholder="qty" maxLength={40}
          className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
        <input value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
          inputMode="decimal" placeholder="kr" maxLength={6}
          className="w-14 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
        <button onClick={addItem} className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1">
          <Plus className="h-3 w-3" />Add
        </button>
      </div>

      {removed.length > 0 && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs">{removed.length} ingredient(s) missing. Want a swap meal that avoids them?</p>
          <button onClick={suggestSwap} disabled={swapping}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
            {swapping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Suggest swap
          </button>
          {swaps && swaps.length > 0 && (
            <div className="mt-3 space-y-2">
              {swaps.map((m, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-2">
                  <div className="font-semibold text-sm">{m.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">⏱ {m.time_min}m · {m.total_cost_sek} kr</div>
                  <button onClick={() => applySwap(m)}
                    className="mt-1.5 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
                    Use this instead
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------- STORES (preferences) ----------------------

function StoresTab() {
  const getFn = useServerFn(getPreferredStores);
  const setFn = useServerFn(setPreferredStores);
  const [selected, setSelected] = useState<StoreId[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getFn();
        setSelected((r.stores ?? []) as StoreId[]);
      } finally { setLoading(false); }
    })();
  }, []);

  async function toggle(s: StoreId) {
    const next = selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s];
    setSelected(next);
    try {
      await setFn({ data: { stores: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <section>
      <div className="rounded-xl bg-secondary/40 px-4 py-3 mb-5">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Where you actually shop</div>
        </div>
        <p className="text-sm mt-1">Suggestions only consider deals + baseline prices from these stores.</p>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
        <div className="grid grid-cols-2 gap-2">
          {STORES.map((s) => {
            const active = selected.includes(s.id);
            const color = STORE_COLORS[s.id];
            return (
              <button key={s.id} onClick={() => toggle(s.id)}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}>
                <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold text-[11px] text-white"
                  style={{ backgroundColor: color }}>
                  {s.label.slice(0, 3).toUpperCase()}
                </div>
                <div className="flex-1 font-semibold text-sm">{s.label}</div>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
      <NearbyStoresSection />
    </section>
  );
}

interface NearbyStore { place_id: string; name: string; address: string; store: string; distance_m?: number; website?: string | null }

function NearbyStoresSection() {
  const findFn = useServerFn(findNearbyStoresFn);
  const importFn = useServerFn(importNearbyStoresFn);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [nearby, setNearby] = useState<NearbyStore[] | null>(null);

  async function locate() {
    if (!("geolocation" in navigator)) return toast.error("Geolocation not available");
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await findFn({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude, radius_m: 3000 } });
          setNearby((r.stores ?? []) as NearbyStore[]);
          if (!r.stores?.length) toast.info("No supermarkets we recognize within 3km.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Lookup failed");
        } finally { setLoading(false); }
      },
      (err) => { setLoading(false); toast.error(err.message || "Location denied"); },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  async function importAll() {
    if (!nearby?.length) return;
    setImporting(true);
    try {
      const r = await importFn({
        data: {
          stores: nearby.map((s) => ({
            name: s.name,
            store: s.store as "ICA" | "Coop" | "Willys" | "Lidl" | "Hemköp" | "Mathem",
            website: s.website ?? null,
          })),
        },
      });
      const ok = r.results.filter((x) => x.ok).length;
      toast.success(`Added ${r.added} store(s). ${ok} scraped successfully.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg font-bold">Nearby stores</h3>
      </div>
      <button onClick={locate} disabled={loading}
        className="w-full rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        Find supermarkets near me
      </button>
      {nearby && nearby.length > 0 && (
        <div className="mt-4 space-y-2">
          {nearby.map((n) => (
            <div key={n.place_id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-sm">
              <span className="text-[10px] font-mono font-bold rounded px-1.5 py-0.5 text-white"
                style={{ backgroundColor: STORE_COLORS[n.store] || "hsl(var(--muted))" }}>{n.store}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{n.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {n.address}
                  {n.website && <> · <a href={n.website} target="_blank" rel="noreferrer" className="underline hover:text-primary">site</a></>}
                </div>
              </div>
              {n.distance_m != null && <span className="text-[10px] font-mono text-muted-foreground">{n.distance_m} m</span>}
            </div>
          ))}
          <button onClick={importAll} disabled={importing}
            className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Add as deal sources & scrape
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------- DEALS ----------------------

interface CustomSource {
  id: string; url: string; label: string | null; store: string | null;
  last_scraped_at: string | null; last_status: string; last_error: string | null;
}
interface CustomDeal {
  id: string; source_id: string; item: string; discount: string | null; image_url: string | null; type_key: string | null;
}

function DealsTab() {
  const listSourcesFn = useServerFn(listCustomDealSources);
  const listDealsFn = useServerFn(listCustomDeals);
  const addSourceFn = useServerFn(addCustomDealSource);
  const removeSourceFn = useServerFn(removeCustomDealSource);
  const refreshSourceFn = useServerFn(refreshCustomDealSource);

  const [sources, setSources] = useState<CustomSource[]>([]);
  const [deals, setDeals] = useState<CustomDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [filterSourceId, setFilterSourceId] = useState<string | "all">("all");

  useEffect(() => { void reload(); }, []);

  async function reload() {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([listSourcesFn(), listDealsFn()]);
      setSources(((s?.sources ?? []) as CustomSource[]));
      setDeals(((d?.deals ?? []) as CustomDeal[]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      const res = await addSourceFn({ data: { url: url.trim(), label: label.trim() || undefined } });
      const source = res?.source as CustomSource | undefined;
      if (!source?.id) throw new Error("Source was not created.");
      setSources((s) => [...s, source]);
      const newId = source.id;
      setUrl(""); setLabel("");
      toast.success("Source added. Scraping now…");
      setRefreshingId(newId);
      try {
        await refreshSourceFn({ data: { id: newId } });
        await reload();
      } finally { setRefreshingId(null); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally { setAdding(false); }
  }

  async function handleRefresh(id: string) {
    setRefreshingId(id);
    try { await refreshSourceFn({ data: { id } }); await reload(); toast.success("Refreshed"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setRefreshingId(null); }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this source and its deals?")) return;
    try {
      await removeSourceFn({ data: { id } });
      setSources((s) => s.filter((x) => x.id !== id));
      setDeals((d) => d.filter((x) => x.source_id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const visibleDeals = filterSourceId === "all" ? deals : deals.filter((d) => d.source_id === filterSourceId);

  return (
    <section>
      <div className="rounded-xl bg-secondary/40 px-4 py-3 mb-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your deal sources · auto-refreshed Mon 5 AM</div>
        </div>
        <p className="text-sm mt-1">Paste your local store offers page. The cook engine will use these deals to build cheaper meal options.</p>
      </div>

      <form onSubmit={handleAdd} className="rounded-xl border border-border bg-card p-3 mb-4 space-y-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.ica.se/erbjudanden/..." maxLength={500}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" aria-label="Discount page URL" />
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)" maxLength={80}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" aria-label="Source label" />
          <button type="submit" disabled={adding || !url.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 inline-flex items-center gap-2">
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}Add
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No sources yet. Paste your store's offers page above.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {sources.filter((s) => s?.id).map((s) => {
            const count = deals.filter((d) => d.source_id === s.id).length;
            const isRefreshing = refreshingId === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <button onClick={() => setFilterSourceId(filterSourceId === s.id ? "all" : s.id)}
                    className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm truncate">{s.label || s.store || hostOf(s.url)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.url}</div>
                    <div className="text-[10px] font-mono mt-1 flex items-center gap-2">
                      <span className={s.last_status === "ok" ? "text-primary" : s.last_status === "error" ? "text-destructive" : "text-muted-foreground"}>
                        {s.last_status === "ok" ? `✓ ${count} deals` : s.last_status === "error" ? "× error" : "pending"}
                      </span>
                      {s.last_scraped_at && <span className="text-muted-foreground">· {new Date(s.last_scraped_at).toLocaleDateString()}</span>}
                      {filterSourceId === s.id && <span className="text-primary">· filtered</span>}
                    </div>
                    {s.last_error && <div className="text-[10px] text-destructive mt-1 truncate">{s.last_error}</div>}
                  </button>
                  <button onClick={() => handleRefresh(s.id)} disabled={isRefreshing}
                    className="p-2 text-muted-foreground hover:text-primary disabled:opacity-50" aria-label="Refresh source">
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                  <button onClick={() => handleRemove(s.id)}
                    className="p-2 text-muted-foreground hover:text-destructive" aria-label="Remove source">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleDeals.length > 0 && (
        <>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Compare by item type {filterSourceId !== "all" && (
              <button onClick={() => setFilterSourceId("all")} className="text-primary normal-case ml-2">(show all)</button>
            )}
          </div>
          <GroupedDeals deals={visibleDeals} sources={sources} />
        </>
      )}
    </section>
  );
}

function GroupedDeals({ deals, sources }: { deals: CustomDeal[]; sources: CustomSource[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, CustomDeal[]>();
    for (const d of deals) {
      const k = (d.type_key || d.item.toLowerCase().split(" ")[0] || "other").trim();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [deals]);

  return (
    <div className="space-y-2">
      {groups.map(([key, items]) => (
        <div key={key} className="rounded-xl border border-border bg-card p-3">
          <div className="font-semibold text-sm capitalize mb-2">{key}</div>
          <div className="flex flex-wrap gap-1.5">
            {items.slice(0, 8).map((d) => {
              const src = sources.find((s) => s.id === d.source_id);
              const color = src?.store ? STORE_COLORS[src.store] : undefined;
              return (
                <div key={d.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-[11px]">
                  <span className="font-mono font-bold text-[9px] px-1 rounded"
                    style={color ? { backgroundColor: color + "22", color } : {}}>
                    {(src?.store || "?").slice(0, 3).toUpperCase()}
                  </span>
                  <span className="truncate max-w-[140px]">{d.item}</span>
                  {d.discount && <span className="text-primary font-mono text-[10px]">{d.discount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------- PANTRY ----------------------

interface PantryItem {
  id: string; name: string; category: string; location: string;
  quantity: string | null; expires_at: string | null; barcode: string | null;
}

function PantryTab() {
  const listFn = useServerFn(listPantry);
  const addFn = useServerFn(addPantryItem);
  const removeFn = useServerFn(removePantryItem);
  const lookupFn = useServerFn(lookupBarcode);

  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [location, setLocation] = useState("fridge");
  const [quantity, setQuantity] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    try { const r = await listFn(); setItems((r.items ?? []) as PantryItem[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addFn({ data: { name: name.trim(), category, location, quantity: quantity.trim() || undefined, barcode: scannedBarcode } });
      setName(""); setQuantity(""); setScannedBarcode(null);
      await load();
      toast.success("Added to pantry");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function handleScanResult(code: string) {
    setScannedBarcode(code);
    try {
      const r = await lookupFn({ data: { barcode: code } });
      if (r.found) {
        // Seamless: add directly to pantry, no second tap needed.
        try {
          await addFn({ data: { name: r.name, category: r.category, location, quantity: r.quantity || undefined, barcode: code } });
          await load();
          setScannedBarcode(null);
          toast.success(`Added: ${r.name}`);
        } catch (err) {
          // Fall back to prefilling the form if insert fails.
          setName(r.name); setCategory(r.category);
          if (r.quantity) setQuantity(r.quantity);
          toast.error(err instanceof Error ? err.message : "Could not save — review and tap Add");
          setTimeout(() => nameInputRef.current?.focus(), 50);
        }
      } else {
        // Not in any database — prefill barcode, keep it tied to the item, focus name.
        setName("");
        toast.info(`Barcode ${code} captured — name it and tap Add`);
        setTimeout(() => nameInputRef.current?.focus(), 50);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Lookup failed"); }
  }

  async function handleRemove(id: string) {
    try { await removeFn({ data: { id } }); setItems((x) => x.filter((i) => i.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function startScan() {
    // Native (Android app) → ML Kit camera; otherwise → zxing web fallback.
    const { isNative, nativeScanBarcode } = await import("@/lib/native");
    if (await isNative()) {
      const code = await nativeScanBarcode();
      if (!code) return;
      await handleScanResult(code);
      return;
    }

    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const deviceId = devices[devices.length - 1]?.deviceId;
      const video = document.getElementById("pantry-scan-video") as HTMLVideoElement | null;
      if (!video) throw new Error("Camera element missing");
      const controls = await reader.decodeFromVideoDevice(deviceId, video, async (result) => {
        if (!result) return;
        const code = result.getText();
        controls.stop();
        setScanning(false);
        await handleScanResult(code);
      });
    } catch (e) {
      setScanning(false);
      toast.error(e instanceof Error ? e.message : "Scan failed");
    }
  }

  const grouped = useMemo(() => {
    const map: Record<string, PantryItem[]> = {};
    for (const i of items) { (map[i.location] ||= []).push(i); }
    return map;
  }, [items]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-secondary/40 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">My pantry</div>
        <p className="text-sm mt-1">What you already have. Cook engine prioritizes these before suggesting buys.</p>
      </div>

      <form onSubmit={handleAdd} className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex gap-2">
          <input ref={nameInputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name (e.g. Lax 400g)"
            maxLength={120} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <button type="button" onClick={startScan} disabled={scanning}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold inline-flex items-center gap-1">
            📷 Scan
          </button>
        </div>
        {scanning && (
          <div className="rounded-lg overflow-hidden border border-border">
            <video id="pantry-scan-video" className="w-full max-h-64 bg-black" />
            <button type="button" onClick={() => { setScanning(false); window.location.reload(); }}
              className="w-full py-1 text-xs bg-secondary">Cancel scan</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-2 text-xs">
            {["meat", "chicken", "fish", "veg", "canned", "grain", "dairy", "other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={location} onChange={(e) => setLocation(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-2 text-xs">
            {["fridge", "freezer", "pantry"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="qty"
            maxLength={40} className="rounded-lg border border-input bg-background px-2 py-2 text-xs" />
        </div>
        <button type="submit" disabled={busy || !name.trim()}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          Add to pantry
        </button>
      </form>

      {loading ? <p className="text-xs text-muted-foreground text-center py-4">Loading…</p> :
        items.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Empty. Add something above.</p> :
        (
          <div className="space-y-3">
            {(["fridge", "freezer", "pantry"] as const).map((loc) => {
              const list = grouped[loc] ?? [];
              if (!list.length) return null;
              return (
                <div key={loc} className="rounded-xl border border-border bg-card p-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    {loc === "freezer" ? "❄ freezer" : loc === "fridge" ? "🧊 fridge" : "🥫 pantry"} · {list.length}
                  </div>
                  <ul className="space-y-1">
                    {list.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold">{i.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {i.category}{i.quantity ? ` · ${i.quantity}` : ""}
                          </span>
                        </div>
                        <button onClick={() => handleRemove(i.id)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )
      }
    </section>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

