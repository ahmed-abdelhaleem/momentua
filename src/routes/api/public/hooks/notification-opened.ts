import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/notification-opened")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return new Response("missing id", { status: 400 });
        const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await admin.from("notification_log").update({ opened_at: new Date().toISOString() }).eq("id", id);
        return new Response("ok");
      },
    },
  },
});
