import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const SYSTEM = `You are the Spiral Coach inside MOMENTUM. The user logs anything they lose time to — doom-scrolling, rabbit holes, binge gaming (chess, video games), porn, escorts / sex work, gambling, fantasy planning, news loops, YouTube black holes, etc. Not just screens.

Your job: read the recent spiral entries (topic, minutes, optional trigger note, timestamp) and give the user calm, useful insight.

Rules:
- Zero shame, zero moralizing, zero "you should". No matter the topic (including escorts, porn, gambling) — treat it as neutral data the user chose to track. Never lecture about the activity itself; focus on patterns, timing, triggers, and totals.
- Be specific. Reference actual topics, times of day, totals.
- Group related topics when obvious (e.g. chess + video games = "gaming"; porn + escorts = "sexual content"). Use the user's own words where possible.
- 4–7 short bullets max. Then ONE concrete experiment to try this week.
- If a trigger pattern emerges (evenings, after work, weekends, certain topics), name it.
- If totals are small or you only see 1-2 entries, say so and ask what to track next instead of inventing patterns.
- Never use emojis unless the user did.`;

export const Route = createFileRoute("/api/spirals-analyze")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { entries?: Array<{ label: string; points: number; created_at: string }> };
        const entries = Array.isArray(body.entries) ? body.entries.slice(0, 200) : [];
        if (entries.length === 0) return new Response("No spirals to analyze yet.", { status: 200 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const lines = entries.map((e) => {
          const d = new Date(e.created_at);
          return `- ${d.toISOString().slice(0, 16).replace("T", " ")} | ${e.label} | ${e.points} pts`;
        }).join("\n");

        try {
          const gw = createLovableAiGatewayProvider(key);
          const { text } = await generateText({
            model: gw("google/gemini-3-flash-preview"),
            system: SYSTEM,
            prompt: `Recent spiral logs (most recent first):\n\n${lines}\n\nGive me the read.`,
          });
          return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
        } catch (e) {
          console.error("spirals-analyze error", e);
          return new Response(e instanceof Error ? e.message : "Failed", { status: 500 });
        }
      },
    },
  },
});
