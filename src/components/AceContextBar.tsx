import { useEffect, useState } from "react";
import { MapPin, Briefcase, Plane, Activity, ChevronDown } from "lucide-react";

export type AceContext = {
  location: "home" | "office" | "traveling";
  travelCity?: string;
  workMode: "auto" | "workday" | "vacation";
  status: "very_busy" | "mild_busy" | "mild_procrastination" | "main_procrastination" | "neutral";
};

const LS_KEY = "momentum:ace-context";

export const DEFAULT_CONTEXT: AceContext = {
  location: "home",
  workMode: "auto",
  status: "neutral",
};

export function loadContext(): AceContext {
  if (typeof window === "undefined") return DEFAULT_CONTEXT;
  try { return { ...DEFAULT_CONTEXT, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; } catch { return DEFAULT_CONTEXT; }
}

export function describeContext(ctx: AceContext): string {
  const parts: string[] = [];
  if (ctx.location === "home") parts.push("at home");
  else if (ctx.location === "office") parts.push("at the office");
  else if (ctx.location === "traveling") parts.push(`traveling${ctx.travelCity ? ` in ${ctx.travelCity}` : ""}`);
  const dow = new Date().getDay();
  const isWeekend = dow === 0 || dow === 6;
  const mode = ctx.workMode === "auto" ? (isWeekend ? "weekend" : "workday") : ctx.workMode;
  parts.push(mode);
  const statusMap: Record<AceContext["status"], string> = {
    very_busy: "very busy",
    mild_busy: "mildly busy",
    mild_procrastination: "mildly procrastinating",
    main_procrastination: "deep procrastination",
    neutral: "neutral focus",
  };
  parts.push(statusMap[ctx.status]);
  return parts.join(", ");
}

export function AceContextBar({ value, onChange }: { value: AceContext; onChange: (c: AceContext) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(value)); }, [value]);

  return (
    <div className="border-b border-border bg-card/40">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-4 md:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition">
        <MapPin className="h-3.5 w-3.5" />
        <span className="font-mono uppercase tracking-wider">Context:</span>
        <span className="truncate text-foreground">{describeContext(value)}</span>
        <ChevronDown className={`h-3.5 w-3.5 ml-auto transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 md:px-6 pb-3 grid gap-3 sm:grid-cols-3">
          <Field label="Where" icon={MapPin}>
            <div className="flex gap-1 flex-wrap">
              {(["home", "office", "traveling"] as const).map((l) => (
                <Chip key={l} active={value.location === l} onClick={() => onChange({ ...value, location: l })}>
                  {l === "home" ? "Home" : l === "office" ? "Office" : "Travel"}
                </Chip>
              ))}
            </div>
            {value.location === "traveling" && (
              <input
                value={value.travelCity ?? ""}
                onChange={(e) => onChange({ ...value, travelCity: e.target.value })}
                placeholder="City"
                className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            )}
          </Field>
          <Field label="Mode" icon={Briefcase}>
            <div className="flex gap-1 flex-wrap">
              {(["auto", "workday", "vacation"] as const).map((m) => (
                <Chip key={m} active={value.workMode === m} onClick={() => onChange({ ...value, workMode: m })}>
                  {m === "auto" ? "Auto" : m === "workday" ? "Workday" : "Vacation"}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Status" icon={Activity}>
            <div className="flex gap-1 flex-wrap">
              {([
                ["very_busy", "Very busy"],
                ["mild_busy", "Mild busy"],
                ["neutral", "Neutral"],
                ["mild_procrastination", "Mild proc."],
                ["main_procrastination", "Deep proc."],
              ] as const).map(([v, l]) => (
                <Chip key={v} active={value.status === v} onClick={() => onChange({ ...value, status: v })}>{l}</Chip>
              ))}
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-2.5 py-0.5 text-[11px] border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
      {children}
    </button>
  );
}
// silence unused import warning
void Plane;
