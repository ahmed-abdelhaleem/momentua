import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const UpsertSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["android", "ios"]).default("android"),
  device_label: z.string().max(120).optional(),
});

export const upsertFcmToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("fcm_tokens").upsert(
      {
        user_id: userId,
        token: data.token,
        platform: data.platform,
        device_label: data.device_label ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFcmToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("fcm_tokens").delete().eq("user_id", userId).eq("token", data.token);
    return { ok: true };
  });
