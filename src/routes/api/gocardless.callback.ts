import { createFileRoute } from "@tanstack/react-router";

// GoCardless redirects the user back here. The requisition_id we created is in
// the `ref` query param (set when we built the requisition). Pass it to the
// integrations page which finishes the flow with an authenticated server fn.
export const Route = createFileRoute("/api/gocardless/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ref = url.searchParams.get("ref") ?? "";
        const error = url.searchParams.get("error") ?? "";
        const dest = new URL("/integrations", url.origin);
        if (error) dest.searchParams.set("bank_error", error);
        if (ref) dest.searchParams.set("bank_ref", ref);
        return Response.redirect(dest.toString(), 302);
      },
    },
  },
});
