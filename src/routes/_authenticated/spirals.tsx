import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Sparkles, X, Clock, TrendingDown, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { generateInsight } from "@/lib/insights.functions";

const SPIRAL_DEDUCT_KEY = "momentum:spiral-deduct";

export const Route = createFileRoute("/_authenticated/spirals")({
  component: Spirals,
});

interface Entry { id: string; action_label: string; points: number; created_at: string; }
type Range = "week" | "month" | "all";

function parseLabel(label: string): { topic: string; minutes: number; note: string } {
  // "Spiral: <topic> (Xm)[ — note]"
  const m = label.match(/^Spiral:\s*(.+?)\s*\((\d+)m\)(?:\s*—\s*(.*))?$/);
  if (!m) return { topic: label, minutes: 0, note: "" };
  return { topic: m[1], minutes: Number(m[2]), note: m[3] ?? "" };
}

function rangeStart(r: Range): Date | null {
  if (r === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "week") d.setDate(d.getDate() - 6);
  else { d.setDate(1); }
  return d;
}

function Spirals() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [note, setNote] = useState("");
  const [deduct, setDeduct] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try { setDeduct(JSON.parse(localStorage.getItem(SPIRAL_DEDUCT_KEY) ?? "false")); } catch { /* noop */ }
  }, []);

  async function addSpiral() {
    if (!user) return;
    setSaving(true);
    const min = Math.max(1, Math.min(240, Math.round(minutes)));
    const pts = deduct ? -Math.min(3000, 200 + min * 50) : 0;
    const t = topic.trim() || "binge search";
    const n = note.trim();
    const label = `Spiral: ${t} (${min}m)${n ? ` — ${n}` : ""}`;
    const { error } = await supabase.from("point_logs").insert({
      user_id: user.id, action_key: "spiral_logged", action_label: label, domain: "self_regulation", points: pts,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(pts < 0 ? `Logged. ${pts} pts — awareness > avoidance.` : `Logged. Awareness builds the loop.`);
    setOpen(false); setTopic(""); setNote(""); setMinutes(15);
    void load();
  }

  useEffect(() => { if (user) void load(); }, [user, range]);

  async function load() {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("point_logs").select("id,action_label,points,created_at")
      .eq("user_id", user.id).eq("action_key", "spiral_logged")
      .order("created_at", { ascending: false }).limit(500);
    const rs = rangeStart(range);
    if (rs) q = q.gte("created_at", rs.toISOString());
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setEntries((data as Entry[]) ?? []);
    setLoading(false);
  }

  async function deleteEntry(id: string) {
    if (!user) return;
    const { error } = await supabase.from("point_logs").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    void load();
  }

  const stats = useMemo(() => {
    const parsed = entries.map((e) => ({ ...e, ...parseLabel(e.action_label) }));
    const totalMin = parsed.reduce((s, p) => s + p.minutes, 0);
    const totalPts = parsed.reduce((s, p) => s + p.points, 0);
    const topicMap: Record<string, { count: number; minutes: number }> = {};
    for (const p of parsed) {
      const k = p.topic.toLowerCase();
      topicMap[k] ||= { count: 0, minutes: 0 };
      topicMap[k].count++;
      topicMap[k].minutes += p.minutes;
    }
    const topTopics = Object.entries(topicMap)
      .sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 5);
    // hour-of-day buckets
    const buckets = [0, 0, 0, 0]; // morning/afternoon/evening/night
    for (const p of parsed) {
      const h = new Date(p.created_at).getHours();
      if (h < 6) buckets[3]++;
      else if (h < 12) buckets[0]++;
      else if (h < 18) buckets[1]++;
      else buckets[2]++;
    }
    return { count: parsed.length, totalMin, totalPts, topTopics, buckets, parsed };
  }, [entries]);

  const gen = useServerFn(generateInsight);
  async function analyze() {
    if (entries.length === 0) { toast.info("Log a few spirals first."); return; }
    setAnalyzing(true); setAnalysis("");
    try {
      const insight = await gen({ data: { section: "spirals" } });
      setAnalysis(`${insight.title}\n\n${insight.body}${insight.suggested_action ? `\n\n→ ${insight.suggested_action}` : ""}`);
      toast.success("Saved to Insights. Open it to commit or verify.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const bucketLabels = ["Morning", "Afternoon", "Evening", "Late night"];
  const maxBucket = Math.max(1, ...stats.buckets);

  return (
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-5xl">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-destructive flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Awareness loop</p>
          <h1 className="font-display text-5xl font-black mt-1">Spirals.</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">Doom-scrolls, rabbit holes, binge gaming, porn, escorts, YouTube black holes — anything you lost time to. Naming it shrinks it. Patterns emerge.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setOpen(true)} className="rounded-full bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold flex items-center gap-1 hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Log spiral
          </button>
          <div className="flex gap-1">
            {(["week", "month", "all"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 text-xs font-medium border transition ${range === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                {r === "week" ? "7d" : r === "month" ? "Month" : "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Sessions</div>
          <div className="font-display text-3xl font-bold mt-1">{stats.count}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Total time</div>
          <div className="font-display text-3xl font-bold mt-1">{Math.floor(stats.totalMin / 60)}<span className="text-base text-muted-foreground">h </span>{stats.totalMin % 60}<span className="text-base text-muted-foreground">m</span></div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" /> Points cost</div>
          <div className={`font-display text-3xl font-bold mt-1 ${stats.totalPts < 0 ? "text-destructive" : ""}`}>{stats.totalPts.toLocaleString()}</div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Top topics</h2>
          <div className="mt-3 space-y-2">
            {stats.topTopics.length === 0 && <p className="text-sm text-muted-foreground">No spirals logged in this range.</p>}
            {stats.topTopics.map(([topic, v]) => (
              <div key={topic} className="flex items-center justify-between text-sm">
                <span className="truncate capitalize">{topic}</span>
                <span className="font-mono text-xs text-muted-foreground">{v.count}× · {v.minutes}m</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">When they hit</h2>
          <div className="mt-3 space-y-2">
            {stats.buckets.map((c, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs"><span>{bucketLabels[i]}</span><span className="font-mono text-muted-foreground">{c}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-destructive transition-all" style={{ width: `${(c / maxBucket) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">AI insight</h2>
          </div>
          <button onClick={analyze} disabled={analyzing || entries.length === 0} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {analyzing ? "Reading…" : analysis ? "Re-analyze" : "Analyze patterns"}
          </button>
        </div>
        {analysis ? (
          <>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">{analysis}</pre>
            <Link to="/insights" className="mt-3 inline-flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-primary hover:underline">Commit / verify in Insights <ArrowRight className="h-3 w-3" /></Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Get a calm, no-shame read on your spiral patterns — triggers, timing, and one experiment to try. Saved to Insights so you can commit and verify.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Log</h2>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && entries.length === 0 && <p className="text-sm text-muted-foreground">No spirals here yet. Tap <span className="text-destructive font-semibold">Log spiral</span> above when one happens.</p>}
          {entries.map((e) => {
            const p = parseLabel(e.action_label);
            const d = new Date(e.created_at);
            return (
              <div key={e.id} className="group flex items-center justify-between rounded-lg border border-border/50 bg-card px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate"><span className="font-semibold capitalize">{p.topic}</span> <span className="text-muted-foreground">· {p.minutes}m</span></div>
                  {p.note && <div className="text-xs text-muted-foreground truncate">{p.note}</div>}
                  <div className="text-[10px] font-mono text-muted-foreground">{d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`font-mono text-xs ${e.points < 0 ? "text-destructive" : "text-muted-foreground"}`}>{e.points >= 0 ? "" : ""}{e.points.toLocaleString()}</span>
                  <button onClick={() => deleteEntry(e.id)} title="Remove" aria-label="Remove spiral" className="text-muted-foreground hover:text-destructive transition p-1 -m-1"><X className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-mono text-xs uppercase tracking-widest">Log a spiral</span>
            </div>
            <h3 className="font-display text-2xl font-bold mt-1">Caught yourself.</h3>
            <p className="mt-2 text-sm text-muted-foreground">Doesn't have to be a screen — gaming sessions, escorts, porn, gambling, fantasy planning, anything you lost time to. Naming it shrinks it.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-muted-foreground">What were you doing?
                <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} placeholder="e.g. chess, porn, escorts, X feed, news, gambling" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="text-xs text-muted-foreground">Roughly how many minutes?
                <input type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} min={1} max={240} step={5} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted-foreground">Trigger or note (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. tired after work, anxious about X" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer rounded-lg border border-border bg-background px-3 py-2">
                <input type="checkbox" checked={deduct} onChange={(e) => { setDeduct(e.target.checked); try { localStorage.setItem(SPIRAL_DEDUCT_KEY, JSON.stringify(e.target.checked)); } catch { /* noop */ } }} />
                <span className="flex-1">Subtract points for this spiral</span>
                <span className={`font-mono ${deduct ? "text-destructive" : "text-muted-foreground"}`}>
                  {deduct ? `${(-Math.min(3000, 200 + Math.max(1, Math.min(240, minutes)) * 50)).toLocaleString()} pts` : "0 pts"}
                </span>
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Cancel</button>
              <button onClick={addSpiral} disabled={saving} className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50">{saving ? "Logging…" : "Log it"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
