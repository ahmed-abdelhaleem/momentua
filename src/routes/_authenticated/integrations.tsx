import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Activity, Banknote, Check, Heart, Landmark, Loader2, Moon, Plus,
  RefreshCw, Trash2, Unlink, Footprints, Dumbbell,
} from "lucide-react";
import { computeHealthPoints, confirmHealthEntry, getHealthEntry } from "@/lib/health.functions";
import {
  bankStatus, completeBankLink, disconnectBank, listBankData,
  listSwedishBanks, startBankLink, syncBank,
} from "@/lib/gocardless.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Integrations — MOMENTUM" },
      { name: "description", content: "Connect health and bank data: confirm daily movement, sleep, and pull expenses from Swedish banks via GoCardless (free for individuals)." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const WORKOUT_KINDS = ["walk", "run", "gym", "yoga", "bike", "other"] as const;
type Workout = { kind: (typeof WORKOUT_KINDS)[number]; minutes: number };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IntegrationsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
            <p className="text-xs text-muted-foreground">Health · Banking</p>
          </div>
          <Link to="/dashboard" className="text-xs text-muted-foreground underline-offset-4 hover:underline">Back</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <HealthCard />
        <BankCard />
      </main>
    </div>
  );
}

/* ---------------- Health ---------------- */

function HealthCard() {
  const fetchEntry = useServerFn(getHealthEntry);
  const confirm = useServerFn(confirmHealthEntry);
  const [date, setDate] = useState(todayISO());
  const [steps, setSteps] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { entry } = await fetchEntry({ data: { entry_date: date } });
      if (entry) {
        setSteps(entry.steps ?? 0);
        setSleep(Number(entry.sleep_hours ?? 0));
        setWorkouts((entry.workouts as Workout[]) ?? []);
        setConfirmedAt(entry.confirmed_at ?? null);
      } else {
        setSteps(0); setSleep(0); setWorkouts([]); setConfirmedAt(null);
      }
    } finally {
      setLoading(false);
    }
  }, [date, fetchEntry]);

  useEffect(() => { load(); }, [load]);

  const points = computeHealthPoints({ steps, sleep_hours: sleep, workouts });

  const onConfirm = async () => {
    setSaving(true);
    try {
      const r = await confirm({ data: { entry_date: date, steps, sleep_hours: sleep, workouts } });
      setConfirmedAt(new Date().toISOString());
      toast.success(r.delta > 0 ? `+${r.delta} points awarded` : r.delta < 0 ? `${r.delta} points adjusted` : "Saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addWorkout = (kind: Workout["kind"]) => setWorkouts((w) => [...w, { kind, minutes: 30 }]);
  const updateWorkout = (i: number, mins: number) => setWorkouts((w) => w.map((x, j) => j === i ? { ...x, minutes: mins } : x));
  const removeWorkout = (i: number) => setWorkouts((w) => w.filter((_, j) => j !== i));

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" />
          <h2 className="text-base font-semibold">Health — {date === todayISO() ? "today" : date}</h2>
        </div>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value || todayISO())}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Footprints className="h-3 w-3" /> Steps</span>
              <input type="number" inputMode="numeric" value={steps} onChange={(e) => setSteps(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Moon className="h-3 w-3" /> Sleep (h)</span>
              <input type="number" step="0.5" min="0" max="14" value={sleep} onChange={(e) => setSleep(Math.max(0, Math.min(14, Number(e.target.value) || 0)))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Dumbbell className="h-3 w-3" /> Workouts</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {WORKOUT_KINDS.map((k) => (
                <button key={k} onClick={() => addWorkout(k)}
                  className="text-xs rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 hover:bg-secondary">
                  + {k}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5">
              {workouts.map((w, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="capitalize w-16">{w.kind}</span>
                  <input type="number" min={1} max={600} value={w.minutes}
                    onChange={(e) => updateWorkout(i, Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm" />
                  <span className="text-xs text-muted-foreground">min</span>
                  <button onClick={() => removeWorkout(i)} className="ml-auto text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">{points} pts</span>
              {confirmedAt && <span className="text-xs text-muted-foreground">confirmed</span>}
            </div>
            <button onClick={onConfirm} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {confirmedAt ? "Update" : "Confirm"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">+1 pt per 1k steps · +5 if sleep ≥7h (+2 if ≥6h) · +1 per 10 min workout.</p>
        </>
      )}
    </section>
  );
}

/* ---------------- Banking ---------------- */

type BankData = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listBankData>>>>;
type Bank = { id: string; name: string; logo?: string };

function BankCard() {
  const status = useServerFn(bankStatus);
  const start = useServerFn(startBankLink);
  const complete = useServerFn(completeBankLink);
  const list = useServerFn(listBankData);
  const sync = useServerFn(syncBank);
  const banks = useServerFn(listSwedishBanks);
  const disconnect = useServerFn(disconnectBank);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [data, setData] = useState<BankData | null>(null);
  const [bankList, setBankList] = useState<Bank[]>([]);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const d = await list();
    setData(d);
  }, [list]);

  useEffect(() => {
    status().then((s) => setConfigured(s.configured));
    reload();
  }, [reload, status]);

  // Handle redirect: ?bank_ref=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get("bank_ref");
    const err = sp.get("bank_error");
    if (err) toast.error(`Bank connection error: ${err}`);
    if (ref) {
      setBusy(true);
      complete({ data: { reference: ref } })
        .then(() => { toast.success("Bank connected"); reload(); })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Connect failed"))
        .finally(() => {
          setBusy(false);
          const url = new URL(window.location.href);
          url.searchParams.delete("bank_ref");
          url.searchParams.delete("bank_error");
          window.history.replaceState({}, "", url.toString());
        });
    }
  }, [complete, reload]);

  const openPicker = async () => {
    setPicking(true);
    if (bankList.length === 0) {
      try {
        const r = await banks();
        setBankList(r.banks);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load bank list");
      }
    }
  };

  const onConnect = async (institution_id: string) => {
    setBusy(true);
    try {
      const redirect = `${window.location.origin}/api/gocardless/callback`;
      const r = await start({ data: { institution_id, redirect_uri: redirect } });
      if (r.error || !r.url) { toast.error(r.error ?? "Cannot start"); return; }
      window.location.href = r.url;
    } finally {
      setBusy(false);
    }
  };

  const onSync = async (id: string) => {
    setBusy(true);
    try {
      await sync({ data: { connection_id: id } });
      await reload();
      toast.success("Synced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally { setBusy(false); }
  };

  const onDisconnect = async (id: string) => {
    if (!confirm("Disconnect this bank?")) return;
    await disconnect({ data: { connection_id: id } });
    toast.success("Disconnected");
    reload();
  };

  const totalSpent = useMemo(() => {
    if (!data) return 0;
    return data.transactions
      .filter((t: { amount: number | string }) => Number(t.amount) < 0)
      .reduce((s: number, t: { amount: number | string }) => s + Math.abs(Number(t.amount)), 0);
  }, [data]);

  const filteredBanks = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return bankList;
    return bankList.filter((b) => b.name.toLowerCase().includes(q));
  }, [bankList, filter]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-blue-500" />
          <h2 className="text-base font-semibold">Banking</h2>
        </div>
        <button onClick={reload} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </header>

      {configured === false && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <div className="font-semibold">Banking isn't configured.</div>
          <p>
            GoCardless Bank Account Data has paused new signups, so a fresh account isn't possible right now.
            If you already hold <code className="font-mono">GOCARDLESS_SECRET_ID</code> and <code className="font-mono">GOCARDLESS_SECRET_KEY</code>, paste them in project secrets and the connect flow will work.
            Otherwise this section will stay dormant until a Swedish PSD2 alternative for individuals is wired up.
          </p>
        </div>
      )}

      {picking && (
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pick your bank</span>
            <button onClick={() => setPicking(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search Nordea, SEB, Revolut…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <ul className="max-h-64 overflow-y-auto divide-y divide-border/40">
            {filteredBanks.length === 0 && <li className="py-3 text-xs text-muted-foreground">{bankList.length === 0 ? "Loading banks…" : "No matches."}</li>}
            {filteredBanks.map((b) => (
              <li key={b.id}>
                <button onClick={() => onConnect(b.id)} disabled={busy}
                  className="w-full flex items-center gap-3 py-2 text-left hover:bg-background/50 rounded-md px-2 disabled:opacity-50">
                  {b.logo ? <img src={b.logo} alt="" className="h-6 w-6 rounded" /> : <span className="h-6 w-6 rounded bg-muted" />}
                  <span className="text-sm">{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.connections.length === 0 && !picking ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Connect Nordea, SEB, Handelsbanken, Swedbank, Revolut, ICA Banken and more via PSD2. Free for personal use, consent lasts ~90 days.
          </p>
          <button onClick={openPicker} disabled={busy || configured === false}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Connect a bank
          </button>
        </div>
      ) : data && !picking ? (
        <>
          <ul className="space-y-2">
            {data.connections.map((c: { id: string; institution_name?: string | null; status?: string | null; last_sync_at?: string | null }) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{c.institution_name ?? "Bank"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.status} · last sync {c.last_sync_at ? new Date(c.last_sync_at).toLocaleDateString() : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onSync(c.id)} disabled={busy} className="text-muted-foreground hover:text-foreground" title="Sync">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button onClick={() => onDisconnect(c.id)} className="text-muted-foreground hover:text-destructive" title="Disconnect">
                    <Unlink className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button onClick={openPicker} disabled={busy} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add another bank
          </button>

          <div className="rounded-xl bg-secondary/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Spent (30d)</span>
              <span className="font-semibold">{totalSpent.toFixed(0)} SEK</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Recent transactions</h3>
            <ul className="divide-y divide-border/40">
              {data.transactions.slice(0, 25).map((t: { id: string; merchant?: string | null; description?: string | null; booked_date: string; category?: string | null; amount: number | string; currency: string }) => (
                <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{t.merchant ?? t.description ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{t.booked_date} · {t.category ?? "other"}</div>
                  </div>
                  <div className={`tabular-nums font-medium ${Number(t.amount) < 0 ? "text-foreground" : "text-emerald-600"}`}>
                    {Number(t.amount).toFixed(2)} {t.currency}
                  </div>
                </li>
              ))}
              {data.transactions.length === 0 && (
                <li className="py-3 text-xs text-muted-foreground">No transactions yet.</li>
              )}
            </ul>
          </div>
        </>
      ) : !data ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : null}
    </section>
  );
}
