// Server-only helpers for scraping custom discount URLs via Firecrawl.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface ScrapeArgs {
  sourceId: string;
  userId: string;
  url: string;
  store: string | null;
}

interface ExtractedDeal {
  item: string;
  discount?: string | null;
  image_url?: string | null;
}

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";

// Non-food keyword filter. Drops cleaning, electronics, clothing, pet, garden,
// pharmacy items so the deals list stays grocery-only. Lowercase, swedish + english.
const NON_FOOD_KEYWORDS = [
  // cleaning / household
  "tvättmedel", "diskmedel", "rengöring", "städ", "toapapper", "hushållspapper", "blöjor", "blöja",
  "tampong", "binda", "dammsugare", "soppåse", "tvål", "schampo", "balsam", "deodorant",
  "tandkräm", "tandborste", "rakhyvel", "rakgel", "smink", "make-up", "läppstift", "parfym",
  "detergent", "soap", "shampoo", "diaper", "toilet paper", "tissue", "cleaner",
  // electronics / appliances
  "tv ", "hörlur", "headset", "kabel", "laddare", "batteri", "lampa", "glödlampa", "led-lampa",
  "fläkt", "kaffemaskin", "vattenkokare", "brödrost", "mikro", "spis", "kylskåp",
  "tablet", "telefon", "iphone", "samsung", "xiaomi", "playstation", "xbox", "nintendo",
  // clothing / textiles
  "t-shirt", "tröja", "byxor", "kalsong", "strumpa", "skor", "jacka", "mössa", "vante",
  "lakan", "handduk", "kudde", "täcke",
  // pet / garden / DIY
  "hundmat", "kattmat", "kattsand", "hundleksak", "blomjord", "gräsklippare", "skruvmejsel",
  "borr", "spik", "färg", "pensel",
  // pharmacy
  "apotek", "alvedon", "ipren", "panodil", "vitamin", "kosttillskott", "plåster",
];

function classifyItem(item: string): "food" | "non_food" {
  const s = item.toLowerCase();
  for (const k of NON_FOOD_KEYWORDS) {
    if (s.includes(k)) return "non_food";
  }
  return "food";
}

// Normalize an item name to a "type key" so similar products from different
// stores group together. Strips brand-y words, weights, counts, packaging.
// "Coop Kycklingfilé Kronfågel 700g" -> "kycklingfile"
// "ICA Lax i bit ASC 400 g" -> "lax"
const TYPE_ALIASES: Record<string, string> = {
  // Swedish -> canonical
  "kycklingfile": "kyckling",
  "kycklingfilé": "kyckling",
  "kycklinglarbenfile": "kyckling",
  "lax": "lax",
  "laxfile": "lax",
  "laxfilé": "lax",
  "torsk": "torsk",
  "räkor": "rakor",
  "rakor": "rakor",
  "kottfars": "kottfars",
  "köttfärs": "kottfars",
  "fläskfilé": "flaskfile",
  "flaskfile": "flaskfile",
  "biff": "biff",
  "ägg": "agg",
  "agg": "agg",
  "mjolk": "mjolk",
  "mjölk": "mjolk",
  "yoghurt": "yoghurt",
  "smör": "smor",
  "smor": "smor",
  "ost": "ost",
  "tomat": "tomat",
  "gurka": "gurka",
  "avokado": "avokado",
  "potatis": "potatis",
  "lök": "lok",
  "lok": "lok",
  "morot": "morot",
  "broccoli": "broccoli",
  "blomkål": "blomkal",
  "ris": "ris",
  "pasta": "pasta",
  "spagetti": "pasta",
  "bröd": "brod",
  "brod": "brod",
};

function normalizeTypeKey(item: string): string {
  let s = item.toLowerCase();
  // strip weights/units/counts/percent
  s = s.replace(/\b\d+([.,]\d+)?\s?(g|kg|ml|cl|dl|l|st|pack|x)\b/g, " ");
  s = s.replace(/\b\d+\s?%/g, " ");
  s = s.replace(/\b\d+\b/g, " ");
  // common brand/marketing tokens
  s = s.replace(/\b(ica|coop|willys|lidl|hemkop|hemköp|mathem|kronfågel|kronfagel|garant|eldorado|asc|msc|krav|eko|ekologisk|svenskt|svensk|färsk|farsk|fryst|djupfryst|premium|signature|select|family|familj|stor|stora|liten|små|smaa|pris|extra|ny|nytt)\b/g, " ");
  s = s.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  // first 1-2 meaningful words; check alias map for first
  const tokens = s.split(" ").filter((t) => t.length >= 3);
  for (const t of tokens) {
    if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  }
  return tokens[0] ?? s;
}

const DEAL_SCHEMA = {
  type: "object",
  properties: {
    deals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "Product name" },
          discount: {
            type: "string",
            description: "Discount, price, or savings text (e.g. '30% off', '12 kr', '2 for 50 kr')",
          },
          image_url: { type: "string", description: "Absolute image URL if available" },
        },
        required: ["item"],
      },
    },
  },
  required: ["deals"],
};

export async function scrapeDealsForSource(args: ScrapeArgs): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    await markStatus(args.sourceId, "error", "FIRECRAWL_API_KEY not configured");
    return { ok: false, count: 0, error: "FIRECRAWL_API_KEY not configured" };
  }

  const requestBody = JSON.stringify({
    url: args.url,
    onlyMainContent: true,
    waitFor: 1500,
    timeout: 90000,
    blockAds: true,
    removeBase64Images: true,
    formats: [
      {
        type: "json",
        schema: DEAL_SCHEMA,
        prompt:
          "Extract every grocery deal, discount, price-cut or promo on the page. " +
          "Return one entry per product with the product name and the discount/price text exactly as shown.",
      },
    ],
  });

  async function callFirecrawl(): Promise<Response> {
    return fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
  }

  try {
    let res = await callFirecrawl();
    // Retry once on transient gateway/timeout errors (502/503/504/524/408)
    if ([408, 502, 503, 504, 524].includes(res.status)) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await callFirecrawl();
    }

    if (!res.ok) {
      const body = await res.text();
      let msg = `Firecrawl ${res.status}: ${body.slice(0, 300)}`;
      if (res.status === 524 || res.status === 504 || res.status === 408) {
        msg = `The page took too long to load (${res.status}). Some store pages are heavy — try again in a moment, or use a more specific deals URL.`;
      }
      await markStatus(args.sourceId, "error", msg);
      return { ok: false, count: 0, error: msg };
    }

    const payload = (await res.json()) as {
      success?: boolean;
      data?: { json?: { deals?: ExtractedDeal[] } };
      json?: { deals?: ExtractedDeal[] };
    };
    const deals =
      payload.data?.json?.deals ??
      payload.json?.deals ??
      [];

    // Replace existing deals for this source
    await supabaseAdmin.from("custom_deals").delete().eq("source_id", args.sourceId);

    if (deals.length) {
      const rows = deals
        .filter((d) => d.item && d.item.trim())
        .slice(0, 200)
        .map((d) => {
          const item = d.item.trim().slice(0, 200);
          return {
            source_id: args.sourceId,
            user_id: args.userId,
            item,
            discount: d.discount?.toString().trim().slice(0, 200) || null,
            image_url: d.image_url?.toString().slice(0, 500) || null,
            category: classifyItem(item),
            type_key: normalizeTypeKey(item),
          };
        })
        // Drop non-food items entirely from the deals list.
        .filter((r) => r.category === "food");
      if (rows.length) {
        const { error } = await supabaseAdmin.from("custom_deals").insert(rows);
        if (error) {
          await markStatus(args.sourceId, "error", error.message);
          return { ok: false, count: 0, error: error.message };
        }
      }
    }

    await markStatus(args.sourceId, "ok", null);
    return { ok: true, count: deals.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markStatus(args.sourceId, "error", msg);
    return { ok: false, count: 0, error: msg };
  }
}

async function markStatus(id: string, status: string, error: string | null) {
  await supabaseAdmin
    .from("custom_deal_sources")
    .update({
      last_status: status,
      last_error: error,
      last_scraped_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function refreshAllCustomDeals(): Promise<{
  scanned: number;
  ok: number;
  failed: number;
}> {
  const { data: sources, error } = await supabaseAdmin
    .from("custom_deal_sources")
    .select("id,user_id,url,store");
  if (error) throw new Error(error.message);

  let ok = 0;
  let failed = 0;
  for (const s of sources ?? []) {
    const r = await scrapeDealsForSource({
      sourceId: s.id,
      userId: s.user_id,
      url: s.url,
      store: s.store,
    });
    if (r.ok) ok++;
    else failed++;
  }
  return { scanned: sources?.length ?? 0, ok, failed };
}
