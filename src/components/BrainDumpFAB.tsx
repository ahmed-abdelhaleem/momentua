import { useEffect, useRef, useState } from "react";
import { Brain, X, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type SRLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void; stop: () => void;
  abort?: () => void;
};

/**
 * Persistent floating brain dump. One tap → full-screen overlay, keyboard auto-opens,
 * voice optional, +100 pts on save. Designed to be faster than a browser search bar.
 */
export function BrainDumpFAB() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const [recording, setRecording] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => taRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // After 8s idle, surface a save hint
  useEffect(() => {
    if (!open) return;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    setSavedHint(false);
    idleTimer.current = window.setTimeout(() => setSavedHint(true), 8000);
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
  }, [text, open]);

  async function save() {
    if (!user || !text.trim()) { setOpen(false); return; }
    const content = text.trim();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("brain_dumps").insert({ user_id: user.id, content }),
      supabase.from("point_logs").insert({ user_id: user.id, action_key: "brain_dump_capture", action_label: "Brain dump captured", domain: "mental", points: 100 }),
    ]);
    if (e1 || e2) toast.error((e1 ?? e2)!.message); else toast.success("+100 pts — captured.");
    setText(""); setOpen(false);
  }

  function startVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike; __ace_rec?: SRLike };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { toast.info("Voice capture not supported on this browser."); return; }
    // Stop any prior instance to avoid two recognizers stacking results.
    try { w.__ace_rec?.stop(); } catch { /* noop */ }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    // Some browsers (notably WebKit/iOS) keep ev.results cumulative across events
    // AND re-emit earlier finals; others reset and use ev.resultIndex to mark the
    // first NEW result. Iterating from 0 caused "okayokayokay I…" duplication.
    // Fix: only consume results from ev.resultIndex, append finals to a running
    // buffer once, and re-render with the latest interim slice.
    let finalBuf = text;
    r.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalBuf = (finalBuf + " " + tr).replace(/\s+/g, " ").trim();
        else interim += tr;
      }
      setText((finalBuf + " " + interim).replace(/\s+/g, " ").trim());
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);
    r.start(); setRecording(true);
    w.__ace_rec = r;
  }
  function stopVoice() {
    const w = window as unknown as { __ace_rec?: SRLike };
    try { w.__ace_rec?.stop(); } catch { /* noop */ }
    w.__ace_rec = undefined;
    setRecording(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Brain dump"
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-stake flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Brain className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Brain dump · +100 pts on save</div>
            <button onClick={() => { setText(""); setOpen(false); }} className="rounded-full p-2 hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 p-5 overflow-y-auto">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Anything. No structure required."
              className="w-full h-full min-h-[40vh] resize-none bg-transparent font-display text-2xl md:text-3xl leading-snug placeholder:text-muted-foreground/50 focus:outline-none"
            />
            {!text && <div className="-mt-1 cursor-slow font-display text-2xl md:text-3xl text-primary/60" aria-hidden />}
          </div>
          <div className="p-4 border-t border-border flex items-center justify-between gap-3">
            <button
              onClick={recording ? stopVoice : startVoice}
              className={`rounded-full p-3 border ${recording ? "border-destructive text-destructive animate-pulse" : "border-border hover:bg-accent"}`}
              aria-label="Voice"
            >
              <Mic className="h-4 w-4" />
            </button>
            <div className="text-[11px] font-mono text-muted-foreground">{savedHint ? "Done? → Save & close" : `${text.trim().length ? text.trim().split(/\s+/).length : 0} words`}</div>
            <button onClick={save} className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:scale-[1.02] transition-transform">Save & close</button>
          </div>
        </div>
      )}
    </>
  );
}
