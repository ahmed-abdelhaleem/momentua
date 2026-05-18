import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/brain")({
  component: BrainDump,
});

interface Dump { id: string; content: string; created_at: string; }

function BrainDump() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [dumps, setDumps] = useState<Dump[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("brain_dumps").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      setDumps((data as Dump[]) ?? []);
    });
  }, [user]);

  async function dump(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    const { data, error } = await supabase.from("brain_dumps").insert({ user_id: user.id, content: text.trim() }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("point_logs").insert({
      user_id: user.id, action_key: "brain_dump", action_label: "Brain dump completed", domain: "mental", points: 500,
    });
    setDumps([data as Dump, ...dumps]);
    setText("");
    toast.success("Dumped. +500 pts. Mind clear.");
  }

  return (
    <div className="mx-auto px-4 py-6 md:px-10 md:py-10 max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Brain dump</p>
      <h1 className="font-display text-5xl font-black mt-1">What's in your head?</h1>
      <p className="mt-3 text-muted-foreground max-w-prose">Get it out of the loop. To-dos, things to search, anxious thoughts, random ideas. No structure. Just dump. Insights will use it as signal when spotting patterns.</p>

      <form onSubmit={dump} className="mt-8">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Start typing. Don't edit. Just empty the cache." className="w-full rounded-2xl border border-border bg-card p-5 text-base focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        <div className="mt-3 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">+500 pts per dump</span>
          <button disabled={!text.trim()} className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Dump it</button>
        </div>
      </form>

      <div className="mt-12">
        <h2 className="font-display text-xl font-bold">Captured</h2>
        <div className="mt-4 space-y-3">
          {dumps.length === 0 && <p className="text-sm text-muted-foreground">Nothing captured yet.</p>}
          {dumps.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm whitespace-pre-wrap">{d.content}</p>
              <div className="mt-2 font-mono text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
