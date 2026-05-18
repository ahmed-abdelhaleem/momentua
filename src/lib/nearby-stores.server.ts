// Server-only: Google Places API helpers for finding Swedish supermarkets nearby
// and inferring a store-offers URL we can hand to the existing scraper.

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  store: "ICA" | "Coop" | "Willys" | "Lidl" | "Hemköp" | "Mathem" | null;
  distance_m?: number;
  /** The store's own website as listed in Google Maps (often the per-branch page). */
  website?: string | null;
}

const PLACES_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

function inferStore(name: string): PlaceResult["store"] {
  const n = name.toLowerCase();
  if (n.includes("ica")) return "ICA";
  if (n.includes("coop")) return "Coop";
  if (n.includes("willys")) return "Willys";
  if (n.includes("lidl")) return "Lidl";
  if (n.includes("hemköp") || n.includes("hemkop")) return "Hemköp";
  if (n.includes("mathem")) return "Mathem";
  return null;
}

export async function findNearbySwedishStores(
  lat: number,
  lng: number,
  radius_m = 2500,
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured.");

  const body = {
    includedTypes: ["supermarket", "grocery_store"],
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radius_m },
    },
  };

  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Places ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      websiteUri?: string;
    }>;
  };

  const results: PlaceResult[] = (json.places ?? []).map((p) => {
    const name = p.displayName?.text ?? "";
    const store = inferStore(name);
    const plat = p.location?.latitude ?? 0;
    const plng = p.location?.longitude ?? 0;
    return {
      place_id: p.id,
      name,
      address: p.formattedAddress ?? "",
      lat: plat,
      lng: plng,
      store,
      distance_m: Math.round(haversine(lat, lng, plat, plng)),
      website: p.websiteUri ?? null,
    };
  });

  // Only keep stores we know how to scrape, sorted by distance.
  return results
    .filter((r) => r.store !== null)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// National fallback offers page per chain (used if per-store lookup fails).
export function offersUrlFor(store: NonNullable<PlaceResult["store"]>): string {
  switch (store) {
    case "ICA":    return "https://www.ica.se/erbjudanden/";
    case "Coop":   return "https://www.coop.se/erbjudanden/";
    case "Willys": return "https://www.willys.se/erbjudanden";
    case "Lidl":   return "https://www.lidl.se/c/veckans-erbjudanden/s10005207";
    case "Hemköp": return "https://www.hemkop.se/erbjudanden";
    case "Mathem": return "https://www.mathem.se/kampanjer";
  }
}

// Domain to constrain search to the chain's own site.
function chainDomain(store: NonNullable<PlaceResult["store"]>): string {
  switch (store) {
    case "ICA":    return "ica.se";
    case "Coop":   return "coop.se";
    case "Willys": return "willys.se";
    case "Lidl":   return "lidl.se";
    case "Hemköp": return "hemkop.se";
    case "Mathem": return "mathem.se";
  }
}

// Use Firecrawl search to resolve the *specific* store's offers page.
// Falls back to the national page when the search yields nothing usable.
// `mapsWebsite` is the URL Google Maps lists for this branch — usually the
// chain's per-store landing page, the most reliable starting point.
export async function resolveStoreOffersUrl(
  storeName: string,
  store: NonNullable<PlaceResult["store"]>,
  mapsWebsite?: string | null,
): Promise<string> {
  // Lidl + Mathem don't run per-store offers — national is correct.
  if (store === "Lidl" || store === "Mathem") return offersUrlFor(store);

  const domain = chainDomain(store);

  // 1) Trust Google Maps' website field when it points to the chain's own
  //    domain. Convert generic landing pages into the per-store offers URL
  //    when the chain follows a predictable pattern.
  if (mapsWebsite) {
    try {
      const u = new URL(mapsWebsite);
      if (u.hostname.toLowerCase().includes(domain)) {
        const offers = chainStoreOffersFromBranchUrl(u, store);
        if (offers) return offers;
        return u.toString();
      }
    } catch {
      /* ignore — fall through to search */
    }
  }

  // 2) Otherwise search Firecrawl for the exact branch's page on the chain domain.
  //    Use the FULL store name (e.g. "Maxi ICA Stormarknad Nacka") verbatim so
  //    we don't fall back to a generic "ICA Maxi" national listing.
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return offersUrlFor(store);
  const query = `"${storeName}" erbjudanden site:${domain}`;
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 5 }),
    });
    if (!r.ok) return offersUrlFor(store);
    const j = (await r.json()) as { data?: { web?: Array<{ url?: string; title?: string }> } | Array<{ url?: string; title?: string }> };
    const list = Array.isArray(j.data) ? j.data : (j.data?.web ?? []);
    const ranked = list
      .map((h) => h?.url)
      .filter((u): u is string => !!u && u.includes(domain))
      .sort((a, b) => score(b, store) - score(a, store));
    return ranked[0] ?? offersUrlFor(store);
  } catch {
    return offersUrlFor(store);
  }
}

/**
 * If Google Maps gave us a per-branch URL on the chain's site, try to derive
 * that branch's offers page. Falls back to returning the branch URL itself.
 */
function chainStoreOffersFromBranchUrl(
  u: URL,
  store: NonNullable<PlaceResult["store"]>,
): string | null {
  const path = u.pathname.replace(/\/+$/, "");
  switch (store) {
    case "ICA":
      // e.g. https://www.ica.se/butiker/maxi/stockholm/maxi-ica-stormarknad-nacka-1003802/
      if (/\/butiker\//.test(path)) return `${u.origin}${path}/erbjudanden/`;
      return null;
    case "Coop":
      if (/\/handla\/butiker\//.test(path) || /\/butik\//.test(path)) return `${u.origin}${path}/erbjudanden`;
      return null;
    case "Willys":
      if (/\/butik\//.test(path)) return `${u.origin}${path}/erbjudanden`;
      return null;
    case "Hemköp":
      if (/\/butik\//.test(path)) return `${u.origin}${path}/erbjudanden`;
      return null;
    default:
      return null;
  }
}

function score(url: string, store: NonNullable<PlaceResult["store"]>): number {
  const u = url.toLowerCase();
  let s = 0;
  if (u.includes("erbjudande")) s += 3;
  if (u.includes("/butik")) s += 2;
  if (store === "ICA" && u.includes("/butiker/")) s += 2;
  if (store === "Coop" && u.includes("/handla/butiker/")) s += 2;
  if (store === "Willys" && u.includes("/butik/")) s += 2;
  if (store === "Hemköp" && u.includes("/butik/")) s += 2;
  // Penalize generic landing.
  if (u.endsWith("/erbjudanden/") || u.endsWith("/erbjudanden")) s -= 1;
  return s;
}
