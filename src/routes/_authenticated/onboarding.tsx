import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { QUESTIONS, derivePrefs, type OnboardingAnswers } from "@/lib/onboarding";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [saving, setSaving] = useState(false);

  const q = QUESTIONS[step];
  const total = QUESTIONS.length;
  const isLast = step === total - 1;

  function setAnswer(value: string) {
    if (q.multi) {
      const cur = (answers[q.id] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      setAnswers({ ...answers, [q.id]: next });
    } else {
      setAnswers({ ...answers, [q.id]: value });
    }
  }

  function isSelected(value: string) {
    const cur = answers[q.id];
    if (q.multi) return Array.isArray(cur) && cur.includes(value);
    return cur === value;
  }

  function canAdvance() {
    const cur = answers[q.id];
    if (q.multi) return Array.isArray(cur) && cur.length > 0;
    return typeof cur === "string" && cur.length > 0;
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    const prefs = derivePrefs(answers);
    const { error } = await supabase.from("profiles").update({
      onboarding_answers: answers as never,
      onboarding_complete: true,
      dashboard_prefs: prefs as never,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tuned to you. Let's go.");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Tune MOMENTUM to you</p>
          <p className="font-mono text-xs text-muted-foreground">{step + 1} / {total}</p>
        </div>
        <div className="h-1 rounded-full bg-secondary overflow-hidden mb-8">
          <div className="h-full gradient-momentum transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>

        <h1 className="font-display text-3xl font-bold">{q.prompt}</h1>
        {q.help && <p className="mt-2 text-sm text-muted-foreground">{q.help}</p>}
        {q.multi && <p className="mt-1 text-xs text-muted-foreground">Pick all that apply.</p>}

        <div className="mt-6 space-y-2">
          {q.options.map((o) => (
            <button
              key={o.value}
              onClick={() => setAnswer(o.value)}
              className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition ${
                isSelected(o.value) ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-primary/50 hover:bg-accent/30"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {isLast ? (
            <button onClick={finish} disabled={!canAdvance() || saving} className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : "Finish"}
            </button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()} className="flex items-center gap-1 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
