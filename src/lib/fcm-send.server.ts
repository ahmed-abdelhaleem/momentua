// Cloudflare-Worker-compatible FCM HTTP v1 sender.
// Signs a JWT with the service account's RS256 private key using Web Crypto,
// exchanges it for an OAuth2 access token, then POSTs to fcm.googleapis.com.
// No firebase-admin (Node-only) needed.

type ServiceAccount = {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string; // PEM with \n
  client_email: string;
  token_uri: string;
};

let _cachedToken: { token: string; expiresAt: number } | null = null;
let _cachedSa: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (_cachedSa) return _cachedSa;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    _cachedSa = JSON.parse(raw) as ServiceAccount;
    return _cachedSa;
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON parse failed", e);
    return null;
  }
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeString(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const stripped = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.expiresAt > now + 60) return _cachedToken.token;

  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlEncodeString(JSON.stringify(header))}.${b64urlEncodeString(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64urlEncode(sig)}`;

  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`FCM oauth failed: ${resp.status} ${await resp.text()}`);
  const j = (await resp.json()) as { access_token: string; expires_in: number };
  _cachedToken = { token: j.access_token, expiresAt: now + j.expires_in };
  return j.access_token;
}

export type FcmPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  tag?: string;
};

export type FcmResult = { token: string; ok: boolean; status: number; error?: string };

export async function sendFcm(tokens: string[], payload: FcmPayload): Promise<FcmResult[]> {
  const sa = loadServiceAccount();
  if (!sa || tokens.length === 0) return [];
  const accessToken = await getAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const results: FcmResult[] = [];
  for (const token of tokens) {
    try {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: {
            priority: "HIGH" as const,
            notification: {
              tag: payload.tag,
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
        },
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (r.ok) {
        results.push({ token, ok: true, status: r.status });
      } else {
        results.push({ token, ok: false, status: r.status, error: (await r.text()).slice(0, 200) });
      }
    } catch (e) {
      results.push({ token, ok: false, status: 0, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return results;
}

// Status codes that mean "token is dead, drop it".
export function isFcmTokenDead(status: number, error?: string): boolean {
  if (status === 404 || status === 410) return true;
  if (status === 400 && (error?.includes("INVALID_ARGUMENT") || error?.includes("registration-token-not-registered"))) return true;
  if (error?.includes("UNREGISTERED") || error?.includes("NOT_FOUND")) return true;
  return false;
}
