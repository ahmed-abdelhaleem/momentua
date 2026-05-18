import { useEffect, useRef, useState } from "react";
import { Gift } from "lucide-react";
import { getScratchState, openScratch, type ScratchResult } from "@/lib/rewards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/** Weekly scratch card. Drag to scratch ≥60% then reveals after a 1.5s drum-roll. */
export function ScratchCard() {
  const { user } = useAuth();
  const [state, setState] = useState(getScratchState());
  const [revealing, setRevealing] = useState(false);
  const [result, setResult] = useState<ScratchResult | undefined>(state.result);
  const [scratched, setScratched] = useState(0); // 0..1
  const dragging = useRef(false);
  const cells = useRef<Set<number>>(new Set());

  useEffect(() => { setState(getScratchState()); }, []);

  if (!state.available) return null;
  if (state.opened && !revealing && result) return <RevealedCard result={result} />;
  if (state.opened && !result) return null;

  const cols = 12, rows = 6, total = cols * rows;

  function mark(x: number, y: number, rect: DOMRect) {
    const cx = Math.floor(((x - rect.left) / rect.width) * cols);
    const cy = Math.floor(((y - rect.top) / rect.height) * rows);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    cells.current.add(cy * cols + cx);
    const pct = cells.current.size / total;
    setScratched(pct);
    if (pct >= 0.6) doReveal();
  }

  async function doReveal() {
    if (revealing || result) return;
    setRevealing(true);
    await new Promise((r) => setTimeout(r, 1500));
    const r = openScratch();
    setResult(r);
    setState(getScratchState());
    if (r.kind === "points" && r.value && user) {
      await supabase.from("point_logs").insert({ user_id: user.id, action_key: "scratch_bonus", action_label: `Weekly scratch — ${r.label}`, domain: "self_regulation", points: r.value });
      toast.success(`+${r.value.toLocaleString()} pts — ${r.label}`);
    } else {
      toast.success(r.label);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5 shadow-stake">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary"><Gift className="h-3 w-3" /> Weekly bonus</div>
      <h3 className="font-display text-xl font-black mt-1">Scratch to reveal.</h3>
      <p className="text-xs text-muted-foreground mt-1">Drag across the panel — could be points, a boost, or a wildcard week.</p>

      <div
        className="relative mt-4 h-32 rounded-xl overflow-hidden select-none cursor-pointer"
        style={{ background: "var(--gradient-momentum)" }}
        onPointerDown={(e) => { dragging.current = true; mark(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerMove={(e) => { if (dragging.current) mark(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-primary-foreground font-display text-2xl font-black tracking-tight pointer-events-none">
          {revealing ? <SpinDrum /> : "SCRATCH ME"}
        </div>
        <div
          className="absolute inset-0 bg-card/80 backdrop-blur-sm transition-opacity pointer-events-none"
          style={{ opacity: Math.max(0, 1 - scratched * 1.4) }}
        />
        <div className="absolute bottom-1 right-2 font-mono text-[10px] text-primary-foreground/80 pointer-events-none">{Math.round(scratched * 100)}%</div>
      </div>
    </div>
  );
}

function SpinDrum() {
  const [v, setV] = useState(0);
  useEffect(() => { const i = window.setInterval(() => setV((x) => (x + 1) % 999), 80); return () => window.clearInterval(i); }, []);
  return <span className="tabular-nums">{(v * 137).toLocaleString()}</span>;
}

function RevealedCard({ result }: { result: ScratchResult }) {
  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5 animate-feed-rise">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary"><Gift className="h-3 w-3" /> This week's bonus</div>
      <h3 className="font-display text-xl font-black mt-1 text-primary">{result.label}</h3>
      <p className="text-xs text-muted-foreground mt-1">Next scratch unlocks Monday.</p>
    </div>
  );
}
