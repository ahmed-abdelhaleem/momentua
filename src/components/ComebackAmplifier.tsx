import { activateComeback, dismissComeback } from "@/lib/rewards";
import { StreakFlame } from "./StreakFlame";

/** Full-screen comeback state — anti-guilt re-entry. One amplified action. */
export function ComebackAmplifier({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-feed-rise">
      <div className="opacity-60">
        <StreakFlame days={1} atRisk size={96} />
      </div>
      <h2 className="mt-8 font-display text-4xl md:text-5xl font-black text-center text-balance max-w-md">
        Still here. Let's pick it back up.
      </h2>
      <p className="mt-3 text-sm text-muted-foreground text-center max-w-sm">No summary. No catch-up. One action — amplified.</p>
      <button
        onClick={() => { activateComeback(); onAccept(); }}
        className="mt-10 rounded-2xl bg-primary text-primary-foreground px-8 py-5 font-display font-black text-lg shadow-stake animate-breathe"
      >
        Log something — earn 3× right now
      </button>
      <button
        onClick={() => { dismissComeback(); onAccept(); }}
        className="mt-4 text-xs font-mono text-muted-foreground hover:text-foreground"
      >
        Not yet
      </button>
    </div>
  );
}
