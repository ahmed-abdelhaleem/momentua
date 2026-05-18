import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrapeDealsForSource } from "./custom-deals.server";

const URL_RE = /^https?:\/\/[^\s]{4,500}$/i;

export const listCustomDealSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("custom_deal_sources")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { sources: data ?? [] };
  });

export const listCustomDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("custom_deals")
      .select("*")
      .order("scraped_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { deals: data ?? [] };
  });

export const addCustomDealSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; label?: string }) =>
    z
      .object({
        url: z.string().regex(URL_RE, "Enter a valid http(s) URL"),
        label: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let store: string | null = null;
    try {
      const host = new URL(data.url).hostname.toLowerCase();
      if (host.includes("ica")) store = "ICA";
      else if (host.includes("coop")) store = "Coop";
      else if (host.includes("willys")) store = "Willys";
      else if (host.includes("lidl")) store = "Lidl";
      else if (host.includes("hemkop")) store = "Hemköp";
      else if (host.includes("mathem")) store = "Mathem";
    } catch {}
    const { data: row, error } = await supabase
      .from("custom_deal_sources")
      .insert({
        user_id: userId,
        url: data.url,
        label: data.label || null,
        store,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { source: row };
  });

export const removeCustomDealSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("custom_deal_sources")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshCustomDealSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src, error } = await supabase
      .from("custom_deal_sources")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !src) throw new Error(error?.message || "Source not found");
    const result = await scrapeDealsForSource({
      sourceId: src.id,
      userId,
      url: src.url,
      store: src.store,
    });
    return result;
  });
