import { Activity } from "lucide-react";

export type FeedItem = { id: string; label: string; meta: string; tone?: "gold" | "muted" | "burn" };

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function LiveFeedStrip({ items }: { items: { id: string; label: string; createdAt: string; tone?: FeedItem["tone"] }[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <Activity className="h-3.5 w-3.5" /> Nothing in the feed yet — log something to start the trail.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Live trail
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">{items.length} recent</div>
      </div>
      <div className="overflow-x-auto">
        <ul className="flex gap-2 px-4 pb-3 pt-2 min-w-max">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="animate-feed-rise rounded-xl border border-border/60 bg-background/40 px-3 py-2 min-w-[200px] max-w-[260px]"
              style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
            >
              <div className={`text-[12px] font-medium leading-snug truncate ${it.tone === "gold" ? "text-primary" : it.tone === "burn" ? "text-destructive" : "text-foreground"}`}>
                {it.label}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{timeAgo(it.createdAt)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
