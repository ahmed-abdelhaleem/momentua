import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AceContextBar, loadContext, describeContext, type AceContext } from "@/components/AceContextBar";
import { AceMemoryDrawer, EMPTY_MEMORY, describeMemory, type AceMemory, type MemoryNote } from "@/components/AceMemoryDrawer";
import { Brain, History, StopCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ace")({
  component: AceChat,
});

type SessionRow = { id: string; title: string | null; summary: string | null; started_at: string; ended_at: string | null };

function AceChat() {
  const { user, session } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memory, setMemory] = useState<AceMemory>(EMPTY_MEMORY);
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [context, setContext] = useState<AceContext>(loadContext);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [chatKey, setChatKey] = useState(0);

  // Load memory + sessions list. Do NOT auto-open or auto-create a session.
  // A session is created lazily on first user message (see submit()).
  // If there's a recent live session (<24h), resume it; otherwise close stale ones.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [{ data: mem }, { data: ses }, { data: nts }] = await Promise.all([
        supabase.from("user_memory").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("ace_sessions").select("*").eq("user_id", user.id).order("started_at", { ascending: false }).limit(50),
        supabase.from("memory_notes").select("*").eq("user_id", user.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(100),
      ]);
      if (mem) setMemory(mem as AceMemory);
      setNotes((nts ?? []) as MemoryNote[]);
      const list = (ses ?? []) as SessionRow[];
      setSessions(list);
      const open = list.find((s) => !s.ended_at);
      if (open) {
        const { data: lastMsg } = await supabase
          .from("ace_messages")
          .select("created_at")
          .eq("session_id", open.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const lastActivity = new Date(lastMsg?.created_at ?? open.started_at).getTime();
        const idleMs = Date.now() - lastActivity;
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (idleMs > ONE_DAY) {
          await supabase.from("ace_sessions").update({ ended_at: new Date().toISOString() }).eq("id", open.id);
          setSessions((arr) => arr.map((s) => s.id === open.id ? { ...s, ended_at: new Date().toISOString() } : s));
        } else if (lastMsg) {
          // Only resume if the session actually has messages
          await openSession(open);
        }
      }
      // Otherwise: idle screen, no session created until user types
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function deleteSession(s: SessionRow) {
    if (!user) return;
    if (!window.confirm(`Delete "${s.title || "this session"}" and all its messages? This cannot be undone.`)) return;
    await supabase.from("ace_messages").delete().eq("session_id", s.id);
    const { error } = await supabase.from("ace_sessions").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    setSessions((arr) => arr.filter((x) => x.id !== s.id));
    if (activeSession?.id === s.id) {
      setActiveSession(null);
      setInitial([]);
      setChatKey((k) => k + 1);
    }
    toast.success("Session deleted.");
  }

  async function openSession(s: SessionRow) {
    setActiveSession(s);
    const { data } = await supabase.from("ace_messages").select("*").eq("session_id", s.id).order("created_at").limit(500);
    const msgs: UIMessage[] = (data ?? []).map((m: { id: string; role: "user" | "assistant" | "system"; content: string }) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
    }));
    setInitial(msgs);
    setChatKey((k) => k + 1);
    setHistoryOpen(false);
  }

  async function startNewSession(): Promise<SessionRow | null> {
    if (!user) return null;
    const { data, error } = await supabase.from("ace_sessions").insert({ user_id: user.id }).select().single();
    if (error) { toast.error(error.message); return null; }
    const row = data as SessionRow;
    setSessions((arr) => [row, ...arr]);
    setActiveSession(row);
    setInitial([]);
    setChatKey((k) => k + 1);
    return row;
  }

  async function endSession() {
    if (!activeSession) return;
    const text = initial?.[0]?.parts?.[0] && "text" in initial[0].parts[0] ? (initial[0].parts[0] as { text: string }).text : null;
    const title = text ? text.slice(0, 60) : "Session";
    await supabase.from("ace_sessions").update({ ended_at: new Date().toISOString(), title }).eq("id", activeSession.id);
    toast.success("Session closed.");
    setActiveSession(null);
    setInitial([]);
    setInitial(null);
    setChatKey((k) => k + 1);
    const { data } = await supabase.from("ace_sessions").select("*").eq("user_id", user!.id).order("started_at", { ascending: false }).limit(50);
    setSessions((data ?? []) as SessionRow[]);
  }

  const ctxText = useMemo(() => describeContext(context), [context]);
  const memText = useMemo(() => describeMemory(memory, notes), [memory, notes]);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: activeSession?.id ?? `ace-${chatKey}`,
    transport: new DefaultChatTransport({
      api: "/api/ace",
      headers: (): Record<string, string> => (session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    }),
    onFinish: async ({ message }) => {
      if (!user || !activeSession) return;
      const text = message.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
      await supabase.from("ace_messages").insert({ user_id: user.id, role: "assistant", content: text, session_id: activeSession.id });
    },
    onError: (e) => { console.error(e); toast.error(e.message); },
  });

  // Sync loaded historic messages into the chat hook whenever a session is opened
  useEffect(() => {
    if (initial !== null) setMessages(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, chatKey]);

  async function buildMealContext(): Promise<string> {
    if (!user) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const { data } = await supabase.from("meal_plans")
      .select("plan_date,ate_as_planned,shop_status,breakfast,lunch,dinner")
      .eq("user_id", user.id).in("plan_date", [fmt(yesterday), fmt(today), fmt(tomorrow)]);
    const rows = (data ?? []) as { plan_date: string; ate_as_planned: string | null; shop_status: string; breakfast: { name?: string } | null; lunch: { name?: string } | null; dinner: { name?: string } | null }[];
    const t = rows.find((r) => r.plan_date === fmt(today));
    const tm = rows.find((r) => r.plan_date === fmt(tomorrow));
    const y = rows.find((r) => r.plan_date === fmt(yesterday));
    const hour = new Date().getHours();
    const parts: string[] = [];
    if (t) parts.push(`Today's meals planned: ${[t.breakfast?.name, t.lunch?.name, t.dinner?.name].filter(Boolean).join(", ")}.`);
    else parts.push("No plan for today.");
    if (tm) parts.push(`Tomorrow planned (shop: ${tm.shop_status}).`);
    else if (hour >= 21) parts.push("It is after 9pm and tomorrow is NOT planned yet — gently surface this once.");
    else parts.push("Tomorrow not planned yet.");
    if (y && !y.ate_as_planned) parts.push("Yesterday's plan wasn't logged as eaten.");
    return parts.join(" ");
  }

  async function submit(textOverride?: string) {
    const raw = (textOverride ?? input).trim();
    if (!raw || !user) return;
    let sid = activeSession?.id;
    if (!sid) {
      const created = await startNewSession();
      sid = created?.id;
    }
    setInput("");
    if (sid) await supabase.from("ace_messages").insert({ user_id: user.id, role: "user", content: raw, session_id: sid });
    const mealCtx = await buildMealContext();
    const fullCtx = [ctxText, mealCtx].filter(Boolean).join(" | ");
    await sendMessage({ text: raw }, { body: { context: fullCtx, memory: memText } });
    requestAnimationFrame(() => taRef.current?.focus());
  }

  const PROMPTS = [
    "I'm avoiding the gym again — talk me through it.",
    "What pattern do you see in my last 7 days?",
    "Help me plan tomorrow's meals.",
    "I broke my streak. What now?",
  ];

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-screen md:h-[100vh] max-h-screen">
      <header className="px-6 md:px-10 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">ACE</p>
          <h1 className="font-display text-2xl font-bold truncate">Your consistency engine.</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setHistoryOpen(true)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent flex items-center gap-1" title="Past sessions">
            <History className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sessions</span>
          </button>
          <button onClick={() => setMemoryOpen(true)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent flex items-center gap-1" title="Edit memory">
            <Brain className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Memory</span>
          </button>
          <button onClick={endSession} className="rounded-lg border border-destructive/60 text-destructive px-2.5 py-1.5 text-xs hover:bg-destructive hover:text-destructive-foreground transition flex items-center gap-1" title="End this session">
            <StopCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">End</span>
          </button>
        </div>
      </header>

      <AceContextBar value={context} onChange={setContext} />

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {messages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-sm">Tell ACE what's getting in the way today. No judgment. Just data.</p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {PROMPTS.map((p) => (
                  <button key={p} onClick={() => void submit(p)} disabled={isLoading} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary hover:text-primary transition disabled:opacity-50">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? (p as { text: string }).text : "")).join("");
            return (
              <Message key={m.id} from={m.role}>
                {m.role === "assistant" ? <MessageResponse>{text}</MessageResponse> : <MessageContent>{text}</MessageContent>}
              </Message>
            );
          })}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent><Shimmer>Thinking…</Shimmer></MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <PromptInput onSubmit={(msg) => { void submit(msg.text); }}>
            <PromptInputTextarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="What's on your mind?" autoFocus disabled={isLoading} />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!input.trim() || isLoading} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" onClick={() => setHistoryOpen(false)}>
          <div className="w-full max-w-sm h-full overflow-y-auto bg-card border-l border-border p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold">Sessions</h2>
              <button onClick={startNewSession} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> New</button>
            </div>
            <div className="space-y-2">
              {sessions.length === 0 && <p className="text-xs text-muted-foreground">No past sessions yet.</p>}
              {sessions.map((s) => (
                <div key={s.id} className={`group flex items-stretch rounded-lg border transition ${activeSession?.id === s.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>
                  <button onClick={() => openSession(s)} className="flex-1 min-w-0 text-left p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{s.title || "Untitled session"}</span>
                      {!s.ended_at && <span className="text-[10px] font-mono text-primary uppercase">live</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(s.started_at).toLocaleString()}</div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void deleteSession(s); }}
                    className="px-3 text-muted-foreground hover:text-destructive transition opacity-60 hover:opacity-100"
                    title="Delete session"
                    aria-label="Delete session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AceMemoryDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} value={memory} notes={notes} onSaved={setMemory} onNotesChanged={setNotes} />
    </div>
  );
}
