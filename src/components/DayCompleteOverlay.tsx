import { useEffect, useState } from "react";

/** Full-screen 2-second moment. Cannot be dismissed early. The dopamine moment. */
export function DayCompleteOverlay({ points, onDone }: { points: number; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("out"), 1700);
    const t2 = window.setTimeout(() => onDone(), 2200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${phase === "out" ? "opacity-0" : "opacity-100"}`}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="absolute inset-0" style={{ background: "var(--gradient-gold-radial)" }} />
      <div className="relative animate-streak-breathe text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Day complete</div>
        <div className="mt-3 font-display text-6xl md:text-7xl font-black text-primary tabular-nums">+{points.toLocaleString()}</div>
        <div className="mt-2 font-display text-xl font-bold text-foreground/90">points banked</div>
      </div>
    </div>
  );
}
