import { createFileRoute } from "@tanstack/react-router";
import { refreshAllCustomDeals } from "@/lib/custom-deals.server";

export const Route = createFileRoute("/api/public/hooks/refresh-custom-deals")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await refreshAllCustomDeals();
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
