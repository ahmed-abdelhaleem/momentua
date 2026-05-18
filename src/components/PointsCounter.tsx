import { useEffect, useState } from "react";

/**
 * Hero points counter with breathing glow + recovery ring.
 * - Ring never fills past 95% until last day of month (preserves pull).
 * - Within 10% of next milestone shifts color to amber-soft (near-miss).
 * - Number rolls up like a slot machine on change (600ms).
 */
export function PointsCounter({
  points,
  recovered,
  monthlySek,
  isLastDayOfMonth,
}: {
  points: number;
  recovered: number; // 0..1+
  monthlySek: number;
  isLastDayOfMonth: boolean;
}) {
  const [displayed, setDisplayed] = useState(points);
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    if (points === displayed) return;
    const start = displayed;
    const delta = points - start;
    const startedAt = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startedAt) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(start + delta * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setBumpKey((k) => k + 1);
    return () => cancelAnimationFrame(raf);
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cap visible ring at 95% unless last day, to preserve the pull.
  const cappedRing = isLastDayOfMonth ? Math.min(recovered, 1) : Math.min(recovered, 0.95);
  const aheadOfPace = recovered >= 0.95 && !isLastDayOfMonth;

  // Near-miss: within 10% of next 5k milestone
  const nextMilestone = Math.ceil((points + 1) / 5000) * 5000;
  const toNext = nextMilestone - points;
  const isNearMiss = toNext > 0 && toNext <= nextMilestone * 0.1;

  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * cappedRing;

  return (
    <div className="relative inline-flex flex-col items-center">
      <div className="relative animate-breathe rounded-full" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="oklch(0.27 0.014 70)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#pcg)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.2,0.8,0.2,1)" }}
          />
          <defs>
            <linearGradient id="pcg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.14 75)" />
              <stop offset="100%" stopColor="oklch(0.85 0.10 80)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            key={bumpKey}
            className={`font-display font-black leading-none tabular-nums animate-count-roll ${isNearMiss ? "text-amber-soft" : "text-primary"}`}
            style={{ fontSize: 38 }}
          >
            {displayed.toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {isNearMiss ? `${toNext.toLocaleString()} to ${nextMilestone.toLocaleString()}` : "points · month"}
          </div>
        </div>
      </div>
      <div className="mt-3 text-center">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Vault goal · {monthlySek.toLocaleString()} SEK
        </div>
        <div className={`mt-0.5 font-mono text-xs ${aheadOfPace ? "text-amber-soft" : "text-foreground/80"}`}>
          {aheadOfPace ? "on track · keep going" : `${Math.round(Math.min(recovered, 1) * 100)}% earned back`}
        </div>
      </div>
    </div>
  );
}
