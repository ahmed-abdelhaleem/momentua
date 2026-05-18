import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  categorize,
  createRequisition,
  deleteRequisition,
  gcCreds,
  getAccountBalances,
  getAccountDetails,
  getAccountTransactions,
  getRequisition,
  listInstitutions,
} from "./gocardless.server";

export const bankStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: gcCreds().configured };
});

export const listSwedishBanks = createServerFn({ method: "GET" }).handler(async () => {
  if (!gcCreds().configured) return { banks: [] as Array<{ id: string; name: string; logo?: string }> };
  const insts = await listInstitutions("SE");
  return { banks: insts.map((i) => ({ id: i.id, name: i.name, logo: i.logo })) };
});

export const startBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { institution_id: string; redirect_uri: string }) =>
    z.object({
      institution_id: z.string().min(1).max(120),
      redirect_uri: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!gcCreds().configured) {
      return { url: null as string | null, error: "Banking not configured. Add GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY." };
    }
    const { supabase, userId } = context;
    const reference = `gc-${userId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const req = await createRequisition({
      institutionId: data.institution_id,
      redirect: data.redirect_uri,
      reference,
    });
    await supabase.from("bank_connections").insert({
      user_id: userId,
      provider: "gocardless",
      credentials_id: req.id, // requisition id
      reference,
      institution_id: data.institution_id,
      institution_name: data.institution_id,
      status: "pending",
      consent_expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
    });
    return { url: req.link, error: null as string | null };
  });

export const completeBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) =>
    z.object({ reference: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conn } = await supabase
      .from("bank_connections")
      .select("id, credentials_id")
      .eq("user_id", userId)
      .eq("reference", data.reference)
      .maybeSingle();
    if (!conn?.credentials_id) throw new Error("Pending connection not found. Start the bank link again.");

    const req = await getRequisition(conn.credentials_id);
    if (!req.accounts?.length) {
      await supabase.from("bank_connections").update({ status: "failed", last_error: `No accounts (status: ${req.status})` }).eq("id", conn.id);
      throw new Error(`No accounts returned (status: ${req.status}). Try again.`);
    }
    await supabase
      .from("bank_connections")
      .update({
        status: "active",
        institution_id: req.institution_id,
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", conn.id);

    await syncAccounts(supabase, userId, conn.id, req.accounts);
    return { ok: true, connection_id: conn.id };
  });

export const syncBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connection_id: string }) =>
    z.object({ connection_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conn } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("id", data.connection_id)
      .eq("user_id", userId)
      .single();
    if (!conn?.credentials_id) throw new Error("Connection missing requisition id");
    const req = await getRequisition(conn.credentials_id);
    await syncAccounts(supabase, userId, conn.id, req.accounts ?? []);
    await supabase.from("bank_connections").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);
    return { ok: true };
  });

async function syncAccounts(supabase: any, userId: string, connId: string, accountIds: string[]) {
  for (const accId of accountIds) {
    try {
      const [details, balances, txs] = await Promise.all([
        getAccountDetails(accId).catch(() => null),
        getAccountBalances(accId).catch(() => null),
        getAccountTransactions(accId).catch(() => ({ transactions: { booked: [] } })),
      ]);
      const name = details?.account.name ?? details?.account.iban ?? "Account";
      const currency = details?.account.currency ?? balances?.balances?.[0]?.balanceAmount.currency ?? "SEK";
      const balVal = balances?.balances?.find((b) => b.balanceType === "interimAvailable" || b.balanceType === "closingBooked")?.balanceAmount.amount;

      const { data: acct } = await supabase
        .from("bank_accounts")
        .upsert(
          {
            connection_id: connId,
            user_id: userId,
            external_id: accId,
            name,
            type: details?.account.product ?? null,
            currency,
            balance: balVal ? Number(balVal) : 0,
          },
          { onConflict: "connection_id,external_id" },
        )
        .select("id")
        .single();
      if (!acct) continue;

      const rows = (txs.transactions.booked ?? []).map((t) => {
        const merchant = t.creditorName ?? t.debtorName ?? null;
        const desc = t.remittanceInformationUnstructured ?? null;
        return {
          account_id: acct.id,
          user_id: userId,
          external_id: t.transactionId ?? t.internalTransactionId ?? `${accId}:${t.bookingDate}:${t.transactionAmount.amount}:${desc ?? ""}`.slice(0, 200),
          booked_date: t.bookingDate ?? t.valueDate ?? new Date().toISOString().slice(0, 10),
          amount: Number(t.transactionAmount.amount),
          currency: t.transactionAmount.currency,
          description: desc,
          merchant,
          category: categorize(merchant, desc),
          raw: t as unknown as Record<string, unknown>,
        };
      });
      if (rows.length) {
        await supabase.from("bank_transactions").upsert(rows, { onConflict: "account_id,external_id" });
      }
    } catch (e) {
      console.error("sync account failed", accId, e);
    }
  }
}

export const listBankData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: connections }, { data: accounts }, { data: transactions }] = await Promise.all([
      supabase.from("bank_connections").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("bank_accounts").select("*").eq("user_id", userId),
      supabase
        .from("bank_transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("booked_date", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10))
        .order("booked_date", { ascending: false })
        .limit(200),
    ]);
    return { connections: connections ?? [], accounts: accounts ?? [], transactions: transactions ?? [] };
  });

export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connection_id: string }) =>
    z.object({ connection_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conn } = await supabase
      .from("bank_connections")
      .select("credentials_id")
      .eq("id", data.connection_id)
      .eq("user_id", userId)
      .single();
    if (conn?.credentials_id) await deleteRequisition(conn.credentials_id);
    await supabase.from("bank_connections").delete().eq("id", data.connection_id).eq("user_id", userId);
    return { ok: true };
  });
