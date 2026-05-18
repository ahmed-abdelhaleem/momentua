import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Brain, MessageCircle, Sparkles, LogOut, AlertTriangle, Shield, Utensils, Settings, Lightbulb } from "lucide-react";
import logo from "@/assets/momentum-logo.png";
import { BrainDumpFAB } from "@/components/BrainDumpFAB";
import { ensureServiceWorker } from "@/lib/push";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

function Layout() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const loc = useLocation();
  const [onboardChecked, setOnboardChecked] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (loc.pathname.startsWith("/onboarding")) { setOnboardChecked(true); return; }
    supabase.from("profiles").select("onboarding_complete").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data && !data.onboarding_complete) {
        router.navigate({ to: "/onboarding" });
      }
      setOnboardChecked(true);
    });
  }, [user, loc.pathname, router]);

  useEffect(() => { ensureServiceWorker().catch(() => {}); }, []);

  if (loading || (user && !onboardChecked)) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="font-mono text-xs text-muted-foreground">loading momentum…</div></div>;
  }
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  if (loc.pathname.startsWith("/onboarding")) {
    return <Outlet />;
  }

  const nav = [
    { to: "/dashboard", label: "Today", icon: Activity },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/nourish", label: "Nourish", icon: Utensils },
    { to: "/brain", label: "Brain dump", icon: Brain },
    { to: "/spirals", label: "Spirals", icon: AlertTriangle },
    { to: "/foundation", label: "Foundation", icon: Shield },
    { to: "/ace", label: "ACE", icon: MessageCircle },
    { to: "/vault", label: "Vault", icon: Sparkles },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="md:w-60 md:min-h-screen md:border-r border-border md:p-6 px-4 py-3 border-b md:border-b-0 flex md:flex-col items-center md:items-stretch justify-between md:justify-start gap-4">
        <Link to="/dashboard" className="flex items-center gap-2 md:mb-6" aria-label="MOMENTUM home">
          <img src={logo} alt="MOMENTUM logo" width={28} height={28} className="h-7 w-7" />
          <span className="font-display text-base font-bold tracking-tight hidden md:inline">MOMENTUM</span>
        </Link>
        <nav className="flex md:flex-col gap-1 flex-1" aria-label="Primary">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} aria-label={n.label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <n.icon className="h-4 w-4" />
                <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <button onClick={async () => { await signOut(); router.navigate({ to: "/" }); }} className="md:mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent" title="Sign out" aria-label="Sign out">
          <LogOut className="h-4 w-4" /> <span className="hidden md:inline">Sign out</span>
        </button>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden"><Outlet /></main>
      <BrainDumpFAB />
    </div>
  );
}
