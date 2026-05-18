import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { getActiveSurprise, getBoost } from "@/lib/rewards";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60); const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Top banner — Type 3 surprise window or active boost. Always-on countdown. */
export function SurpriseBanner() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(i); }, []);

  const surprise = getActiveSurprise();
  const boost = getBoost();
  if (!surprise && !boost) return null;

  if (surprise) {
    const left = surprise.endMs - now;
    return (
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary/95 to-amber-soft text-primary-foreground shadow-gold-glow animate-feed-rise">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
          <Zap className="h-4 w-4 shrink-0" />
          <span className="font-display font-bold">Double Points active</span>
          <span className="font-mono text-xs ml-auto tabular-nums">ends in {fmt(left)}</span>
        </div>
      </div>
    );
  }
  if (boost) {
    return (
      <div className="sticky top-0 z-30 bg-gradient-to-r from-amber-soft to-primary text-primary-foreground animate-feed-rise">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
          <Zap className="h-4 w-4 shrink-0" />
          <span className="font-display font-bold">{boost.label}</span>
          <span className="font-mono text-xs ml-auto">{boost.remaining} log{boost.remaining === 1 ? "" : "s"} left</span>
        </div>
      </div>
    );
  }
  return null;
}
