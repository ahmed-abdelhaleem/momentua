import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { suggestMeals, type MealSuggestion, type DealRow } from "./cook-engine.server";
import { findNearbySwedishStores, offersUrlFor, resolveStoreOffersUrl } from "./nearby-stores.server";
import { scrapeDealsForSource } from "./custom-deals.server";
import type { StoreId } from "./baseline-prices";

const SLOT = z.enum(["today_lunch", "today_dinner", "tomorrow_lunch", "tomorrow_dinner"]);

export const suggestCookOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    style: "quick" | "sophisticated";
    portions: number;
    slots: string[];
  }) =>
    z
      .object({
        style: z.enum(["quick", "sophisticated"]),
        portions: z.number().int().min(1).max(8),
        slots: z.array(SLOT).min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: deals }, { data: pantry }] = await Promise.all([
      supabase.from("profiles").select("preferred_stores").eq("id", userId).maybeSingle(),
      supabase
        .from("custom_deals")
        .select("item,discount,source_id, custom_deal_sources!inner(store,url)")
        .eq("user_id", userId)
        .order("scraped_at", { ascending: false })
        .limit(200),
      supabase
        .from("pantry_items")
        .select("name,category,location,quantity,expires_at")
        .eq("user_id", userId)
        .limit(80),
    ]);

    const preferredStores = ((profile?.preferred_stores ?? []) as string[]) as StoreId[];

    const dealRows: DealRow[] = ((deals ?? []) as Array<{
      item: string;
      discount: string | null;
      custom_deal_sources: { store: string | null; url: string } | null;
    }>).map((d) => ({
      item: d.item,
      discount: d.discount,
      store: d.custom_deal_sources?.store ?? null,
      source_url: d.custom_deal_sources?.url ?? "",
    }));

    const suggestions = await suggestMeals({
      style: data.style,
      portions: data.portions,
      slotCount: data.slots.length,
      preferredStores,
      deals: dealRows,
      pantry: (pantry ?? []) as Array<{ name: string; category: string; location: string; quantity: string | null; expires_at: string | null }>,
    });

    return { suggestions, dealCount: dealRows.length, pantryCount: (pantry ?? []).length, preferredStores };
  });

export const saveCookSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    style: "quick" | "sophisticated";
    portions: number;
    slots: string[];
    meal: MealSuggestion;
    cook_for_date: string;
  }) =>
    z
      .object({
        style: z.enum(["quick", "sophisticated"]),
        portions: z.number().int().min(1).max(8),
        slots: z.array(SLOT).min(1).max(4),
        meal: z.any(),
        cook_for_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cook_sessions")
      .insert({
        user_id: userId,
        style: data.style,
        portions: data.portions,
        slots: data.slots,
        meal: data.meal,
        total_cost_sek: data.meal?.total_cost_sek ?? null,
        cook_for_date: data.cook_for_date,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { session: row };
  });

export const deleteCookSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cook_sessions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCookSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cook_sessions")
      .select("*")
      .order("cook_for_date", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { sessions: data ?? [] };
  });

export const setPreferredStores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stores: string[] }) =>
    z
      .object({
        stores: z
          .array(z.enum(["ICA", "Coop", "Willys", "Lidl", "Hemköp", "Mathem"]))
          .max(6),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_stores: data.stores })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPreferredStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("preferred_stores")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { stores: ((data?.preferred_stores ?? []) as string[]) };
  });

// ----- POST-COOK: leftovers, fridge/freeze, follow-up reminder -----
export const updatePostCook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    portions_eaten: number;
    portions_stored: number;
    storage: "fridge" | "freezer" | "none";
    notes?: string;
    follow_up_at?: string | null;
  }) =>
    z.object({
      id: z.string().uuid(),
      portions_eaten: z.number().int().min(0).max(8),
      portions_stored: z.number().int().min(0).max(8),
      storage: z.enum(["fridge", "freezer", "none"]),
      notes: z.string().max(500).optional(),
      follow_up_at: z.string().datetime().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cook_sessions")
      .update({
        post_cook: {
          portions_eaten: data.portions_eaten,
          portions_stored: data.portions_stored,
          storage: data.storage,
          notes: data.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        follow_up_at: data.follow_up_at ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- SHOP OVERRIDES: track what was actually bought -----
const ShopOverrideSchema = z.object({
  removed: z.array(z.string().min(1).max(120)).max(40).default([]),
  quantities: z.record(z.string(), z.string().max(60)).default({}),
  added: z.array(z.object({
    item: z.string().min(1).max(120),
    qty: z.string().max(60),
    store: z.string().max(40),
    unit_price_sek: z.number().min(0).max(2000),
  })).max(40).default([]),
});

export const updateShopOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; overrides: unknown }) =>
    z.object({ id: z.string().uuid(), overrides: ShopOverrideSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cook_sessions")
      .update({ shop_overrides: data.overrides })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- RE-SUGGEST a swap meal when key ingredients are missing -----
export const resuggestSwapMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    style: "quick" | "sophisticated";
    portions: number;
    slots: string[];
    avoidItems: string[];
  }) => z.object({
    style: z.enum(["quick", "sophisticated"]),
    portions: z.number().int().min(1).max(8),
    slots: z.array(z.string()).min(1).max(4),
    avoidItems: z.array(z.string().min(1).max(120)).min(1).max(20),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: deals }] = await Promise.all([
      supabase.from("profiles").select("preferred_stores").eq("id", userId).maybeSingle(),
      supabase.from("custom_deals")
        .select("item,discount,source_id, custom_deal_sources!inner(store,url)")
        .eq("user_id", userId).order("scraped_at", { ascending: false }).limit(200),
    ]);
    const preferredStores = ((profile?.preferred_stores ?? []) as string[]) as StoreId[];
    const dealRows: DealRow[] = ((deals ?? []) as Array<{
      item: string; discount: string | null;
      custom_deal_sources: { store: string | null; url: string } | null;
    }>).map((d) => ({
      item: d.item, discount: d.discount,
      store: d.custom_deal_sources?.store ?? null,
      source_url: d.custom_deal_sources?.url ?? "",
    }));
    const suggestions = await suggestMeals({
      style: data.style,
      portions: data.portions,
      slotCount: data.slots.length,
      preferredStores,
      deals: dealRows,
      avoidItems: data.avoidItems,
      count: 2,
    });
    return { suggestions };
  });

// ----- NEARBY STORES: discover via Google Places + auto-add as deal sources -----
export const findNearbyStoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lat: number; lng: number; radius_m?: number }) =>
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radius_m: z.number().int().min(500).max(20000).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const stores = await findNearbySwedishStores(data.lat, data.lng, data.radius_m);
    return { stores };
  });

export const importNearbyStoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stores: Array<{ name: string; store: string; website?: string | null }> }) =>
    z.object({
      stores: z.array(z.object({
        name: z.string().min(1).max(160),
        store: z.enum(["ICA", "Coop", "Willys", "Lidl", "Hemköp", "Mathem"]),
        website: z.string().url().nullable().optional(),
      })).min(1).max(15),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Dedupe by *branch* (chain + name), so each branch can have its own offers page.
    const seen = new Set<string>();
    const uniqueStores = data.stores.filter((s) => {
      const k = `${s.store}::${s.name.trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const created: Array<{ id: string; store: string; url: string; label: string }> = [];

    for (const s of uniqueStores) {
      const chain = s.store as "ICA" | "Coop" | "Willys" | "Lidl" | "Hemköp" | "Mathem";
      // Try to resolve a store-specific page; fall back to national.
      let url: string;
      try {
        url = await resolveStoreOffersUrl(s.name, chain, s.website ?? null);
      } catch {
        url = offersUrlFor(chain);
      }
      // Skip if user already has a source pointing at the same URL.
      const { data: existing } = await supabase
        .from("custom_deal_sources")
        .select("id")
        .eq("user_id", userId)
        .eq("url", url)
        .maybeSingle();
      if (existing?.id) continue;

      const { data: row, error } = await supabase
        .from("custom_deal_sources")
        .insert({ user_id: userId, url, label: s.name, store: chain })
        .select("id, url, store")
        .single();
      if (error) throw new Error(error.message);
      created.push({ id: row.id, store: chain, url, label: s.name });
    }

    // Fire scrape for each newly-created source (best-effort).
    const results: Array<{ store: string; label: string; url: string; ok: boolean; error?: string }> = [];
    for (const c of created) {
      try {
        await scrapeDealsForSource({ sourceId: c.id, userId, url: c.url, store: c.store });
        results.push({ store: c.store, label: c.label, url: c.url, ok: true });
      } catch (e) {
        results.push({ store: c.store, label: c.label, url: c.url, ok: false, error: e instanceof Error ? e.message : "scrape failed" });
      }
    }
    return { added: created.length, results };
  });
