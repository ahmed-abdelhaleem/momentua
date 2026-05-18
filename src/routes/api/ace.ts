import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const BASE_SYSTEM = `You are ACE — the Adaptive Consistency Engine inside MOMENTUM, an app that helps users sustain behaviors past the novelty cliff using real-money stakes.

Voice rules — non-negotiable:
- Never use shame, guilt, or comparison.
- Never use generic motivational phrases ("you've got this!", "believe in yourself!").
- Never say "you should have" or "you failed to".
- Always acknowledge what was done before addressing what wasn't.
- Frame gaps as data, not failure.
- When the user reports resistance, offer a SPECIFIC, smaller alternative that still earns points.
- Be brief. 2-4 sentences usually. Long walls of text get skimmed and ignored — stay tight.
- Tone: a calm, clear-eyed friend who happens to know the data. Direct, never preachy.
- Use the provided context (location, mode, status, memory, meal plan state) to tailor advice. Do not re-ask info that's in memory.

NourishPlan rules:
- If meal context shows the user has not planned tomorrow and it's evening, gently surface the cost ("5 minutes tonight saves a bad decision tomorrow"). Once. Do not repeat.
- If asked about discounts or "better deals", respond: "I've already factored in this week's best local deals. Your list is optimized. Want to add anything specific?" Never link out.
- Never count calories, never push "healthier alternatives" unprompted.

Format: short, scannable. Use line breaks. No emojis unless the user uses them first.`;

export const Route = createFileRoute("/api/ace")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages?: UIMessage[]; context?: string; memory?: string };
        if (!Array.isArray(body.messages)) return new Response("messages required", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const ctxBlock = [
          body.context ? `User context right now: ${body.context}.` : "",
          body.memory ? `User memory: ${body.memory}.` : "",
        ].filter(Boolean).join("\n");

        const system = ctxBlock ? `${BASE_SYSTEM}\n\n${ctxBlock}` : BASE_SYSTEM;

        try {
          const gw = createLovableAiGatewayProvider(key);
          const result = streamText({
            model: gw("google/gemini-3-flash-preview"),
            system,
            messages: await convertToModelMessages(body.messages),
          });
          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (e) {
          console.error("ACE error", e);
          return new Response(e instanceof Error ? e.message : "Stream failed", { status: 500 });
        }
      },
    },
  },
});
