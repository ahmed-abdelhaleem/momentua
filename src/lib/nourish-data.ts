// Slot primitives shared across the Nourish UI.
// Static meal catalog and weekly deals were removed in favor of the
// AI cook-engine driven by user-scraped deals + baseline prices.

export type Slot = "breakfast" | "lunch" | "dinner";
export type Energy = "low" | "med" | "high";

export const SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];
export const SLOT_ICONS: Record<Slot, string> = {
  breakfast: "☀️",
  lunch: "🕐",
  dinner: "🌙",
};

export const STORE_COLORS: Record<string, string> = {
  ICA: "#E53935",
  Coop: "#2E7D32",
  Willys: "#F57F17",
  Lidl: "#1565C0",
  Hemköp: "#6A1B9A",
  Mathem: "#00838F",
};

export function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
export function todayKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
