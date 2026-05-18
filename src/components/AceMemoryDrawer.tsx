import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { X, Upload, User, Pin, PinOff, Trash2, Plus } from "lucide-react";

export type AceMemory = {
  weight_kg: number | null;
  height_cm: number | null;
  job: string | null;
  financial_state: string | null;
  photo_url: string | null;
  default_location: string | null;
};

export type MemoryNote = {
  id: string;
  category: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export const EMPTY_MEMORY: AceMemory = { weight_kg: null, height_cm: null, job: null, financial_state: null, photo_url: null, default_location: null };

export function describeMemory(m: AceMemory, notes: MemoryNote[] = []): string {
  const parts: string[] = [];
  if (m.weight_kg) parts.push(`weight ${m.weight_kg}kg`);
  if (m.height_cm) parts.push(`height ${m.height_cm}cm`);
  if (m.job) parts.push(`job: ${m.job}`);
  if (m.financial_state) parts.push(`financial state: ${m.financial_state}`);
  if (m.default_location) parts.push(`default location: ${m.default_location}`);
  let s = parts.join("; ");
  if (notes.length) {
    const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    const lines = sorted.map((n) => `- ${n.category ? `[${n.category}] ` : ""}${n.content}`).join("\n");
    s = (s ? s + "\n\n" : "") + `Long-term context (user-curated, may evolve):\n${lines}`;
  }
  return s;
}

const CATEGORIES = ["Health", "Medical", "Therapy", "Work", "Relationships", "Family", "Money", "Goals", "Other"];

export function AceMemoryDrawer({ open, onClose, value, notes, onSaved, onNotesChanged }: {
  open: boolean;
  onClose: () => void;
  value: AceMemory;
  notes: MemoryNote[];
  onSaved: (m: AceMemory) => void;
  onNotesChanged: (n: MemoryNote[]) => void;
}) {
  const { user } = useAuth();
  const [m, setM] = useState<AceMemory>(value);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newCat, setNewCat] = useState<string>("Health");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => { setM(value); }, [value, open]);

  async function uploadPhoto(file: File) {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setM({ ...m, photo_url: data.publicUrl });
    setUploading(false);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("user_memory").upsert({ user_id: user.id, ...m });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Memory updated.");
    onSaved(m);
  }

  async function addNote() {
    if (!user || newNote.trim().length < 3) return;
    const { data, error } = await supabase.from("memory_notes").insert({
      user_id: user.id, content: newNote.trim(), category: newCat,
    }).select().single();
    if (error) return toast.error(error.message);
    onNotesChanged([data as MemoryNote, ...notes]);
    setNewNote("");
  }

  async function togglePin(n: MemoryNote) {
    const { data, error } = await supabase.from("memory_notes").update({ pinned: !n.pinned }).eq("id", n.id).select().single();
    if (error) return toast.error(error.message);
    onNotesChanged(notes.map((x) => x.id === n.id ? (data as MemoryNote) : x));
  }

  async function removeNote(id: string) {
    const { error } = await supabase.from("memory_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onNotesChanged(notes.filter((x) => x.id !== id));
  }

  async function saveEdit(id: string) {
    if (editText.trim().length < 3) return;
    const { data, error } = await supabase.from("memory_notes").update({ content: editText.trim() }).eq("id", id).select().single();
    if (error) return toast.error(error.message);
    onNotesChanged(notes.map((x) => x.id === id ? (data as MemoryNote) : x));
    setEditingId(null); setEditText("");
  }

  if (!open) return null;
  const sortedNotes = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updated_at) - +new Date(a.updated_at));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-card border-l border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">ACE memory</p>
            <h2 className="font-display text-xl font-bold">What ACE knows about you.</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div className="h-16 w-16 rounded-full bg-secondary overflow-hidden flex items-center justify-center border border-border">
            {m.photo_url ? <img src={m.photo_url} alt="" className="h-full w-full object-cover" /> : <User className="h-7 w-7 text-muted-foreground" />}
          </div>
          <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Num label="Weight (kg)" value={m.weight_kg} onChange={(v) => setM({ ...m, weight_kg: v })} />
          <Num label="Height (cm)" value={m.height_cm} onChange={(v) => setM({ ...m, height_cm: v })} />
        </div>
        <Txt label="Job" value={m.job} onChange={(v) => setM({ ...m, job: v })} placeholder="e.g. Software engineer, teacher, student" />
        <Txt label="Default location" value={m.default_location} onChange={(v) => setM({ ...m, default_location: v })} placeholder="e.g. City, country" />
        <Area label="Financial state" value={m.financial_state} onChange={(v) => setM({ ...m, financial_state: v })} placeholder="e.g. Stable income, some savings, paying off a loan — whatever helps ACE give grounded advice" />

        <button onClick={save} disabled={saving} className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save profile"}
        </button>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Long-term context</p>
          <h3 className="font-display text-lg font-bold mt-1">Custom memory notes</h3>
          <p className="text-[11px] text-muted-foreground mt-1">Free-form facts ACE should always remember. Anything stable about your life, health, or context that you'd otherwise have to repeat. Pin the ones that matter most.</p>

          <div className="mt-3 rounded-lg border border-border p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <span className="text-[10px] font-mono text-muted-foreground">category</span>
            </div>
            <textarea
              value={newNote} onChange={(e) => setNewNote(e.target.value)}
              rows={2} placeholder="Add something ACE should always remember…"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
            />
            <button onClick={addNote} disabled={newNote.trim().length < 3} className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-1">
              <Plus className="h-3 w-3" /> Add note
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {sortedNotes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
            {sortedNotes.map((n) => (
              <div key={n.id} className={`rounded-lg border p-2.5 text-sm ${n.pinned ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {n.category && <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{n.category}</div>}
                    {editingId === n.id ? (
                      <textarea autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1 text-sm resize-none" />
                    ) : (
                      <div className="mt-0.5 whitespace-pre-wrap break-words">{n.content}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => togglePin(n)} title={n.pinned ? "Unpin" : "Pin"} className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground">
                      {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => removeNote(n.id)} title="Delete" className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>updated {new Date(n.updated_at).toLocaleDateString()}</span>
                  {editingId === n.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(null); setEditText(""); }} className="hover:text-foreground">cancel</button>
                      <button onClick={() => saveEdit(n.id)} className="text-primary hover:underline">save</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingId(n.id); setEditText(n.content); }} className="hover:text-foreground">edit</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground">All memory stays private to your account and is injected as background context so ACE stops asking the same things.</p>
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="text-xs text-muted-foreground block mt-3">
      {label}
      <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}
function Txt({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <label className="text-xs text-muted-foreground block mt-3">
      {label}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}
function Area({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <label className="text-xs text-muted-foreground block mt-3">
      {label}
      <textarea rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none" />
    </label>
  );
}
