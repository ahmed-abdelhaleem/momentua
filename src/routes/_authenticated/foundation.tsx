import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Shield, Flame, Timer, Lock, Unlock, ChevronRight, Sparkles, Compass, Heart, Brain, Users, ShieldCheck } from "lucide-react";
import {
  computeReadiness, monthStartISO, readinessPhase, redirectsFor, timeBand, underneathChips, weekStartISO,
  type FoundationSession, type ReadinessScore, type TriggerRow,
} from "@/lib/foundation";

export const Route = createFileRoute("/_authenticated/foundation")({
  component: Foundation,
});

function Foundation() {
  const { user } = useAuth();
  const [session, setSession] = useState<FoundationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [score, setScore] = useState<ReadinessScore | null>(null);
  const [reflection, setReflection] = useState<{ content: string; created_at: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { if (user) void load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [s, t, r] = await Promise.all([
      supabase.from("foundation_sessions").select("*").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("foundation_triggers").select("id,created_at,underneath,redirect_chosen,redirect_completed,resolution").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("foundation_reflections").select("content,created_at").eq("user_id", user.id).eq("month_start", monthStartISO()).maybeSingle(),
    ]);
    setSession((s.data as FoundationSession) ?? null);
    setTriggers((t.data as TriggerRow[]) ?? []);
    setReflection(r.data ?? null);
    if (s.data) {
      const sc = await computeReadiness(user.id);
      setScore(sc);
      // upsert weekly snapshot
      await supabase.from("foundation_readiness").upsert({
        user_id: user.id, session_id: (s.data as FoundationSession).id,
        week_start: weekStartISO(),
        physical: sc.physical, mental: sc.mental, social: sc.social, regulation: sc.regulation, total: sc.total,
      }, { onConflict: "user_id,week_start" });
    }
    setLoading(false);
  }

  async function generateReflection() {
    if (!user) return;
    setGenerating(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) throw new Error("Not signed in");
      const res = await fetch("/api/foundation-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setReflection({ content: j.content, created_at: j.created_at });
      toast.success("Honest Month ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setGenerating(false); }
  }

  if (loading) return <div className="p-8 font-mono text-xs text-muted-foreground">loading…</div>;

  return (
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-5xl">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-2"><Shield className="h-3.5 w-3.5" /> 6-Month Readiness Protocol</p>
        <h1 className="font-display text-5xl font-black mt-1">Foundation.</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">Not "I'm giving something up." It's "I'm spending 6 months becoming someone I'd actually want to be in a relationship with."</p>
      </div>

      {!session ? (
        <Activation onCreated={load} />
      ) : (
        <>
          <ActiveBanner session={session} />
          <Interception session={session} onLogged={load} />
          <Readiness score={score} />
          <HonestMonth reflection={reflection} onGenerate={generateReflection} generating={generating} />
          <RecentTriggers triggers={triggers} />
          <DangerZone session={session} onChange={load} />
        </>
      )}
    </div>
  );
}

/* ---------------- Activation ---------------- */
function Activation({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [why, setWhy] = useState("");
  const [want, setWant] = useState("");
  const [months, setMonths] = useState(6);
  const [bump, setBump] = useState(500);
  const [submitting, setSubmitting] = useState(false);

  async function activate() {
    if (!user) return;
    if (why.trim().length < 5 || want.trim().length < 5) { toast.error("Write a real why and want."); return; }
    setSubmitting(true);
    const ends = new Date(); ends.setMonth(ends.getMonth() + months);
    const { error } = await supabase.from("foundation_sessions").insert({
      user_id: user.id, ends_at: ends.toISOString(), duration_months: months,
      commitment_why: why.trim(), commitment_want: want.trim(), stake_bump_sek: bump, status: "active",
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Foundation Mode active.");
    onCreated();
  }

  return (
    <section className="mt-8 rounded-2xl border border-primary/40 bg-card p-6">
      <h2 className="font-display text-2xl font-bold">Activate Foundation Mode</h2>
      <p className="mt-1 text-sm text-muted-foreground">Time-locked. Once active, only deactivatable after a 72-hour reflection window + a written reason.</p>

      <div className="mt-5 grid gap-4">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Why I'm activating this</span>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="I'm activating this because…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">In {months} months I want to be…</span>
          <textarea value={want} onChange={(e) => setWant(e.target.value)} rows={2} placeholder="In 6 months I want to be…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Duration</span>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {[3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Stake bump (SEK / mo)</span>
            <input type="number" value={bump} min={0} step={100} onChange={(e) => setBump(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      <button disabled={submitting} onClick={activate} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        <Lock className="h-4 w-4" /> Lock in {months} months
      </button>
    </section>
  );
}

/* ---------------- Active banner ---------------- */
function ActiveBanner({ session }: { session: FoundationSession }) {
  const start = new Date(session.started_at);
  const end = new Date(session.ends_at);
  const now = Date.now();
  const total = end.getTime() - start.getTime();
  const elapsed = Math.max(0, Math.min(total, now - start.getTime()));
  const pct = Math.round((elapsed / total) * 100);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now) / 86400000));

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-primary">Active</div>
          <h2 className="font-display text-2xl font-bold mt-1">{daysLeft} days left</h2>
          <p className="text-xs text-muted-foreground mt-1">Started {start.toLocaleDateString()} → {end.toLocaleDateString()} · +{session.stake_bump_sek} SEK/mo stake</p>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-bold">{pct}%</div>
          <div className="text-xs text-muted-foreground">complete</div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-lg border border-border/60 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Why</div>
          <div className="mt-1">{session.commitment_why}</div>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">In {session.duration_months} months</div>
          <div className="mt-1">{session.commitment_want}</div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Interception ---------------- */
function Interception({ session, onLogged }: { session: FoundationSession; onLogged: () => void }) {
  const { user } = useAuth();
  const [active, setActive] = useState<{ id: string; underneath?: string; until: number } | null>(null);
  const [tick, setTick] = useState(0);
  const band = useMemo(() => timeBand(), [tick]);
  const redirects = useMemo(() => redirectsFor(band), [band]);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [active]);

  async function logUrge() {
    if (!user) return;
    const { data, error } = await supabase.from("foundation_triggers").insert({
      user_id: user.id, session_id: session.id,
    }).select().single();
    if (error) return toast.error(error.message);
    // Reward pause
    await supabase.from("point_logs").insert({
      user_id: user.id, action_key: "urge_intercepted", action_label: "Urge intercepted (Foundation)",
      domain: "self_regulation", points: 800,
    });
    setActive({ id: data.id, until: Date.now() + 10 * 60 * 1000 });
    toast.success("+800 pts. 10-minute pause started.");
    onLogged();
  }

  async function pickUnderneath(label: string) {
    if (!active || !user) return;
    await supabase.from("foundation_triggers").update({ underneath: label }).eq("id", active.id);
    setActive({ ...active, underneath: label });
  }

  async function pickRedirect(r: { key: string; label: string; points: number }) {
    if (!active || !user) return;
    await supabase.from("foundation_triggers").update({
      redirect_chosen: r.label, redirect_completed: true, resolution: "redirected", resolved_at: new Date().toISOString(),
    }).eq("id", active.id);
    await supabase.from("point_logs").insert({
      user_id: user.id, action_key: `redirect_${r.key}`, action_label: `Redirect: ${r.label}`,
      domain: "self_regulation", points: r.points,
    });
    toast.success(`+${r.points} pts.`);
    setActive(null);
    onLogged();
  }

  async function passed() {
    if (!active || !user) return;
    await supabase.from("foundation_triggers").update({
      resolution: "passed", resolved_at: new Date().toISOString(),
    }).eq("id", active.id);
    setActive(null);
    onLogged();
  }

  const remaining = active ? Math.max(0, active.until - Date.now()) : 0;
  const mm = Math.floor(remaining / 60000); const ss = Math.floor((remaining % 60000) / 1000);

  return (
    <section className="mt-6 rounded-2xl border border-destructive/40 bg-card p-6">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-destructive" />
        <h2 className="font-display text-lg font-bold">The interception layer</h2>
      </div>

      {!active ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">When the urge hits — to search, to book, to binge — tap once. The automatic hijack breaks.</p>
          <button onClick={logUrge} className="mt-4 w-full sm:w-auto rounded-full bg-destructive px-6 py-3 text-sm font-semibold text-destructive-foreground">
            Urge hit · +800 pts
          </button>
        </>
      ) : (
        <div className="mt-3 space-y-5">
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground"><Timer className="h-3.5 w-3.5" /> Pause window</div>
            <div className="font-display text-4xl font-bold mt-1 tabular-nums">{mm}:{ss.toString().padStart(2, "0")}</div>
            <p className="mt-2 text-sm">Noted. What's underneath this right now — boredom, loneliness, restlessness, something else?</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {underneathChips().map((c) => (
                <button key={c} onClick={() => pickUnderneath(c)} className={`rounded-full border px-3 py-1 text-xs ${active.underneath === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Redirect — {band.replace("_", " ")}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {redirects.map((r) => (
                <button key={r.key} onClick={() => pickRedirect(r)} className="text-left rounded-xl border border-border bg-background hover:bg-accent p-3 transition">
                  <div className="text-sm font-semibold">{r.label}</div>
                  {r.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{r.hint}</div>}
                  <div className="text-[11px] font-mono text-primary mt-1">+{r.points} pts</div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={passed} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            It passed on its own <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Readiness ---------------- */
function Readiness({ score }: { score: ReadinessScore | null }) {
  const s = score ?? { physical: 0, mental: 0, social: 0, regulation: 0, total: 0 };
  const pillars = [
    { key: "physical", label: "Physical presence", icon: Heart, value: s.physical },
    { key: "mental", label: "Mental clarity", icon: Brain, value: s.mental },
    { key: "social", label: "Social range", icon: Users, value: s.social },
    { key: "regulation", label: "Self-regulation", icon: ShieldCheck, value: s.regulation },
  ];
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-2"><Flame className="h-3.5 w-3.5" /> Readiness Score</div>
          <h2 className="font-display text-lg font-bold mt-1">Private — only you see this</h2>
        </div>
        <div className="text-right">
          <div className="font-display text-5xl font-black">{s.total}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">/ 100</div>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{readinessPhase(s.total)}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {pillars.map((p) => (
          <div key={p.key} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><p.icon className="h-3.5 w-3.5" /> {p.label}</span>
              <span className="font-mono">{p.value}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${p.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Honest Month ---------------- */
function HonestMonth({ reflection, onGenerate, generating }: { reflection: { content: string; created_at: string } | null; onGenerate: () => void; generating: boolean }) {
  return (
    <section className="mt-6 rounded-2xl border border-primary/40 bg-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">Honest Month</h2>
        </div>
        <button onClick={onGenerate} disabled={generating} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {generating ? "Reading…" : reflection ? "Regenerate" : "Generate this month"}
        </button>
      </div>
      {reflection ? (
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">{reflection.content}</pre>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">A grounded read of the last 30 days — not surveillance, your own data played back to you.</p>
      )}
    </section>
  );
}

/* ---------------- Recent triggers ---------------- */
function RecentTriggers({ triggers }: { triggers: TriggerRow[] }) {
  if (triggers.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl font-bold">Recent trigger log</h2>
      <div className="mt-3 space-y-2">
        {triggers.slice(0, 12).map((t) => (
          <div key={t.id} className="rounded-lg border border-border/50 bg-card px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate">
                  <span className="capitalize">{t.underneath ?? "logged"}</span>
                  {t.redirect_chosen && <span className="text-muted-foreground"> → {t.redirect_chosen}</span>}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
              </div>
              <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${t.redirect_completed ? "border-primary/40 text-primary" : t.resolution === "passed" ? "border-border text-muted-foreground" : "border-destructive/40 text-destructive"}`}>
                {t.redirect_completed ? "redirected" : t.resolution ?? "open"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Danger zone ---------------- */
function DangerZone({ session, onChange }: { session: FoundationSession; onChange: () => void }) {
  const [reason, setReason] = useState("");
  const requested = session.deactivation_requested_at ? new Date(session.deactivation_requested_at) : null;
  const cooldownEnd = requested ? new Date(requested.getTime() + 72 * 3600 * 1000) : null;
  const canDeactivate = cooldownEnd ? Date.now() >= cooldownEnd.getTime() : false;

  async function request() {
    if (reason.trim().length < 10) { toast.error("Write a real reason (10+ chars)."); return; }
    const { error } = await supabase.from("foundation_sessions").update({
      deactivation_requested_at: new Date().toISOString(), deactivation_reason: reason.trim(),
    }).eq("id", session.id);
    if (error) return toast.error(error.message);
    toast.success("72-hour reflection window started.");
    onChange();
  }

  async function confirmDeactivate() {
    const { error } = await supabase.from("foundation_sessions").update({
      status: "deactivated", ended_at: new Date().toISOString(),
    }).eq("id", session.id);
    if (error) return toast.error(error.message);
    toast.success("Foundation Mode deactivated.");
    onChange();
  }

  async function complete() {
    const { error } = await supabase.from("foundation_sessions").update({
      status: "completed", ended_at: new Date().toISOString(),
    }).eq("id", session.id);
    if (error) return toast.error(error.message);
    toast.success("Foundation Mode completed.");
    onChange();
  }

  const ended = new Date(session.ends_at).getTime() <= Date.now();

  return (
    <section className="mt-10 rounded-2xl border border-border/60 p-6">
      <h2 className="font-display text-sm font-bold text-muted-foreground">Manage</h2>
      {ended && (
        <button onClick={complete} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
          Mark complete & summarize
        </button>
      )}
      {!requested && !ended && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">Deactivating starts a 72-hour reflection window before the session ends.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why now?" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <button onClick={request} className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-accent">
            <Unlock className="h-3 w-3" /> Request deactivation
          </button>
        </div>
      )}
      {requested && !canDeactivate && (
        <p className="mt-3 text-xs text-muted-foreground">Reflection window ends {cooldownEnd!.toLocaleString()}. Come back then.</p>
      )}
      {requested && canDeactivate && (
        <button onClick={confirmDeactivate} className="mt-3 rounded-full border border-destructive/60 px-3 py-1 text-xs text-destructive hover:bg-destructive/10">
          Confirm deactivation
        </button>
      )}
      <div className="mt-4 text-[11px] text-muted-foreground">
        <Link to="/dashboard" className="underline">Back to Today</Link>
      </div>
    </section>
  );
}
