// Client-side push subscription helpers. Safe-guarded against iframes & previews.
import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BJWk-mOw0-3npSEQ7AD3Bqc6IYN6p6r6nGcXSNM1CT136oJfhkZhkFGLpJtrX4Yqzrg2JgsKv7GG_CCVElJ3w7g";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  return true;
}

function inIframeOrPreview(): boolean {
  try {
    const inIframe = window.self !== window.top;
    const host = window.location.hostname;
    const preview = host.includes("id-preview--") || host.includes("lovableproject.com");
    return inIframe || preview;
  } catch { return true; }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  if (inIframeOrPreview()) {
    // Preview safety: never register inside the editor iframe.
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("SW registration failed", e);
    return null;
  }
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!pushSupported()) return "denied";
  return Notification.permission;
}

export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "Push not supported on this device." };
  if (inIframeOrPreview()) return { ok: false, reason: "Open the published app to enable notifications." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permission denied." };
  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, reason: "Service worker unavailable." };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in." };
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: json.endpoint!,
    p256dh: json.keys!.p256dh!,
    auth: json.keys!.auth!,
    user_agent: navigator.userAgent,
    last_used_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function unsubscribePush(): Promise<void> {
  if (!pushSupported() || inIframeOrPreview()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}

export async function pushIsSubscribed(): Promise<boolean> {
  if (!pushSupported() || inIframeOrPreview()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
