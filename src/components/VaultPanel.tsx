import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STAKE_TIERS } from "@/lib/points-catalog";
import { toast } from "sonner";
import { PiggyBank, ArrowUpRight, Plus, ShieldCheck, X } from "lucide-react";

type Stake = { monthly_amount_sek: number; recovered_amount_sek: number };
type Transfer = { id: string; amount: number; currency: string; destination_label: string | null; note: string | null; transferred_on: string; month_start: string };

/**
 * Self-savings Vault panel.
 *
 * The app NEVER holds funds. The user picks a monthly commitment and a
 * destination they own (savings, ISK, travel fund…). Behavior earns the
 * goal "back" as % progress. At month-end the user transfers the remainder
 * to their own account and logs it here — this becomes their proof trail.
 */
export function VaultPanel({ monthPoints, targetPoints }: { monthPoints: number; targetPoints: number }) {
  const { user } = useAuth();
  const [stake, setStake] = useState<Stake | null>(null);
  const [currency, setCurrency] = useState("SEK");
  const [destination, setDestination] = useState<string>("");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tAmount, setTAmount] = useState<number>(0);
  const [tNote, setTNote] = useState("");
  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }, []);

  async function load() {
    if (!user) return;
    const [{ data: stakeRow }, { data: profRow }, { data: transferRows }] = await Promise.all([
      supabase.from("stakes").select("monthly_amount_sek,recovered_amount_sek").eq("user_id", user.id).eq("month_start", monthStart).maybeSingle(),
      supabase.from("profiles").select("currency,vault_destination_label").eq("id", user.id).maybeSingle(),
      supabase.from("vault_transfers").select("*").eq("user_id", user.id).eq("month_start", monthStart).order("transferred_on", { ascending: false }),
    ]);
    setStake(stakeRow);
    if (profRow?.currency) setCurrency(profRow.currency);
    if (profRow?.vault_destination_label) setDestination(profRow.vault_destination_label);
    setTransfers((transferRows as Transfer[] | null) ?? []);
  }
  useEffect(() => { void load(); }, [user, monthStart]);

  const monthly = stake?.monthly_amount_sek ?? 0;
  const recovered = monthly > 0 ? Math.min(monthPoints / targetPoints, 1) : 0;
  const earnedBack = Math.round(recovered * monthly);
  const remaining = Math.max(0, monthly - earnedBack);
  const transferredTotal = useMemo(() => transfers.reduce((s, t) => s + Number(t.amount), 0), [transfers]);
  const remainingToTransfer = Math.max(0, remaining - transferredTotal);

  async function pickStake(amount: number) {
    if (!user) return;
    const tier = amount === 500 ? "starter" : amount === 1000 ? "standard" : amount === 2000 ? "committed" : "all_in";
    const { error } = await supabase.from("stakes").upsert({
      user_id: user.id, tier, monthly_amount_sek: amount, month_start: monthStart,
    }, { onConflict: "user_id,month_start" });
    if (error) return toast.error(error.message);
    toast.success(`Vault goal set: ${amount.toLocaleString()} ${currency}`);
    void load();
  }

  async function saveSettings() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ currency, vault_destination_label: destination || null }).eq("id", user.id);
    if (error) return toast.error(error.message);
    setShowSettings(false);
    toast.success("Vault settings saved.");
    void load();
  }

  async function logTransfer() {
    if (!user || tAmount <= 0) return;
    const { error } = await supabase.from("vault_transfers").insert({
      user_id: user.id, amount: tAmount, currency,
      destination_label: destination || null, note: tNote || null,
      transferred_on: new Date().toISOString().slice(0, 10), month_start: monthStart,
    });
    if (error) return toast.error(error.message);
    toast.success(`Logged ${tAmount.toLocaleString()} ${currency} transferred.`);
    setShowTransfer(false); setTAmount(0); setTNote("");
    void load();
  }

  async function deleteTransfer(id: string) {
    if (!confirm("Remove this transfer entry?")) return;
    await supabase.from("vault_transfers").delete().eq("id", id);
    void load();
  }

  return (
    <>
    <section className="mt-8 rounded-2xl border border-primary/30 bg-card shadow-stake overflow-hidden">
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
              <PiggyBank className="h-3.5 w-3.5" /> Self-savings Vault
            </div>
            <div className="font-display text-4xl font-black mt-1">
              <span className="text-primary">{earnedBack.toLocaleString()}</span>
              <span className="text-muted-foreground"> / {monthly.toLocaleString()} {currency}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {monthly === 0
                ? "Pick a monthly amount you'll save toward your own goal."
                : `${Math.round(recovered * 100)}% earned back through behavior. ${remaining.toLocaleString()} ${currency} still to move to ${destination || "your savings"} at month-end.`}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setShowSettings(true)} className="rounded-full border border-border px-3 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-accent">
              {destination ? "Edit" : "Set destination"}
            </button>
          </div>
        </div>

        <div className="mt-4 h-3 rounded-full bg-secondary overflow-hidden relative">
          <div className="h-full gradient-momentum transition-all duration-500" style={{ width: `${Math.min(recovered, 1) * 100}%` }} />
        </div>

        {monthly > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Earned back</div>
              <div className="font-display text-lg font-black tabular-nums text-primary">{earnedBack.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Self-transferred</div>
              <div className="font-display text-lg font-black tabular-nums">{transferredTotal.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-amber-soft/40 bg-amber-soft/5 p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-amber-soft">Left to transfer</div>
              <div className="font-display text-lg font-black tabular-nums text-amber-soft">{remainingToTransfer.toLocaleString()}</div>
            </div>
          </div>
        )}

        {monthly === 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {STAKE_TIERS.map((t) => (
              <button key={t.key} onClick={() => pickStake(t.monthly)} className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition">
                {t.label} — {t.monthly.toLocaleString()} {currency}
              </button>
            ))}
          </div>
        )}

        {monthly > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 items-center">
            <button onClick={() => { setTAmount(remainingToTransfer || 0); setShowTransfer(true); }} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5" /> Log a transfer
            </button>
            <button onClick={() => setShowSettings(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent">Change goal</button>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground ml-auto">
              <ShieldCheck className="h-3 w-3" /> The app never holds your money.
            </div>
          </div>
        )}

        {transfers.length > 0 && (
          <div className="mt-5 rounded-lg border border-border/60 bg-background/60 divide-y divide-border">
            <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">This month's transfers</div>
            {transfers.map((t) => (
              <div key={t.id} className="group flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-mono tabular-nums">{Number(t.amount).toLocaleString()} {t.currency}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {new Date(t.transferred_on).toLocaleDateString()} {t.destination_label ? `→ ${t.destination_label}` : ""}{t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <button onClick={() => deleteTransfer(t.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>

    {showSettings && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-stake" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-display text-xl font-bold">Vault settings</h3>
          <p className="mt-1 text-xs text-muted-foreground">Where the money goes is up to you. The app never holds it.</p>
          <label className="block mt-4 text-xs text-muted-foreground">Currency
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono" />
          </label>
          <label className="block mt-3 text-xs text-muted-foreground">Where will you transfer it?
            <input value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={80} placeholder="e.g. ISK at Avanza, Travel fund, Emergency savings" className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            {STAKE_TIERS.map((t) => (
              <button key={t.key} onClick={() => { void pickStake(t.monthly); }} className={`rounded-full border px-3 py-1.5 text-xs ${monthly === t.monthly ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}>
                {t.monthly.toLocaleString()} {currency}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setShowSettings(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Close</button>
            <button onClick={saveSettings} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Save</button>
          </div>
        </div>
      </div>
    )}

    {showTransfer && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowTransfer(false)}>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-stake" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-primary"><ArrowUpRight className="h-4 w-4" /><span className="font-mono text-xs uppercase tracking-widest">Log a self-transfer</span></div>
          <h3 className="font-display text-xl font-bold mt-1">Move it to your own account.</h3>
          <p className="mt-1 text-xs text-muted-foreground">Open your bank app, transfer the amount to {destination || "your savings account"}, then log it here so MOMENTUM keeps the trail.</p>
          <label className="block mt-4 text-xs text-muted-foreground">Amount ({currency})
            <input type="number" value={tAmount || ""} onChange={(e) => setTAmount(Math.max(0, Number(e.target.value)))} min={1} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono" />
          </label>
          <label className="block mt-3 text-xs text-muted-foreground">Note (optional)
            <input value={tNote} onChange={(e) => setTNote(e.target.value)} maxLength={120} placeholder="e.g. month-end top-up" className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          </label>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setShowTransfer(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">Cancel</button>
            <button onClick={logTransfer} disabled={tAmount <= 0} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">Log transfer</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
