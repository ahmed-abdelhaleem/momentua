import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "momentum_install_dismissed_at";
const DISMISS_DAYS = 7;

export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Hide if already installed
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS
      window.navigator.standalone === true;
    if (standalone) return;

    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissed && Date.now() - dismissed < DISMISS_DAYS * 86400_000) return;

    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = isIos && /safari/.test(ua) && !/crios|fxios/.test(ua);

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isSafari) {
      setIosHint(true);
      setOpen(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setOpen(false);
    else dismiss();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:bottom-4 sm:right-4 sm:left-auto">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Install MOMENTUM</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {iosHint
              ? "Tap the Share icon in Safari, then “Add to Home Screen” to install as an app."
              : "Get the full-screen app with its own icon. One tap from your home screen."}
          </p>
          {!iosHint && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={install} className="flex-1">
                Install app
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Later
              </Button>
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
