/**
 * CSS-only flame. Scales with streak length.
 * day 0–2: ember. 3–7: flicker. 8–20: steady flame. 21+: blaze.
 * If atRisk, flame flickers in amber/red.
 */
export function StreakFlame({ days, atRisk = false, size = 36 }: { days: number; atRisk?: boolean; size?: number }) {
  const scale = days <= 0 ? 0.55 : days < 3 ? 0.7 : days < 8 ? 0.9 : days < 21 ? 1.05 : 1.25;
  const inner = atRisk ? "oklch(0.78 0.18 50)" : "oklch(0.92 0.16 80)";
  const outer = atRisk ? "oklch(0.62 0.20 30)" : "oklch(0.72 0.14 75)";
  return (
    <div className="relative inline-flex items-end justify-center" style={{ width: size, height: size }} aria-hidden>
      <div
        className="animate-flame relative"
        style={{
          width: size * 0.72 * scale,
          height: size * 0.95 * scale,
          background: `radial-gradient(ellipse at 50% 80%, ${inner} 0%, ${outer} 55%, transparent 75%)`,
          borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
          filter: `drop-shadow(0 0 ${6 * scale}px ${outer}) drop-shadow(0 0 ${14 * scale}px ${outer})`,
        }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: "12%",
            width: "55%",
            height: "55%",
            background: `radial-gradient(ellipse at 50% 80%, oklch(1 0 0 / 0.85) 0%, ${inner} 60%, transparent 80%)`,
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
          }}
        />
      </div>
    </div>
  );
}
