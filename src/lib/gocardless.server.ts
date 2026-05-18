// GoCardless Bank Account Data API (formerly Nordigen) — server-only.
// Free tier, accepts individuals. PSD2 access to Nordea, SEB, Handelsbanken,
// Swedbank, Revolut, etc. Sign up: https://bankaccountdata.gocardless.com
const BASE = "https://bankaccountdata.gocardless.com/api/v2";

export function gcCreds() {
  const id = process.env.GOCARDLESS_SECRET_ID;
  const key = process.env.GOCARDLESS_SECRET_KEY;
  return { id, key, configured: !!(id && key) };
}

let cachedToken: { access: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.access;
  const { id, key } = gcCreds();
  if (!id || !key) throw new Error("GoCardless not configured");
  const r = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
  });
  if (!r.ok) throw new Error(`GC token failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { access: string; access_expires: number };
  cachedToken = { access: j.access, exp: Date.now() + j.access_expires * 1000 };
  return j.access;
}

async function gc<T>(path: string, init?: RequestInit): Promise<T> {
  const t = await getToken();
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${t}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`GC ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

export interface Institution {
  id: string;
  name: string;
  bic?: string;
  transaction_total_days?: string;
  logo?: string;
}

export async function listInstitutions(country = "SE"): Promise<Institution[]> {
  return gc<Institution[]>(`/institutions/?country=${country}`);
}

export async function createRequisition(opts: {
  institutionId: string;
  redirect: string;
  reference: string; // our internal reference (user_id + nonce)
}): Promise<{ id: string; link: string; status: string }> {
  return gc(`/requisitions/`, {
    method: "POST",
    body: JSON.stringify({
      redirect: opts.redirect,
      institution_id: opts.institutionId,
      reference: opts.reference,
      user_language: "EN",
    }),
  });
}

export async function getRequisition(id: string): Promise<{
  id: string;
  status: string;
  accounts: string[];
  institution_id: string;
}> {
  return gc(`/requisitions/${id}/`);
}

export async function deleteRequisition(id: string): Promise<void> {
  await gc(`/requisitions/${id}/`, { method: "DELETE" }).catch(() => null);
}

export async function getAccountDetails(accountId: string) {
  return gc<{ account: { iban?: string; name?: string; ownerName?: string; currency?: string; product?: string } }>(
    `/accounts/${accountId}/details/`,
  );
}

export async function getAccountBalances(accountId: string) {
  return gc<{ balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }>(
    `/accounts/${accountId}/balances/`,
  );
}

export async function getAccountTransactions(accountId: string) {
  return gc<{
    transactions: {
      booked: Array<{
        transactionId?: string;
        internalTransactionId?: string;
        bookingDate?: string;
        valueDate?: string;
        transactionAmount: { amount: string; currency: string };
        creditorName?: string;
        debtorName?: string;
        remittanceInformationUnstructured?: string;
        proprietaryBankTransactionCode?: string;
      }>;
      pending?: unknown[];
    };
  }>(`/accounts/${accountId}/transactions/`);
}

export function categorize(merchant: string | null, description: string | null): string {
  const s = `${merchant ?? ""} ${description ?? ""}`.toLowerCase();
  if (/(ica|coop|willys|hemköp|hemkop|lidl|netto|city ?gross|mathem)/.test(s)) return "groceries";
  if (/(restaurang|pizza|sushi|max\b|burger|mcdonald|kfc|cafe|espresso|foodora|wolt)/.test(s)) return "restaurants";
  if (/(\bsl\b|slkort|sj\b|västtrafik|skånetrafiken|uber|bolt|taxi|parkering|circle ?k|okq8|preem|shell)/.test(s)) return "transport";
  if (/(spotify|netflix|hbo|disney|apple|google|microsoft|adobe|notion|youtube)/.test(s)) return "subscriptions";
  if (/(lön|salary|payment received|swish.*från)/.test(s)) return "income";
  if (/(hyra|rent|el ?nät|fortum|vattenfall|comhem|tele2|telia)/.test(s)) return "bills";
  return "other";
}
