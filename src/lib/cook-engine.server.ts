// Server-only: builds a meal-suggestion prompt from scraped deals + baseline
// prices + pantry items and asks the Lovable AI Gateway for cooking options.
import { BASELINE_PRICES, findBaseline, type StoreId } from "./baseline-prices";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface DealRow {
  item: string;
  discount: string | null;
  store: string | null;
  source_url: string;
}

export interface PantryRow {
  name: string;
  category: string;
  location: string;
  quantity?: string | null;
  expires_at?: string | null;
}

export interface SuggestionIngredient {
  item: string;
  qty: string;
  weight_g?: number;
  store: string;
  unit_price_sek: number;
  source: "deal" | "baseline" | "pantry";
  deal_label?: string;
}

export interface CookStep {
  id: string;
  text: string;
  duration_min?: number;
  requires_timer?: boolean;
}

export interface DefrostInfo {
  required: boolean;
  items?: string[];
  hours_ahead?: number;
}

export interface MacroInfo {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealSuggestion {
  name: string;
  time_min: number;
  active_time_min?: number;
  ingredients: SuggestionIngredient[];
  total_cost_sek: number;
  why_picked: string;
  cuisine?: string;
  steps?: CookStep[];
  defrost?: DefrostInfo;
  equipment?: string[];
  per_portion?: MacroInfo;
  pantry_used?: number;
}

interface SuggestArgs {
  style: "quick" | "sophisticated";
  portions: number;
  slotCount: number;
  preferredStores: StoreId[];
  deals: DealRow[];
  pantry?: PantryRow[];
  avoidItems?: string[];
  count?: number;
}

export async function suggestMeals(args: SuggestArgs): Promise<MealSuggestion[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const usableDeals = args.deals
    .filter((d) => d.item && d.item.length < 80)
    .filter((d) => !args.preferredStores.length || !d.store || args.preferredStores.includes(d.store as StoreId))
    .slice(0, 60);

  const baselineList = BASELINE_PRICES.slice(0, 60)
    .map((b) => `- ${b.item} (${b.unit}): ${b.price_sek} SEK`)
    .join("\n");

  const dealsList = usableDeals.length
    ? usableDeals.map((d) => `- [${d.store ?? "?"}] ${d.item}${d.discount ? ` — ${d.discount}` : ""}`).join("\n")
    : "(no active scraped deals — use baseline prices only)";

  const pantry = (args.pantry ?? []).slice(0, 40);
  const pantryList = pantry.length
    ? pantry.map((p) => `- ${p.name} (${p.category}, ${p.location}${p.quantity ? `, ${p.quantity}` : ""}${p.expires_at ? `, expires ${p.expires_at}` : ""})`).join("\n")
    : "(no pantry items)";

  const styleRule = args.style === "quick"
    ? "QUICK: total active cooking time ≤ 15 minutes, ≤ 6 ingredients, minimal prep, one pan or pot."
    : "SOPHISTICATED: 25–45 min, allow technique (sear, roast, reduce, marinate). Up to 10 ingredients.";

  const system = `You are a Swedish home-cook meal planner for a SOLO eater who batch-cooks one meal that covers several slots. Always reply with strict JSON only — no prose.`;

  const count = args.count ?? 4;
  const avoidLine = args.avoidItems?.length
    ? `- AVOID these ingredients (the user could not buy them): ${args.avoidItems.join(", ")}.`
    : "";

  const user = `Plan ${count} alternative meal suggestions.

CONSTRAINTS:
- Cooking once produces ${args.portions} portions covering ${args.slotCount} meal slot(s).
- ${styleRule}
- HIGHEST PRIORITY: use items from the user's PANTRY below. A meal that uses ≥2 pantry items beats one that uses 0.
  Mark pantry-sourced ingredients with "source": "pantry" and unit_price_sek 0.
- After pantry, prefer ingredients from ACTIVE DEALS (mark "source": "deal").
- Otherwise use BASELINE prices ("source": "baseline").
- Stores the user shops at: ${args.preferredStores.join(", ") || "any Swedish supermarket"}.
- For each ingredient include weight_g (estimated grams for the whole cook session).
- Provide step-by-step cooking instructions with duration_min and requires_timer for each step.
- If meat/fish/poultry needs defrosting, set defrost.required=true with hours_ahead and items[].
- Compute per_portion macros: calories, protein_g, carbs_g, fat_g.
- Compute total_cost_sek (sum, integer SEK).
- pantry_used = count of ingredients with source=pantry.
${avoidLine}

PANTRY (already at home — prioritize!):
${pantryList}

ACTIVE DEALS:
${dealsList}

BASELINE PRICES:
${baselineList}

Return JSON:
{
  "suggestions": [
    {
      "name": "string",
      "cuisine": "string",
      "time_min": number,
      "active_time_min": number,
      "ingredients": [
        {"item":"string","qty":"e.g. 300g","weight_g":number,"store":"ICA|Coop|Willys|Lidl|Hemköp|Mathem|any|pantry","unit_price_sek":number,"source":"pantry|deal|baseline","deal_label":"optional"}
      ],
      "steps": [
        {"id":"s1","text":"...","duration_min":number,"requires_timer":boolean}
      ],
      "defrost": {"required":boolean,"items":["..."],"hours_ahead":number},
      "equipment": ["pan","oven"],
      "per_portion": {"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number},
      "pantry_used": number,
      "total_cost_sek": number,
      "why_picked": "1 short sentence — emphasize pantry/deal usage"
    }
  ]
}`;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: { suggestions?: MealSuggestion[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned non-JSON response");
  }
  const suggestions = (parsed.suggestions ?? []).slice(0, count);

  for (const s of suggestions) {
    s.total_cost_sek = Math.max(0, Math.round(s.total_cost_sek || 0));
    s.ingredients = (s.ingredients ?? []).map((ing) => {
      if (ing.source === "pantry") ing.unit_price_sek = 0;
      if (ing.source === "baseline") {
        const b = findBaseline(ing.item);
        if (b && Math.abs((ing.unit_price_sek || 0) - b.price_sek) > b.price_sek * 0.5) {
          ing.unit_price_sek = b.price_sek;
        }
      }
      return ing;
    });
    if (typeof s.pantry_used !== "number") {
      s.pantry_used = s.ingredients.filter((i) => i.source === "pantry").length;
    }
    // Ensure step ids exist
    if (Array.isArray(s.steps)) {
      s.steps = s.steps.map((st, i) => ({ ...st, id: st.id || `s${i + 1}` }));
    }
  }

  return suggestions;
}
