import { createFileRoute } from "@tanstack/react-router";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const SYSTEM = `You are the Vault curator inside MOMENTUM, an app where users redeem points for healthy real-world rewards.

Decide if the user's suggested reward is:
- Healthy / pro-behavior (travel, sport, food experience, learning, wellness, culture, social) → approve
- Harmful, addictive, regressive (gambling, drugs, alcohol-binges, junk-food binges, online gambling, sports betting, vaping/smoking, escort services, anything illegal) → reject

If approved, refine the title to be tight and inspirational (max 6 words), write a one-sentence enticing description (max 100 chars), pick a category from: Travel, Experience, Sport, Learning, Food, Wellness, Culture, and propose a fair point cost between 5,000 and 300,000 based on real-world value (10,000 pts ≈ 100 SEK roughly).

If rejected, give a brief, non-judgmental reason (1 sentence) and suggest a healthier alternative title.`;

const Schema = z.object({
  approved: z.boolean(),
  title: z.string().max(60),
  description: z.string().max(140),
  category: z.enum(["Travel", "Experience", "Sport", "Learning", "Food", "Wellness", "Culture"]),
  points: z.number().int().min(5000).max(300_000),
  reason: z.string().max(160).nullable().optional(),
  alternative: z.string().max(60).nullable().optional(),
});

export const Route = createFileRoute("/api/vault-suggest")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { suggestion?: string };
        const suggestion = (body.suggestion ?? "").trim();
        if (!suggestion) return new Response("suggestion required", { status: 400 });
        if (suggestion.length > 280) return new Response("too long", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        try {
          const gw = createLovableAiGatewayProvider(key);
          const { object } = await generateObject({
            model: gw("google/gemini-2.5-flash"),
            system: SYSTEM,
            schema: Schema,
            
            prompt: `User suggestion: "${suggestion}"`,
          });
          return Response.json(object);
        } catch (e) {
          console.error("vault-suggest error", e);
          return new Response(e instanceof Error ? e.message : "Failed", { status: 500 });
        }
      },
    },
  },
});
