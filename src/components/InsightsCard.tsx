import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { listInsights, verifyInsight } from "@/lib/insights.functions";
import { normalizeStoredInsight } from "@/lib/insight-format";
import { toast } from "sonner";

type Insight = Awaited<ReturnType<typeof listInsights>>[number];

export function InsightsCard() {
  const list = useServerFn(listInsights);
  const verify = useServerFn(verifyInsight);
  const [rows, setRows] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setRows(await list({ data: { statusGroup: "open", limit: 20 } })); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const now = Date.now();
  const verifyDue = rows.find((r) => r.status === "committed" && r.commit_deadline_at && new Date(r.commit_deadline_at).getTime() <= now);
  const top = rows.filter((r) => r.status === "new" || r.status === "acknowledged").slice(0, 3);

  if (loading) return null;
  if (top.length === 0 && !verifyDue) return null;

  async function doVerify(id: string, outcome: "yes" | "partial" | "no") {
    try { await verify({ data: { id, outcome } }); toast.success("Logged"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-bold">Insights</h2>
        </div>
        <Link to="/insights" className="text-xs font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1 hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {verifyDue && (() => {
        const n = normalizeStoredInsight(verifyDue.title, verifyDue.body, verifyDue.suggested_action ?? null);
        return (
          <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-destructive">Verify due</div>
            <div className="text-sm font-semibold mt-0.5">{n.title}</div>
            {n.suggested_action && <p className="text-xs text-muted-foreground mt-1">{n.suggested_action}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => doVerify(verifyDue.id, "yes")} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-1 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> Yes</button>
              <button onClick={() => doVerify(verifyDue.id, "partial")} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">Partial</button>
              <button onClick={() => doVerify(verifyDue.id, "no")} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">No</button>
            </div>
          </div>
        );
      })()}

      {top.length > 0 && (
        <ul className="mt-3 space-y-2">
          {top.map((i) => (
            <li key={i.id}>
              {(() => {
                const n = normalizeStoredInsight(i.title, i.body, i.suggested_action ?? null);
                return (
                  <Link to="/insights" className="block rounded-lg border border-border bg-background px-3 py-2 hover:bg-accent transition">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{i.section}</div>
                    <div className="text-sm font-semibold truncate">{n.title}</div>
                    {n.suggested_action && <div className="text-xs text-muted-foreground truncate">→ {n.suggested_action}</div>}
                  </Link>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
