import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, CheckCircle2, Circle, Flag, X, RefreshCw, TrendingUp, AlertTriangle, Shield, MessageCircle, Utensils, Activity, Layers } from "lucide-react";
import { toast } from "sonner";
import { generateInsight, listInsights, setInsightStatus, verifyInsight, getInsightProgress } from "@/lib/insights.functions";
import { normalizeStoredInsight } from "@/lib/insight-format";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
  head: () => ({ meta: [{ title: "Insights — MOMENTUM" }, { name: "robots", content: "noindex" }] }),
});

type Insight = Awaited<ReturnType<typeof listInsights>>[number];
type Section = "spirals" | "foundation" | "ace" | "vault" | "health" | "overall";

const SECTION_META: Record<Section, { label: string; icon: typeof Sparkles; tone: string }> = {
  spirals: { label: "Spirals", icon: AlertTriangle, tone: "text-destructive" },
  foundation: { label: "Foundation", icon: Shield, tone: "text-primary" },
  ace: { label: "ACE", icon: MessageCircle, tone: "text-primary" },
  vault: { label: "Vault", icon: Sparkles, tone: "text-primary" },
  health: { label: "Health", icon: Activity, tone: "text-primary" },
  overall: { label: "Overall", icon: Layers, tone: "text-foreground" },
};

function InsightsPage() {
  const list = useServerFn(listInsights);
  const gen = useServerFn(generateInsight);
  const setStatus = useServerFn(setInsightStatus);
  const verify = useServerFn(verifyInsight);
  const progress = useServerFn(getInsightProgress);

  const [rows, setRows] = useState<Insight[]>([]);
  const [filter, setFilter] = useState<Section | "all">("all");
  const [statusGroup, setStatusGroup] = useState<"open" | "done" | "all">("open");
  const [prog, setProg] = useState<Awaited<ReturnType<typeof getInsightProgress>> | null>(null);
  const [genFor, setGenFor] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        list({ data: { section: filter, statusGroup } }),
        progress(),
      ]);
      setRows(r); setProg(p);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filter, statusGroup]);

  async function doGenerate(section: Section) {
    setGenFor(section);
    try { await gen({ data: { section } }); toast.success(`New ${section} insight ready`); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setGenFor(null); }
  }

  async function doStatus(id: string, status: "acknowledged" | "committed" | "dismissed") {
    try { await setStatus({ data: { id, status } }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function doVerify(id: string, outcome: "yes" | "partial" | "no") {
    try {
      const res = await verify({ data: { id, outcome } });
      toast.success(res.delta != null ? `Logged. Delta: ${res.delta > 0 ? "+" : ""}${res.delta}%` : "Verified");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const grouped = useMemo(() => {
    const now = Date.now();
    const needsVerify: Insight[] = [];
    const committed: Insight[] = [];
    const fresh: Insight[] = [];
    const acked: Insight[] = [];
    const done: Insight[] = [];
    for (const r of rows) {
      if (r.status === "committed") {
        const due = r.commit_deadline_at ? new Date(r.commit_deadline_at).getTime() : Infinity;
        if (due <= now) needsVerify.push(r); else committed.push(r);
      } else if (r.status === "new") fresh.push(r);
      else if (r.status === "acknowledged") acked.push(r);
      else done.push(r);
    }
    return { needsVerify, committed, fresh, acked, done };
  }, [rows]);

  const sections: Section[] = ["overall", "spirals", "foundation", "vault", "health", "ace"];

  return (
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-5xl">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> Signal &gt; noise</p>
        <h1 className="font-display text-4xl sm:text-5xl font-black mt-1">Insights.</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">Read it. Commit to one experiment. Verify what happened. Progress is the ratio of insights you actually acted on — plus how much the underlying numbers moved.</p>
      </div>

      {/* Scorecard */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <ScoreCard label="Completion" value={prog?.overall.completion != null ? `${prog.overall.completion}%` : "—"} sub={prog ? `${prog.overall.verified} of ${prog.overall.committed} verified` : ""} />
        <ScoreCard label="Avg delta" value={prog?.overall.delta != null ? `${prog.overall.delta > 0 ? "+" : ""}${prog.overall.delta}%` : "—"} sub="across verified insights" tone={prog?.overall.delta != null && prog.overall.delta >= 0 ? "good" : prog?.overall.delta != null ? "bad" : "neutral"} />
        <ScoreCard label="Open" value={String(grouped.needsVerify.length + grouped.committed.length + grouped.fresh.length)} sub={`${grouped.needsVerify.length} need verification`} />
      </section>

      {/* Generate row */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Generate new insight</div>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => {
            const M = SECTION_META[s];
            return (
              <button key={s} onClick={() => doGenerate(s)} disabled={genFor === s}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                <M.icon className={`h-3.5 w-3.5 ${M.tone}`} />
                {genFor === s ? "Reading…" : M.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Filters */}
      <section className="mt-6 flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1">
          {(["all", ...sections] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
              {s === "all" ? "All" : SECTION_META[s as Section].label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["open", "done", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatusGroup(s)}
              className={`rounded-full px-3 py-1 text-xs border ${statusGroup === s ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent"}`}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {loading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No insights here. Tap a section above to generate one.</p>
        </div>
      )}

      {!loading && (
        <>
          {grouped.needsVerify.length > 0 && (
            <Group title="Needs verification" tone="destructive">
              {grouped.needsVerify.map((i) => <Card key={i.id} insight={i} onVerify={doVerify} onStatus={doStatus} />)}
            </Group>
          )}
          {grouped.committed.length > 0 && (
            <Group title="Committed">
              {grouped.committed.map((i) => <Card key={i.id} insight={i} onVerify={doVerify} onStatus={doStatus} />)}
            </Group>
          )}
          {grouped.fresh.length > 0 && (
            <Group title="New">
              {grouped.fresh.map((i) => <Card key={i.id} insight={i} onVerify={doVerify} onStatus={doStatus} />)}
            </Group>
          )}
          {grouped.acked.length > 0 && (
            <Group title="Acknowledged">
              {grouped.acked.map((i) => <Card key={i.id} insight={i} onVerify={doVerify} onStatus={doStatus} />)}
            </Group>
          )}
          {grouped.done.length > 0 && (
            <Group title="Archived">
              {grouped.done.map((i) => <Card key={i.id} insight={i} onVerify={doVerify} onStatus={doStatus} />)}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function ScoreCard({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Group({ title, tone, children }: { title: string; tone?: "destructive"; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className={`text-xs font-mono uppercase tracking-widest mb-2 ${tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Card({ insight, onVerify, onStatus }: {
  insight: Insight;
  onVerify: (id: string, outcome: "yes" | "partial" | "no") => void;
  onStatus: (id: string, status: "acknowledged" | "committed" | "dismissed") => void;
}) {
  const sec = (insight.section ?? "overall") as Section;
  const M = SECTION_META[sec] ?? SECTION_META.overall;
  const created = new Date(insight.created_at);
  const overdue = insight.status === "committed" && insight.commit_deadline_at && new Date(insight.commit_deadline_at).getTime() <= Date.now();
  const isVerified = insight.status?.startsWith("verified_");

  return (
    <article className={`rounded-2xl border bg-card p-4 sm:p-5 ${overdue ? "border-destructive/60" : "border-border"}`}>
      <div className="flex items-center gap-2 text-xs">
        <M.icon className={`h-3.5 w-3.5 ${M.tone}`} />
        <span className="font-mono uppercase tracking-widest text-muted-foreground">{M.label}</span>
        <span className="text-muted-foreground">· {created.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        {insight.delta_pct != null && (
          <span className={`ml-auto font-mono ${insight.delta_pct >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {insight.delta_pct >= 0 ? "+" : ""}{insight.delta_pct}%
          </span>
        )}
      </div>
      {(() => {
        const n = normalizeStoredInsight(insight.title, insight.body, insight.suggested_action ?? null);
        return (
          <>
            <h3 className="font-display text-lg font-bold mt-2">{n.title}</h3>
            <div className="mt-2 text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{n.body}</div>
            {n.suggested_action && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">Try this</span>
                <div className="mt-0.5 text-foreground">{n.suggested_action}</div>
              </div>
            )}
          </>
        );
      })()}

      {/* Actions */}
      {!isVerified && (
        <div className="mt-4 flex flex-wrap gap-2">
          {insight.status === "committed" ? (
            <>
              <button onClick={() => onVerify(insight.id, "yes")} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"><CheckCircle2 className="h-3.5 w-3.5" /> Yes, it stuck</button>
              <button onClick={() => onVerify(insight.id, "partial")} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent">Partial</button>
              <button onClick={() => onVerify(insight.id, "no")} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent">No</button>
            </>
          ) : (
            <>
              <button onClick={() => onStatus(insight.id, "committed")} className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"><Flag className="h-3.5 w-3.5" /> Commit</button>
              <button onClick={() => onStatus(insight.id, "acknowledged")} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"><Circle className="h-3.5 w-3.5" /> Acknowledge</button>
              <button onClick={() => onStatus(insight.id, "dismissed")} className="inline-flex items-center gap-1 rounded-full text-muted-foreground hover:text-destructive px-2 py-1.5 text-xs font-semibold ml-auto"><X className="h-3.5 w-3.5" /> Dismiss</button>
            </>
          )}
        </div>
      )}
      {insight.status === "committed" && insight.commit_deadline_at && (
        <div className={`mt-2 text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          Verify by {new Date(insight.commit_deadline_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </div>
      )}
    </article>
  );
}
