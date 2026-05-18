import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendFcm, isFcmTokenDead } from "@/lib/fcm-send.server";

const VAPID_PUBLIC_KEY =
  "BJWk-mOw0-3npSEQ7AD3Bqc6IYN6p6r6nGcXSNM1CT136oJfhkZhkFGLpJtrX4Yqzrg2JgsKv7GG_CCVElJ3w7g";

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const subject = process.env.VAPID_SUBJECT || "mailto:notifications@momentum.app";
    const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
    if (!privateKey) throw new Error("VAPID_PRIVATE_KEY not configured on the server.");
    // web-push expects the URL-safe base64 32-byte private key. Validate to give a clearer error.
    try {
      const b64 = privateKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(privateKey.length / 4) * 4, "=");
      const len = Buffer.from(b64, "base64").length;
      if (len !== 32) throw new Error(`VAPID_PRIVATE_KEY decoded to ${len} bytes, expected 32. Generate a new pair with web-push and update the secret.`);
    } catch (e) {
      throw e instanceof Error ? e : new Error("VAPID_PRIVATE_KEY invalid");
    }
    webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, privateKey);

    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const [{ data: subs }, { data: fcm }] = await Promise.all([
      admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
      admin.from("fcm_tokens").select("id, token").eq("user_id", userId),
    ]);

    const total = (subs?.length ?? 0) + (fcm?.length ?? 0);
    if (total === 0) {
      return { sent: 0, total: 0, reason: "No push device registered for this account. Enable notifications in the browser, or open the Android app to register it." };
    }

    const payload = JSON.stringify({
      title: "Test push ✓",
      body: "If you see this, notifications are working.",
      url: "/dashboard",
      kind: "test",
      tag: "test",
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        failed++;
        const err = e as { statusCode?: number; body?: string };
        errors.push(`web ${err.statusCode ?? "?"}: ${(err.body ?? "").toString().slice(0, 120)}`);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }

    if (fcm && fcm.length > 0) {
      const results = await sendFcm(fcm.map((f) => f.token), {
        title: "Test push ✓", body: "Native Android push is working.", tag: "test",
        data: { url: "/dashboard", kind: "test" },
      });
      for (const r of results) {
        if (r.ok) sent++;
        else {
          failed++;
          errors.push(`fcm ${r.status}: ${(r.error ?? "").slice(0, 120)}`);
          if (isFcmTokenDead(r.status, r.error)) {
            await admin.from("fcm_tokens").delete().eq("token", r.token);
          }
        }
      }
    }

    return { sent, failed, total, errors: errors.length ? errors : undefined };
  });
