/**
 * Variable reward mechanics — D3 spec.
 * All client-side scheduled state lives in localStorage. Server points table
 * is the source of truth for actual points; multipliers are applied at log time.
 */

const SURPRISE_KEY = "momentum:surprise"; // { date, startHour, startMin } | { date, skipped: true }
const SCRATCH_KEY  = "momentum:scratch";  // { weekStart, opened, result }
const BOOST_KEY    = "momentum:boost";    // { remaining, mult, label } — one-shot multiplier for next N logs
const COMEBACK_KEY = "momentum:comeback"; // { date, dismissed }
const DAYCOMP_KEY  = "momentum:dayComp";  // { date }

const todayStr = () => new Date().toISOString().slice(0, 10);
const mondayStr = () => {
  const d = new Date(); const day = d.getDay(); const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff); d.setHours(0,0,0,0);
  return d.toISOString().slice(0, 10);
};

function read<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }
function write<T>(k: string, v: T) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

// ── Surprise bonus (Type 3 — fires 3-5×/week, biased to mornings & evenings) ──

export type SurpriseWindow = { startMs: number; endMs: number; mult: number };

/** Idempotently decides if today gets a 60-min 2× window. Returns the window or null. */
export function ensureSurpriseToday(): SurpriseWindow | null {
  const date = todayStr();
  const cached = read<{ date: string; skipped?: boolean; startHour?: number; startMin?: number }>(SURPRISE_KEY);
  let rec = cached?.date === date ? cached : null;
  if (!rec) {
    // ~60% of days get a surprise → averages ~4×/week
    if (Math.random() < 0.6) {
      // Bias to commonly low windows: 10-12, 16-18, 20-21
      const buckets: Array<[number, number]> = [[10, 12], [16, 18], [20, 21]];
      const [lo, hi] = buckets[Math.floor(Math.random() * buckets.length)];
      const startHour = lo + Math.floor(Math.random() * (hi - lo));
      const startMin = Math.floor(Math.random() * 60);
      rec = { date, startHour, startMin };
    } else {
      rec = { date, skipped: true };
    }
    write(SURPRISE_KEY, rec);
  }
  if (rec.skipped || rec.startHour === undefined) return null;
  const start = new Date(); start.setHours(rec.startHour, rec.startMin ?? 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime(), mult: 2 };
}

export function getActiveSurprise(): SurpriseWindow | null {
  const w = ensureSurpriseToday();
  if (!w) return null;
  const now = Date.now();
  return now >= w.startMs && now < w.endMs ? w : null;
}

// ── One-shot boost (e.g. comeback 3×, scratch result) ──

export type Boost = { remaining: number; mult: number; label: string };

export function getBoost(): Boost | null {
  const b = read<Boost>(BOOST_KEY);
  return b && b.remaining > 0 && b.mult > 1 ? b : null;
}
export function setBoost(b: Boost) { write(BOOST_KEY, b); }
export function consumeBoost() {
  const b = getBoost(); if (!b) return;
  const next = { ...b, remaining: b.remaining - 1 };
  if (next.remaining <= 0) localStorage.removeItem(BOOST_KEY);
  else write(BOOST_KEY, next);
}

// ── Combined multiplier applied at log time ──

export function getActiveMultiplier(): { mult: number; source: string } {
  const boost = getBoost();
  const surp  = getActiveSurprise();
  if (boost && surp) return { mult: Math.max(boost.mult, surp.mult), source: boost.mult >= surp.mult ? boost.label : "Surprise ×2" };
  if (boost) return { mult: boost.mult, source: boost.label };
  if (surp)  return { mult: surp.mult, source: "Surprise ×2" };
  return { mult: 1, source: "" };
}

// ── Scratch card (Mondays) ──

export type ScratchResult = { kind: "points" | "boost" | "wildcard"; label: string; value?: number; mult?: number };

export function getScratchState(): { available: boolean; opened: boolean; result?: ScratchResult } {
  const week = mondayStr();
  const rec = read<{ weekStart: string; opened: boolean; result?: ScratchResult }>(SCRATCH_KEY);
  const dow = new Date().getDay(); // 1=Mon
  const available = dow >= 1; // available from Monday onwards
  if (rec?.weekStart === week) return { available, opened: rec.opened, result: rec.result };
  return { available, opened: false };
}

export function openScratch(): ScratchResult {
  const roll = Math.random();
  let result: ScratchResult;
  if (roll < 0.45) result = { kind: "points", label: "Bonus 500 pts", value: 500 };
  else if (roll < 0.75) result = { kind: "points", label: "Bonus 1,200 pts", value: 1200 };
  else if (roll < 0.92) result = { kind: "boost", label: "Next 3 logs ×3", mult: 3 };
  else result = { kind: "wildcard", label: "Wildcard week — one hard action ×3", mult: 3 };
  const week = mondayStr();
  write(SCRATCH_KEY, { weekStart: week, opened: true, result });
  if (result.kind === "boost") setBoost({ remaining: 3, mult: 3, label: "Scratch ×3" });
  if (result.kind === "wildcard") setBoost({ remaining: 1, mult: 3, label: "Wildcard ×3" });
  return result;
}

// ── Comeback amplifier ──

export function shouldShowComeback(lastLogIso: string | null): boolean {
  if (!lastLogIso) return false;
  const last = new Date(lastLogIso).getTime();
  const days = (Date.now() - last) / 86_400_000;
  if (days < 3) return false;
  const rec = read<{ date: string; dismissed?: boolean }>(COMEBACK_KEY);
  if (rec?.date === todayStr() && rec.dismissed) return false;
  return true;
}

export function activateComeback() {
  setBoost({ remaining: 1, mult: 3, label: "Comeback ×3" });
  write(COMEBACK_KEY, { date: todayStr(), dismissed: true });
}

export function dismissComeback() {
  write(COMEBACK_KEY, { date: todayStr(), dismissed: true });
}

// ── Day-complete moment ──

const DAY_THRESHOLD_PTS = 3000;

export function shouldFireDayComplete(todayPoints: number): boolean {
  if (todayPoints < DAY_THRESHOLD_PTS) return false;
  const rec = read<{ date: string }>(DAYCOMP_KEY);
  return rec?.date !== todayStr();
}

export function markDayCompleteFired() {
  write(DAYCOMP_KEY, { date: todayStr() });
}
