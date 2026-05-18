// Tolerant extractor for AI-generated insight payloads.
// Handles: code fences, surrounding prose, AND malformed JSON with
// unescaped double-quotes inside string values (a common model failure).

export type InsightShape = { title: string; body: string; suggested_action: string };

function stripFences(s: string): string {
  return s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

function strictParse(s: string): InsightShape | null {
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== "object") return null;
    const title = typeof obj.title === "string" ? obj.title : "";
    let body = "";
    if (Array.isArray(obj.body)) body = obj.body.filter((x: unknown) => typeof x === "string").map((x: string) => bullet(x)).join("\n");
    else if (typeof obj.body === "string") body = obj.body;
    const sa = typeof obj.suggested_action === "string" ? obj.suggested_action : "";
    if (!title && !body) return null;
    return { title: title.slice(0, 120), body, suggested_action: sa.slice(0, 300) };
  } catch { return null; }
}

function bullet(line: string): string {
  const t = line.trim();
  if (!t) return t;
  return /^[-•]/.test(t) ? t.replace(/^-\s*/, "• ") : `• ${t}`;
}

// Last-resort regex extractor for malformed JSON-ish payloads.
function lenientExtract(raw: string): InsightShape | null {
  const titleMatch = raw.match(/"title"\s*:\s*"([^"\n]+?)"/);
  const saMatch = raw.match(/"suggested_action"\s*:\s*"([\s\S]+?)"\s*[}\n]/);

  let bodyText = "";
  // Find body array region
  const bodyStart = raw.search(/"body"\s*:\s*\[/);
  if (bodyStart !== -1) {
    const afterBracket = raw.indexOf("[", bodyStart) + 1;
    // find matching closing ] (greedy until next "suggested_action" or end)
    const tail = raw.slice(afterBracket);
    const stopIdx = tail.search(/\]\s*,\s*"suggested_action"|\]\s*\}/);
    const inside = stopIdx === -1 ? tail : tail.slice(0, stopIdx);
    // Split on `",` boundaries between items (handles unescaped inner quotes)
    const items = inside
      .split(/"\s*,\s*"/)
      .map((s, i, arr) => {
        let t = s.trim();
        if (i === 0) t = t.replace(/^\s*"/, "");
        if (i === arr.length - 1) t = t.replace(/"\s*$/, "");
        return t.trim();
      })
      .filter(Boolean);
    bodyText = items.map(bullet).join("\n");
  } else {
    // body might be a plain string
    const bm = raw.match(/"body"\s*:\s*"([\s\S]+?)"\s*,\s*"suggested_action"/);
    if (bm) bodyText = bm[1];
  }

  const title = titleMatch?.[1]?.trim() ?? "";
  const sa = saMatch?.[1]?.trim() ?? "";
  if (!title && !bodyText && !sa) return null;
  return { title: title.slice(0, 120), body: bodyText, suggested_action: sa.slice(0, 300) };
}

export function parseInsightPayload(raw: string): InsightShape | null {
  if (!raw || typeof raw !== "string") return null;
  let s = stripFences(raw.trim());
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  return strictParse(s) ?? lenientExtract(s);
}

// For already-stored rows: given the raw `body` column, recover structured fields.
export function normalizeStoredInsight(storedTitle: string, storedBody: string, storedAction: string | null): InsightShape {
  const looksRaw = /^\s*(```|\{)/.test(storedBody);
  if (looksRaw) {
    const p = parseInsightPayload(storedBody);
    if (p) {
      return {
        title: storedTitle && storedTitle !== "Insight" ? storedTitle : (p.title || storedTitle || "Insight"),
        body: p.body || storedBody,
        suggested_action: storedAction || p.suggested_action || "",
      };
    }
  }
  return {
    title: storedTitle || "Insight",
    body: storedBody,
    suggested_action: storedAction || "",
  };
}
