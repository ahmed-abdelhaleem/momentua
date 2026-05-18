import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { pushSupported, pushIsSubscribed, subscribePush, unsubscribePush } from "@/lib/push";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Prefs = {
  morning_checkin: boolean; evening_log: boolean; plan_nudge: boolean; surprise_window: boolean;
  morning_hour: number; evening_hour: number; quiet_start: number; quiet_end: number;
  max_per_day: number; timezone: string;
};

const DEFAULTS: Prefs = {
  morning_checkin: true, evening_log: true, plan_nudge: true, surprise_window: true,
  morning_hour: 8, evening_hour: 21, quiet_start: 22, quiet_end: 7,
  max_per_day: 4, timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
};

function SettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setPrefs({ ...DEFAULTS, ...data }); });
    pushIsSubscribed().then(setSubscribed);
  }, [user]);

  async function update(patch: Partial<Prefs>) {
    if (!user) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await supabase.from("notification_preferences").upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
  }

  async function toggleSub() {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribePush();
        setSubscribed(false);
        toast("Notifications off.");
      } else {
        const r = await subscribePush();
        if (r.ok) { setSubscribed(true); toast.success("Notifications on."); }
        else toast.error(r.reason || "Couldn't enable notifications.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Honest pings. No noise. You control the tempo.</p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {subscribed ? <Bell className="mt-0.5 h-5 w-5 text-primary" /> : <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />}
          <div className="flex-1">
            <div className="font-semibold">Push notifications</div>
            <p className="text-sm text-muted-foreground">
              {!supported && "Your device doesn't support push notifications."}
              {supported && !subscribed && "Enable to get morning check-ins, evening logs, and surprise 2× alerts."}
              {supported && subscribed && "You'll get the notifications you've toggled below."}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" /> On iPhone, install MOMENTUM to your home screen first.</p>
          </div>
          <Button disabled={!supported || busy} onClick={toggleSub} variant={subscribed ? "outline" : "default"}>
            {subscribed ? "Disable" : "Enable"}
          </Button>
        </div>
      </Card>

      <Card className="divide-y divide-border p-0">
        {([
          ["morning_checkin", "Morning check-in", `Around ${prefs.morning_hour}:00 — sleep + meal-followthrough question.`],
          ["evening_log", "Evening log", `Around ${prefs.evening_hour}:00 — lock in points + plan tomorrow.`],
          ["plan_nudge", "No-plan nudge", "9pm if tomorrow's meals aren't planned. One ping max."],
          ["surprise_window", "Surprise 2× windows", "Random 60-min point multipliers (max once per day)."],
        ] as const).map(([key, label, desc]) => (
          <div key={key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
            <Switch checked={prefs[key]} onCheckedChange={(v) => update({ [key]: v } as any)} aria-label={label} />
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="font-semibold">Timing</div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-xs text-muted-foreground">Morning hour
            <input type="number" min={5} max={11} value={prefs.morning_hour}
              onChange={(e) => update({ morning_hour: parseInt(e.target.value) || 8 })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="block text-xs text-muted-foreground">Evening hour
            <input type="number" min={17} max={23} value={prefs.evening_hour}
              onChange={(e) => update({ evening_hour: parseInt(e.target.value) || 21 })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="block text-xs text-muted-foreground">Quiet from
            <input type="number" min={0} max={23} value={prefs.quiet_start}
              onChange={(e) => update({ quiet_start: parseInt(e.target.value) || 22 })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="block text-xs text-muted-foreground">Quiet until
            <input type="number" min={0} max={23} value={prefs.quiet_end}
              onChange={(e) => update({ quiet_end: parseInt(e.target.value) || 7 })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="col-span-2 block text-xs text-muted-foreground">Max notifications per day
            <input type="number" min={1} max={8} value={prefs.max_per_day}
              onChange={(e) => update({ max_per_day: parseInt(e.target.value) || 4 })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">ACE learns from when you actually open notifications and shifts send times by ±2 hours toward your real attention window.</p>
      </Card>
    </div>
  );
}
