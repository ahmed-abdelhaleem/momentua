import { createFileRoute, Link } from "@tanstack/react-router";

// Internal feature reference. Not linked from anywhere in the app —
// reach it by typing /handbook in the URL bar. Hidden from search engines.
export const Route = createFileRoute("/handbook")({
  head: () => ({
    meta: [
      { title: "MOMENTUM — Feature handbook (internal)" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal reference of every feature, screen, and data model in the MOMENTUM app." },
    ],
  }),
  component: Handbook,
});

type Section = { id: string; title: string; body: React.ReactNode };

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-2xl sm:text-3xl font-bold mt-12 mb-3 scroll-mt-24 border-b border-border pb-2">
      {children}
    </h2>
  );
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-lg font-semibold mt-6 mb-2">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground mb-3">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 text-sm leading-relaxed text-muted-foreground space-y-1 mb-3">{children}</ul>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground mr-2">{children}</span>;
}

function Handbook() {
  const sections: Section[] = [
    {
      id: "overview",
      title: "1 · Overview",
      body: (
        <>
          <P>
            <strong>MOMENTUM</strong> is a behavioral-consistency engine. The user commits a monthly
            amount to their own savings goal (e.g. an investment account), then earns it back by
            logging real-world actions across multiple life domains. The app never holds the money —
            it's a self-savings vault that the user funds and verifies themselves.
          </P>
          <P>
            The whole experience is wrapped in a points + streaks + multipliers gamification layer,
            with an AI coach (ACE) that learns the user's patterns and pushes them toward
            consistency rather than perfection.
          </P>
          <H3>Core loop</H3>
          <UL>
            <li><strong>Commit</strong> a monthly Vault amount (in the user's currency, default SEK).</li>
            <li><strong>Log</strong> actions across Physical / Mental / Social / Self-regulation (plus any custom categories).</li>
            <li><strong>Earn back</strong> points; the Vault progress bar shows % recovered.</li>
            <li>At month end the user <strong>transfers</strong> the remaining amount to their own savings — logged in <Code>vault_transfers</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "auth",
      title: "2 · Authentication & accounts",
      body: (
        <>
          <P><Tag>routes</Tag> <Code>/login</Code>, layout guard <Code>/_authenticated</Code></P>
          <UL>
            <li>Email + password sign-in / sign-up, plus Google OAuth.</li>
            <li>Email is <strong>not</strong> auto-confirmed — users verify before they can sign in.</li>
            <li>All app pages live under <Code>src/routes/_authenticated/</Code> behind a redirect guard. Unauthenticated visits bounce to <Code>/login</Code> with a redirect-back search param.</li>
            <li>No admin/role system. Every account is equal and only sees its own data, enforced by Supabase Row-Level Security on every table.</li>
          </UL>
        </>
      ),
    },

    {
      id: "onboarding",
      title: "3 · Onboarding",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/onboarding</Code> · <Tag>code</Tag> <Code>src/lib/onboarding.ts</Code></P>
          <P>
            First-run questionnaire that calibrates the dashboard and ACE. It asks about: ADHD
            self-identification (optional — "yes / suspect / no / prefer not to say"), primary
            motivation (saving goal, accountability, structure), focus domains, daily energy
            window, and notification preferences.
          </P>
          <UL>
            <li>Writes <Code>profiles.dashboard_prefs</Code> and <Code>profiles.onboarding_done</Code>.</li>
            <li>Picks which domains start hidden vs visible based on the user's focus answer.</li>
            <li>Nothing is assumed about the user's location, profession, or diagnoses.</li>
          </UL>
        </>
      ),
    },

    {
      id: "dashboard",
      title: "4 · Dashboard (the daily cockpit)",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/dashboard</Code></P>
          <H3>4.1 Top header</H3>
          <UL>
            <li><strong>Date picker</strong> — log for today or any of the last {`{LOG_WINDOW_DAYS}`} days; older dates are read-only.</li>
            <li><strong>Streak flame</strong> — current consecutive-day streak.</li>
            <li><strong>Points counter</strong> — month-to-date points and Vault % earned back.</li>
          </UL>
          <H3>4.2 Vault panel</H3>
          <UL>
            <li>Shows monthly commitment, % earned back so far, amount still to transfer.</li>
            <li>"Log a transfer" modal records a row in <Code>vault_transfers</Code> with amount + destination label (e.g. "Avanza ISK").</li>
            <li>The app <strong>never</strong> moves money — it only tracks what the user moved themselves.</li>
          </UL>
          <H3>4.3 Morning check-in</H3>
          <UL>
            <li>Energy 1–5 + a single "Today I will…" commitment, stored in <Code>daily_checkins</Code>.</li>
          </UL>
          <H3>4.4 Routines (Morning / Midday / Evening)</H3>
          <UL>
            <li>Ships with universal basics only (Shower, Brush teeth). Everything personal is user-added.</li>
            <li><strong>Add / Edit / Delete</strong> custom routine items per slot, each with a label, point value (50–10 000), and domain. Stored in <Code>localStorage</Code> under <Code>momentum:custom-routines</Code>.</li>
            <li>All routine items default to "once per day".</li>
          </UL>
          <H3>4.5 Tracking strip</H3>
          <UL>
            <li>Day / Week / Month toggle with a per-domain bar breakdown.</li>
            <li>Domains shown are the four built-ins <em>plus</em> any custom categories.</li>
          </UL>
          <H3>4.6 Recent log + Spiral button</H3>
          <UL>
            <li>List of the last 30 logs in the active range with one-click delete.</li>
            <li><strong>Spiral</strong> button opens a modal to log a binge / scroll / shutdown session: duration, topic, optional note, optional point deduction.</li>
          </UL>
          <H3>4.7 Action library</H3>
          <UL>
            <li>Filter pills: All + every domain key (built-in + custom).</li>
            <li>Each action card shows points, streak level / multiplier, and quantity-scaled preview where applicable (e.g. steps, gym minutes).</li>
            <li>Per-card settings popover: override points, force once-per-day, hide from list.</li>
            <li>"Show hidden (N)" toggle re-reveals hidden actions.</li>
            <li><strong>Custom</strong> action button — add ad-hoc activities not in the catalog.</li>
            <li><strong>Categories</strong> button — add, list, and remove custom domains (emoji + label). Stored in <Code>momentum:custom-domains</Code>; resolved everywhere through <Code>getDomainMeta()</Code>.</li>
          </UL>
          <H3>4.8 Live feed + Surprise banner + Scratch card + Comeback amplifier + Day-complete overlay</H3>
          <UL>
            <li><strong>LiveFeedStrip</strong> shows the last few points-earning actions for a small dopamine loop.</li>
            <li><strong>SurpriseBanner</strong> may award a temporary multiplier boost.</li>
            <li><strong>ScratchCard</strong> — weekly random bonus (logged as <Code>scratch_bonus</Code>).</li>
            <li><strong>ComebackAmplifier</strong> — appears if the user has been inactive; gentle re-onboarding nudge.</li>
            <li><strong>DayCompleteOverlay</strong> — celebration animation when the user crosses the daily threshold.</li>
          </UL>
        </>
      ),
    },

    {
      id: "points",
      title: "5 · Points, streaks & multipliers",
      body: (
        <>
          <P><Tag>code</Tag> <Code>src/lib/points-catalog.ts</Code> · <Code>src/lib/progressive.ts</Code> · <Code>src/lib/rewards.ts</Code></P>
          <H3>5.1 Built-in action catalogue</H3>
          <UL>
            <li><strong>Physical</strong> — Gym session (scales by minutes), Steps (scales by total steps), Sport session, Slept 7–9 h.</li>
            <li><strong>Mental & Learning</strong> — Language study, Reading, Book chapter, Online course lesson, Brain dump.</li>
            <li><strong>Social</strong> — Left home, Group event / class, Office day, Connected with a person.</li>
            <li><strong>Self-regulation</strong> — Cooked breakfast / lunch / dinner, Supermarket run, No delivery today, Screen-free hour, Completed daily plan, No impulse purchase.</li>
            <li><strong>NourishPlan</strong> — Plan tomorrow's meals, Shopped as planned, Ate as planned, Logged yesterday's eating.</li>
          </UL>
          <H3>5.2 Quantity scaling</H3>
          <P>
            Actions with a <Code>ScalingConfig</Code> open a confirm modal that asks for the quantity
            (steps, minutes, etc.) and award points proportionally, clamped to min/max.
          </P>
          <H3>5.3 Streaks</H3>
          <UL>
            <li>Each rule in <Code>STREAK_RULES</Code> tracks consecutive days of qualifying action keys and assigns a level + multiplier.</li>
            <li>Multipliers stack with surprise boosts (<Code>getActiveMultiplier</Code>) on the final logged points.</li>
            <li>Global current-day streak is mirrored to the <Code>streaks</Code> table.</li>
          </UL>
          <H3>5.4 Monthly target</H3>
          <P>
            <Code>MONTHLY_TARGET_POINTS = 100 000</Code> per 1 000 SEK staked. Vault % earned back =
            <Code>monthPoints / ((monthlyAmount / 1000) * 100_000)</Code>.
          </P>
        </>
      ),
    },

    {
      id: "vault",
      title: "6 · Vault (rewards & self-savings)",
      body: (
        <>
          <P><Tag>routes</Tag> <Code>/_authenticated/vault</Code>, <Code>VaultPanel</Code> on dashboard</P>
          <UL>
            <li><strong>Reward catalogue</strong> — generic suggestions (weekend trip, live event, learning subscription, restaurant voucher, massage, sport session). Users add their own with <em>Suggest your own</em>; ACE prices them via <Code>/api/vault-suggest</Code>.</li>
            <li><strong>Custom rewards</strong> stored client-side; price suggestions backed by <Code>baseline-prices.ts</Code>.</li>
            <li><strong>Transfers</strong> recorded in <Code>vault_transfers</Code> with month_start, amount, destination_label.</li>
            <li><strong>Profile</strong> stores <Code>currency</Code> (default <Code>SEK</Code>) and <Code>vault_destination_label</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "ace",
      title: "7 · ACE (the AI coach)",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/ace</Code> · <Tag>api</Tag> <Code>/api/ace</Code> · <Tag>code</Tag> <Code>src/lib/ai-gateway.ts</Code></P>
          <UL>
            <li>Long-running chat sessions with persistent history (<Code>ace_sessions</Code> + <Code>ace_messages</Code>).</li>
            <li><strong>Memory drawer</strong> — facts, preferences, and patterns ACE has learned about the user (<Code>user_memory</Code>, <Code>memory_notes</Code>).</li>
            <li><strong>Context bar</strong> — shows what ACE currently knows about today (energy, commitment, last spiral, top streak).</li>
            <li>Powered by Lovable AI Gateway (no user-supplied API keys). Default model is set in <Code>ai-gateway.ts</Code>.</li>
            <li>ACE never categorizes brain dumps automatically — capture is one-way; categorization is up to the user or future jobs.</li>
          </UL>
        </>
      ),
    },

    {
      id: "insights",
      title: "8 · Insights",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/insights</Code> · <Tag>api</Tag> <Code>/api/insights-generate</Code> · <Tag>code</Tag> <Code>src/lib/insights-metrics.server.ts</Code>, <Code>src/lib/insights.functions.ts</Code></P>
          <UL>
            <li>Aggregates the last 14 days of <Code>point_logs</Code>, <Code>daily_checkins</Code>, <Code>foundation_sessions</Code>, <Code>brain_dumps</Code>, etc.</li>
            <li>AI generates short, actionable observations (consistency wins, decay warnings, suggested next action).</li>
            <li>Persisted in <Code>insights</Code>; latest one previewed on the dashboard via <Code>InsightsCard</Code>.</li>
            <li>Notification scheduling state for insights lives in <Code>insight_notifications_state</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "brain",
      title: "9 · Brain dump",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/brain</Code> · <Tag>component</Tag> <Code>BrainDumpFAB</Code></P>
          <UL>
            <li>Friction-free capture: floating button on every screen + a dedicated page.</li>
            <li>Each dump awards points (500 from the page, 100 from the FAB quick-capture) under <Code>action_key = brain_dump</Code>.</li>
            <li>Stored in <Code>brain_dumps</Code>. No automatic categorization or AI summarization — purely a release valve.</li>
          </UL>
        </>
      ),
    },

    {
      id: "spirals",
      title: "10 · Spirals tracker",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/spirals</Code> · <Tag>api</Tag> <Code>/api/spirals-analyze</Code></P>
          <UL>
            <li>Log binge / doomscroll / shutdown sessions with duration + topic + optional note.</li>
            <li>Aggregated stats: count, total hours, total points (can be negative if "deduct" is on).</li>
            <li>Top topics + time-of-day distribution charts.</li>
            <li>Logged as <Code>action_key = spiral_logged</Code> with domain = <Code>self_regulation</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "foundation",
      title: "11 · Foundation mode (interception layer)",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/foundation</Code> · <Tag>api</Tag> <Code>/api/foundation-reflection</Code></P>
          <UL>
            <li>A time-boxed "rebuild" mode (configurable days). Designed for hard resets when the user has fallen off.</li>
            <li>Tracks <Code>foundation_sessions</Code>, <Code>foundation_readiness</Code>, <Code>foundation_triggers</Code>, <Code>foundation_reflections</Code>.</li>
            <li>Includes a trigger-interception timer — when a craving/urge hits, the user starts a countdown and writes a reflection at the end.</li>
            <li>Awards <Code>self_regulation</Code> points on successful interception.</li>
          </UL>
        </>
      ),
    },

    {
      id: "nourish",
      title: "12 · NourishPlan (meal planning)",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/nourish</Code> · <Tag>code</Tag> <Code>cook-engine.{`{server,functions}`}.ts</Code>, <Code>pantry.functions.ts</Code></P>
          <UL>
            <li>Plan tomorrow's meals (style, portions, which meals to cover), generate options, pick one.</li>
            <li>Shopping status flow: <Code>list_ready → shop_needed → delivered</Code>.</li>
            <li>Tracks pantry items (<Code>pantry_items</Code>, <Code>meal_pantry</Code>) and active cook sessions (<Code>cook_sessions</Code>, <Code>cook_step_progress</Code>).</li>
            <li>Four point-earning actions: plan / shop / ate-as-planned / morning check-in. Drives a separate meal streak shown on the dashboard.</li>
          </UL>
        </>
      ),
    },

    {
      id: "integrations",
      title: "13 · Integrations",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/integrations</Code> · <Tag>apis</Tag> <Code>/api/gocardless.callback</Code></P>
          <UL>
            <li><strong>Health / movement</strong> — <Code>health.functions.ts</Code> + <Code>health_entries</Code>. Confirms daily steps and sleep from native health platforms when running in the mobile shell.</li>
            <li><strong>Banks (GoCardless, EU)</strong> — connect a Swedish bank, pull transactions into <Code>bank_connections</Code> / <Code>bank_accounts</Code> / <Code>bank_transactions</Code>. Used to detect real Vault transfers and to surface real spending categories. Free for individuals.</li>
            <li><strong>Custom deals</strong> — <Code>custom_deals</Code> / <Code>custom_deal_sources</Code> let the user track price drops on personal goals.</li>
            <li><strong>Favorite stores</strong> — quick-pick chains for the supermarket-run flow.</li>
            <li><strong>Nearby stores</strong> — server helper in <Code>nearby-stores.server.ts</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "notifications",
      title: "14 · Notifications",
      body: (
        <>
          <P><Tag>code</Tag> <Code>src/lib/push.ts</Code>, <Code>fcm-send.server.ts</Code>, <Code>notifications.functions.ts</Code></P>
          <UL>
            <li>Web Push (browsers) and FCM (mobile shell) supported in parallel.</li>
            <li>User preferences in <Code>notification_preferences</Code>; subscriptions in <Code>push_subscriptions</Code> and <Code>fcm_tokens</Code>; delivery audit in <Code>notification_log</Code>.</li>
            <li>Settings page lets the user enable / disable push and fire a test notification.</li>
            <li>Public hooks under <Code>/api/public/hooks/</Code> handle inbound delivery callbacks (<Code>notification-opened</Code>, <Code>send-notifications</Code>) with signature verification.</li>
          </UL>
        </>
      ),
    },

    {
      id: "settings",
      title: "15 · Settings",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/_authenticated/settings</Code></P>
          <UL>
            <li>Notification toggles + test push button.</li>
            <li>Profile fields: currency, Vault destination label, dashboard preferences.</li>
            <li>Sign-out.</li>
          </UL>
        </>
      ),
    },

    {
      id: "landing",
      title: "16 · Public landing page",
      body: (
        <>
          <P><Tag>route</Tag> <Code>/</Code> · <Tag>file</Tag> <Code>src/routes/index.tsx</Code></P>
          <UL>
            <li>Marketing copy explaining the self-savings model.</li>
            <li>"How it works" section uses generic domain language (movement, learning, social contact, self-regulation, consistency) — no personal references.</li>
            <li>Sign-in / sign-up CTA → <Code>/login</Code>.</li>
            <li>Sitemap served at <Code>/sitemap.xml</Code>.</li>
          </UL>
        </>
      ),
    },

    {
      id: "data",
      title: "17 · Data model (Supabase)",
      body: (
        <>
          <P>Every table has Row-Level Security restricting rows to <Code>auth.uid() = user_id</Code> (or equivalent).</P>
          <H3>Identity & prefs</H3>
          <UL>
            <li><Code>profiles</Code> — display name, currency, vault destination, dashboard_prefs, onboarding_done.</li>
            <li><Code>notification_preferences</Code>, <Code>push_subscriptions</Code>, <Code>fcm_tokens</Code>, <Code>notification_log</Code>.</li>
          </UL>
          <H3>Daily behavior</H3>
          <UL>
            <li><Code>point_logs</Code> — every action with action_key, action_label, domain, points, timestamp.</li>
            <li><Code>daily_checkins</Code> — energy + morning commitment per day.</li>
            <li><Code>streaks</Code> — current_days, longest_days.</li>
            <li><Code>brain_dumps</Code> — free-text captures.</li>
          </UL>
          <H3>Vault & money</H3>
          <UL>
            <li><Code>stakes</Code> — monthly commitment + recovered amount.</li>
            <li><Code>vault_transfers</Code> — user-logged transfers to their own savings.</li>
            <li><Code>bank_connections</Code> / <Code>bank_accounts</Code> / <Code>bank_transactions</Code> — GoCardless data.</li>
            <li><Code>custom_deals</Code> / <Code>custom_deal_sources</Code> / <Code>favorite_stores</Code>.</li>
          </UL>
          <H3>Coaching</H3>
          <UL>
            <li><Code>ace_sessions</Code>, <Code>ace_messages</Code>, <Code>ace_insights</Code>.</li>
            <li><Code>user_memory</Code>, <Code>memory_notes</Code>.</li>
            <li><Code>insights</Code>, <Code>insight_notifications_state</Code>.</li>
          </UL>
          <H3>Foundation & spirals</H3>
          <UL>
            <li><Code>foundation_sessions</Code>, <Code>foundation_readiness</Code>, <Code>foundation_triggers</Code>, <Code>foundation_reflections</Code>.</li>
          </UL>
          <H3>NourishPlan</H3>
          <UL>
            <li><Code>meal_plans</Code>, <Code>meal_pantry</Code>, <Code>pantry_items</Code>, <Code>cook_sessions</Code>, <Code>cook_step_progress</Code>.</li>
          </UL>
          <H3>Health</H3>
          <UL>
            <li><Code>health_entries</Code> — steps, sleep, heart-rate windows.</li>
          </UL>
        </>
      ),
    },

    {
      id: "client-state",
      title: "18 · Client-side state (localStorage)",
      body: (
        <UL>
          <li><Code>momentum:custom-actions</Code> — user-added activities.</li>
          <li><Code>momentum:custom-routines</Code> — user-added routine items per slot.</li>
          <li><Code>momentum:custom-domains</Code> — user-defined categories (emoji + label).</li>
          <li><Code>momentum:point-overrides</Code> — custom point values per action.</li>
          <li><Code>momentum:once-per-day</Code> — per-action once/day overrides.</li>
          <li><Code>momentum:hidden-actions</Code> — actions hidden from the dashboard list.</li>
          <li><Code>momentum:spiral-deduct</Code> — whether spirals deduct points.</li>
          <li><Code>momentum:dash-sections</Code> — collapsible section open/closed state.</li>
        </UL>
      ),
    },

    {
      id: "server",
      title: "19 · Server functions & APIs",
      body: (
        <UL>
          <li><Code>/api/ace</Code> — ACE chat turn (auth-protected).</li>
          <li><Code>/api/insights-generate</Code> — generate fresh insights.</li>
          <li><Code>/api/foundation-reflection</Code> — AI reflection after an interception.</li>
          <li><Code>/api/spirals-analyze</Code> — pattern analysis of spirals.</li>
          <li><Code>/api/vault-suggest</Code> — price + categorize a custom reward.</li>
          <li><Code>/api/gocardless.callback</Code> — OAuth callback for bank linking.</li>
          <li><Code>/api/public/hooks/notification-opened</Code> + <Code>/send-notifications</Code> — public webhooks (signature-verified).</li>
          <li>All app-internal server logic uses TanStack <Code>createServerFn</Code> with <Code>requireSupabaseAuth</Code> middleware.</li>
        </UL>
      ),
    },

    {
      id: "deprecated",
      title: "20 · Not implemented / explicitly out of scope",
      body: (
        <UL>
          <li><strong>Admin dashboard</strong> — no admin UI, no <Code>user_roles</Code> table, no <Code>/admin</Code> route.</li>
          <li><strong>App-held money</strong> — the app never charges, holds, or transfers funds. Vault transfers are user-logged only.</li>
          <li><strong>Auto-categorization of brain dumps</strong> — captured raw, never tagged by ACE.</li>
          <li><strong>Anonymous accounts</strong> — disabled by policy; standard signup only.</li>
          <li><strong>Charity / donation flow</strong> — earlier draft, removed when staking model became self-savings.</li>
        </UL>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Internal · not linked in nav</div>
        <h1 className="font-display text-4xl sm:text-5xl font-black mt-2">MOMENTUM — Feature handbook</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Single source of truth for what this app currently does, screen by screen, table by table.
          Reach this page by typing <Code>/handbook</Code> in the URL bar. Hidden from search engines
          (<Code>noindex, nofollow</Code>) and not surfaced anywhere in the in-app navigation.
        </p>

        <nav className="mt-8 rounded-xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Contents</div>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s) => (
          <section key={s.id}>
            <H2 id={s.id}>{s.title}</H2>
            {s.body}
          </section>
        ))}

        <div className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          <Link to="/dashboard" className="text-primary hover:underline">← Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
