// Native (Capacitor / Android) bridge. All calls are guarded so the web build
// continues to work unchanged — when running in a normal browser, every helper
// is a no-op and the dynamic imports never resolve to native plugins.
import { supabase } from "@/integrations/supabase/client";

type NativeCapacitor = typeof import("@capacitor/core").Capacitor;
const NATIVE_OAUTH_REDIRECT_URI = "lovable://oauth-callback";
const NATIVE_OAUTH_STATE_KEY = "momentum:native-oauth-state";

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
    setTimeout(() => SplashScreen.hide().catch(() => { }), 600);
  } catch { /* ignore */ }

  // Hardware back: pop history; exit on root.
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", ({ url }) => {
      void handleNativeOAuthCallback(url);
    });
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back();
      else App.exitApp();
    });
  } catch { /* ignore */ }

  // FCM push registration — fires on every native boot. Token upserts are idempotent.
  void registerPush();
}

function nativeOAuthState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function oauthParamsFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash.replace(/^\??/, ""));
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
}

function emitNativeOAuthError(message: string) {
  window.dispatchEvent(new CustomEvent("momentum:native-oauth-error", { detail: message }));
}

async function handleNativeOAuthCallback(url: string) {
  if (!url.startsWith(NATIVE_OAUTH_REDIRECT_URI)) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => { });

    const params = oauthParamsFromUrl(url);
    const error = params.get("error_description") ?? params.get("error");
    if (error) throw new Error(error);

    const expectedState = sessionStorage.getItem(NATIVE_OAUTH_STATE_KEY);
    const returnedState = params.get("state");
    if (expectedState && returnedState && expectedState !== returnedState) throw new Error("Sign-in state did not match. Please try again.");

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) throw sessionError;
    } else if (params.get("code")) {
      const { error: codeError } = await supabase.auth.exchangeCodeForSession(params.get("code")!);
      if (codeError) throw codeError;
    } else {
      throw new Error("Google sign-in returned without a session. Please try again.");
    }

    sessionStorage.removeItem(NATIVE_OAUTH_STATE_KEY);
    window.location.replace("/dashboard");
  } catch (e) {
    emitNativeOAuthError(e instanceof Error ? e.message : "Google sign-in failed");
  }
}

export async function signInWithNativeOAuth(provider: "google") {
  if (!(await isNative())) return { started: false };
  try {
    const state = nativeOAuthState();
    sessionStorage.setItem(NATIVE_OAUTH_STATE_KEY, state);
    const url = new URL("/~oauth/initiate", window.location.origin);
    url.search = new URLSearchParams({
      provider,
      redirect_uri: NATIVE_OAUTH_REDIRECT_URI,
      state,
      prompt: "select_account",
    }).toString();

    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: url.toString(), toolbarColor: "#0a0a0a" });
    return { started: true };
  } catch (e) {
    sessionStorage.removeItem(NATIVE_OAUTH_STATE_KEY);
    return { started: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
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
