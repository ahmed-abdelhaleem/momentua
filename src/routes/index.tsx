import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/momentum-logo.png";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "MOMENTUM — Turn behavior into savings." },
      { name: "description", content: "An AI-powered behavioral consistency engine. Commit a monthly amount to your own savings goal — earn it back by what you actually do across five life domains." },
      { property: "og:title", content: "MOMENTUM — Turn behavior into savings." },
      { property: "og:description", content: "Commit a monthly amount to your own savings account. Earn it back through consistent action — and transfer the rest yourself at month-end." },
      { property: "og:url", content: "https://momentua.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://momentua.lovable.app/" },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <img src={logo} alt="MOMENTUM logo" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-xl font-bold tracking-tight">MOMENTUM</span>
        </div>
        <Link to="/login" className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-accent">Sign in</Link>
      </header>

      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-5xl px-4 pt-12 pb-20 md:px-12 md:pt-28 md:pb-36">
          <p className="mb-6 inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-primary">For the brain that has tried everything</p>
          <h1 className="font-display text-4xl font-black leading-[0.95] text-balance break-words md:text-7xl lg:text-8xl">
            Turn <span className="text-primary italic">behavior</span><br />
            into savings.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Every productivity app you've tried failed the same way: novelty fades, structure collapses, and you're back where you started. MOMENTUM ties a monthly savings goal to what you actually do — and an AI fights the decay curve before you fall off it.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-full bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-stake hover:opacity-90">Start your Vault</Link>
            <a href="#how" className="rounded-full border border-border px-7 py-3 text-base font-medium hover:bg-accent">How it works</a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground/80 max-w-xl">
            MOMENTUM never holds your money. You commit an amount, you transfer it to your own savings or investment account, and the app tracks the goal alongside your behavior.
          </p>
        </div>
      </section>

      <section id="how" className="border-y border-border bg-card/40 py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-12">
          <h2 className="mb-10 font-display text-3xl font-bold md:text-4xl">How it works</h2>
        <div className="grid gap-10 md:grid-cols-3">
          {[
            { n: "01", t: "Commit", d: "Pick a monthly amount — the size of the goal you actually want to hit. Choose where it lives (your savings account, ISK, travel fund — your call)." },
            { n: "02", t: "Earn it back", d: "Log behavior across five domains — movement, learning, social contact, self-regulation, and consistency. Every small action (a walk, a chapter read, cooking instead of ordering, a screen-free hour) moves your Vault bar toward 100%." },
            { n: "03", t: "Transfer", d: "At month-end, transfer the portion you didn't earn back to your own savings. You confirm the transfer in-app. The money stays yours — it just stops being optional." },
          ].map((s) => (
            <div key={s.n}>
              <div className="font-mono text-sm text-primary">{s.n}</div>
              <h3 className="mt-3 font-display text-2xl font-bold">{s.t}</h3>
              <p className="mt-2 text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-12 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-4xl font-bold leading-tight md:text-5xl">An AI that <span className="italic text-primary">does not wait</span>.</h2>
            <p className="mt-5 text-lg text-muted-foreground">
              ACE — the consistency engine — watches your patterns. When it detects decay (missed logs, shrinking streaks), it intervenes before you fully disengage. Not after.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="font-mono text-xs text-muted-foreground">ACE — Day 5 of low engagement</div>
            <p className="mt-3 font-display text-xl leading-relaxed">
              "Three things you actually did this week. Two you skipped. Want to swap tomorrow's gym for a 20-minute walk and still keep the streak?"
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Built for the brain that understands its patterns and has never been able to stop them.
      </footer>
    </div>
  );
}
