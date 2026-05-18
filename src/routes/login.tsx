import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import logo from "@/assets/momentum-logo.png";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({
    meta: [
      { title: "Sign in — MOMENTUM" },
      { name: "description", content: "Sign in to MOMENTUM with email or Google to track your stake, log behavior, and recover money this month." },
      { property: "og:title", content: "Sign in — MOMENTUM" },
      { property: "og:description", content: "Pick up where momentum left off. Sign in or create an account — the first 7 days are stake-free." },
      { property: "og:url", content: "https://stakes-and-streaks.lovable.app/login" },
    ],
    links: [
      { rel: "canonical", href: "https://stakes-and-streaks.lovable.app/login" },
    ],
  }),
});

function Login() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard" });
  }, [loading, session, nav]);

  useEffect(() => {
    const onNativeOAuthError = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      toast.error(typeof detail === "string" ? detail : "Google sign-in failed");
      setOauthBusy(false);
    };
    window.addEventListener("momentum:native-oauth-error", onNativeOAuthError);
    return () => window.removeEventListener("momentum:native-oauth-error", onNativeOAuthError);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success("Welcome. Let's set you up.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setOauthBusy(true);
    const native = await import("@/lib/native");
    const nativeResult = await native.signInWithNativeOAuth("google");
    if (nativeResult.started) return;
    if (nativeResult.error) {
      toast.error(nativeResult.error.message ?? "Google sign-in failed");
      setOauthBusy(false);
      return;
    }

    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
    if (!r.redirected) setOauthBusy(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="MOMENTUM logo" width={32} height={32} className="h-8 w-8" />
          <span className="font-display text-lg font-bold">MOMENTUM</span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl font-bold leading-tight">{mode === "signin" ? "Welcome back." : "Put money on it."}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Pick up where momentum left off." : "Create an account. The first 7 days are stake-free."}</p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <label htmlFor="email" className="sr-only">Email</label>
            <input id="email" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <label htmlFor="password" className="sr-only">Password</label>
            <input id="password" type="password" required minLength={8} placeholder="Password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <button disabled={busy} type="submit" className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-stake hover:opacity-90 disabled:opacity-50">
              {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <button onClick={google} disabled={oauthBusy} className="w-full rounded-lg border border-border bg-card py-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
            {oauthBusy ? "Opening Google..." : "Continue with Google"}
          </button>

          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-6 w-full text-center text-xs text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
