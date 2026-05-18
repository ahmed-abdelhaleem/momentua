import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY = z.enum(["meat", "chicken", "fish", "veg", "canned", "grain", "dairy", "other"]);
const LOCATION = z.enum(["fridge", "freezer", "pantry"]);

export const listPantry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("pantry_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const addPantryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    name: string;
    category: string;
    location: string;
    quantity?: string;
    expires_at?: string | null;
    barcode?: string | null;
  }) => z.object({
    name: z.string().min(1).max(160),
    category: CATEGORY,
    location: LOCATION,
    quantity: z.string().max(40).optional(),
    expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    barcode: z.string().max(40).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("pantry_items")
      .insert({
        user_id: userId,
        name: data.name,
        category: data.category,
        location: data.location,
        quantity: data.quantity || null,
        expires_at: data.expires_at || null,
        barcode: data.barcode || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { item: row };
  });

export const removePantryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Look up a product on Open Food Facts (no API key required).
export const lookupBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { barcode: string }) =>
    z.object({ barcode: z.string().min(6).max(20).regex(/^\d+$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    // Primary: Open Food Facts
    let name = "";
    let brand: string | null = null;
    let quantity: string | null = null;
    let tags = "";
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${data.barcode}.json`);
      if (r.ok) {
        const json = (await r.json()) as {
          status?: number;
          product?: {
            product_name?: string;
            product_name_sv?: string;
            product_name_en?: string;
            brands?: string;
            categories_tags?: string[];
            quantity?: string;
          };
        };
        if (json.product && json.status === 1) {
          const p = json.product;
          name = (p.product_name_sv || p.product_name_en || p.product_name || "").trim();
          brand = p.brands ?? null;
          quantity = p.quantity ?? null;
          tags = (p.categories_tags ?? []).join(" ").toLowerCase();
        }
      }
    } catch { /* fall through */ }

    // Fallback: UPCitemdb trial endpoint (no key, rate-limited but fine for occasional scans)
    if (!name) {
      try {
        const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${data.barcode}`);
        if (r.ok) {
          const j = (await r.json()) as { items?: Array<{ title?: string; brand?: string; category?: string }> };
          const it = j.items?.[0];
          if (it?.title) {
            name = it.title.trim();
            brand = brand ?? (it.brand || null);
            tags = (it.category || "").toLowerCase();
          }
        }
      } catch { /* ignore */ }
    }

    if (!name) return { found: false } as const;
    let category: "meat" | "chicken" | "fish" | "veg" | "canned" | "grain" | "dairy" | "other" = "other";
    if (/chicken|kyckling|poultry/.test(tags)) category = "chicken";
    else if (/fish|salmon|lax|seafood/.test(tags)) category = "fish";
    else if (/meat|beef|pork|kott|lamb/.test(tags)) category = "meat";
    else if (/dairy|milk|yogurt|cheese|mjolk/.test(tags)) category = "dairy";
    else if (/vegetable|fruit|legume|gronsak/.test(tags)) category = "veg";
    else if (/cereal|rice|pasta|bread|grain/.test(tags)) category = "grain";
    else if (/canned|preserved|konserv/.test(tags)) category = "canned";
    return {
      found: true as const,
      name,
      brand,
      quantity,
      category,
    };
  });

// Mark a cooking step as completed (or unmark).
export const toggleCookStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cook_session_id: string; step_id: string; completed: boolean }) =>
    z.object({
      cook_session_id: z.string().uuid(),
      step_id: z.string().min(1).max(40),
      completed: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.completed) {
      const { error } = await supabase
        .from("cook_step_progress")
        .upsert(
          { user_id: userId, cook_session_id: data.cook_session_id, step_id: data.step_id },
          { onConflict: "cook_session_id,step_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("cook_step_progress")
        .delete()
        .eq("user_id", userId)
        .eq("cook_session_id", data.cook_session_id)
        .eq("step_id", data.step_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listCookStepProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cook_session_id: string }) =>
    z.object({ cook_session_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cook_step_progress")
      .select("step_id, completed_at")
      .eq("cook_session_id", data.cook_session_id);
    if (error) throw new Error(error.message);
    return { steps: rows ?? [] };
  });
