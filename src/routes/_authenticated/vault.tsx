import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Sparkles, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vault")({
  component: Vault,
});

// Default reward inspiration. Generic on purpose — users add their own real wishes
// via the "Suggest your own" form, and ACE prices them.
const ITEMS = [
  { cat: "Travel", title: "Weekend city break", desc: "Flights + 2 nights somewhere new.", pts: 240_000, image: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80" },
  { cat: "Experience", title: "Live event ticket", desc: "Concert, match, show — pick your own.", pts: 35_000, image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=900&q=80" },
  { cat: "Sport", title: "Sport / activity session", desc: "Court rental, climbing pass, paddle — your call.", pts: 32_000, image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=900&q=80" },
  { cat: "Learning", title: "Annual learning subscription", desc: "Language app, course platform, whatever pulls you.", pts: 60_000, image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=900&q=80" },
  { cat: "Food", title: "Restaurant voucher", desc: "Sit-down meal you've been putting off.", pts: 60_000, image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80" },
  { cat: "Wellness", title: "60-min sports massage", desc: "Recovery, body maintenance.", pts: 80_000, image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=900&q=80" },
];

const KEY = "momentum:vault-custom";
type CustomReward = { id: string; cat: string; title: string; desc: string; pts: number };

function loadCustom(): CustomReward[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveCustom(list: CustomReward[]) { localStorage.setItem(KEY, JSON.stringify(list)); }

function Vault() {
  const { session } = useAuth();
  const [custom, setCustom] = useState<CustomReward[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setCustom(loadCustom()); }, []);

  async function suggest(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/vault-suggest", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ suggestion: input.trim() }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed");
      }
      const data = await res.json() as { approved: boolean; title: string; description: string; category: string; points: number; reason?: string; alternative?: string };
      if (!data.approved) {
        toast.error(data.reason || "Not a fit for the Vault.", {
          description: data.alternative ? `Try: ${data.alternative}` : undefined,
        });
        return;
      }
      const next: CustomReward[] = [...custom, { id: `c_${Date.now()}`, cat: data.category, title: data.title, desc: data.description, pts: data.points }];
      setCustom(next); saveCustom(next);
      setInput("");
      toast.success("Added to your Vault.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't process that suggestion.");
    } finally {
      setLoading(false);
    }
  }

  function remove(id: string) {
    const next = custom.filter((c) => c.id !== id); setCustom(next); saveCustom(next);
  }

  return (
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-6xl">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">The Vault</p>
      <h1 className="font-display text-5xl font-black mt-1">What you're earning toward.</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">Travel. Experiences. Activities. Sit-down meals. Spend points on things that actually move your dopamine in a healthy direction.</p>

      <form onSubmit={suggest} className="mt-8 rounded-2xl border border-primary/40 bg-card p-5">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Suggest your own
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what you actually want. ACE will price it and check it's healthy.</p>
        <div className="mt-3 flex gap-2 flex-wrap sm:flex-nowrap">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. New running shoes, ski trip to Åre, Italian cooking class…"
            maxLength={200}
            disabled={loading}
            aria-label="Suggest a reward"
            className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button disabled={loading || !input.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Thinking</> : "Add"}
          </button>
        </div>
      </form>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {custom.map((it) => (
          <article key={it.id} className="group rounded-2xl border border-primary/40 bg-card overflow-hidden hover:border-primary transition">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-primary">{it.cat} · yours</div>
                <button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive transition" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <h3 className="font-display text-xl font-bold mt-1">{it.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
              <div className="mt-4 font-mono text-sm">{it.pts.toLocaleString()} pts</div>
            </div>
          </article>
        ))}
        {ITEMS.map((it) => (
          <article key={it.title} className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/60 transition">
            <div className="aspect-[4/3] overflow-hidden bg-muted">
              <img src={it.image} alt="" loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />
            </div>
            <div className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary">{it.cat}</div>
              <h3 className="font-display text-xl font-bold mt-1">{it.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="font-mono text-sm">{it.pts.toLocaleString()} pts</div>
                <button className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-primary hover:text-primary-foreground">Save to wishlist</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
