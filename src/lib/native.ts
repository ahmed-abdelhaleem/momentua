// Native (Capacitor / Android) bridge. All calls are guarded so the web build
// continues to work unchanged — when running in a normal browser, every helper
// is a no-op and the dynamic imports never resolve to native plugins.
import { supabase } from "@/integrations/supabase/client";

type NativeCapacitor = typeof import("@capacitor/core").Capacitor;
let _cap: NativeCapacitor | null = null;
async function cap(): Promise<NativeCapacitor | null> {
  if (_cap) return _cap;
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("@capacitor/core");
    _cap = mod.Capacitor;
    return _cap;
  } catch { return null; }
}

export async function isNative(): Promise<boolean> {
  const c = await cap();
  return !!c?.isNativePlatform();
}

export async function nativePlatform(): Promise<"android" | "ios" | "web"> {
  const c = await cap();
  const p = c?.getPlatform?.() ?? "web";
  return (p === "android" || p === "ios") ? p : "web";
}

export async function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  if (!(await isNative())) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch { /* ignore */ }
}

// One-time native bootstrap: status bar, splash hide, hardware back, push register.
let _initStarted = false;
export async function initNative() {
  if (_initStarted) return;
  _initStarted = true;
  if (!(await isNative())) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
  } catch { /* ignore */ }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    setTimeout(() => SplashScreen.hide().catch(() => {}), 600);
  } catch { /* ignore */ }

  // Hardware back: pop history; exit on root.
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back();
      else App.exitApp();
    });
  } catch { /* ignore */ }

  // FCM push registration — fires on every native boot. Token upserts are idempotent.
  void registerPush();
}

async function registerPush() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();

    PushNotifications.addListener("registration", async (t) => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return; // user not logged in yet; will retry next boot
      try {
        const { upsertFcmToken } = await import("@/lib/fcm.functions");
        await upsertFcmToken({ data: { token: t.value, platform: "android" } });
      } catch (e) { console.error("fcm upsert failed", e); }
    });

    PushNotifications.addListener("registrationError", (e) => console.error("push reg error", e));

    // Tap on a notification → navigate to the URL we put in `data.url`.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string })?.url;
      if (url) window.location.assign(url);
    });
  } catch (e) {
    console.error("push setup failed", e);
  }
}

// Native barcode scan — returns the raw value or null on cancel/failure.
export async function nativeScanBarcode(): Promise<string | null> {
  if (!(await isNative())) return null;
  try {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") return null;
    const { barcodes } = await BarcodeScanner.scan();
    return barcodes[0]?.rawValue ?? null;
  } catch { return null; }
}
