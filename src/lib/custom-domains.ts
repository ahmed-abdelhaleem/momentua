import { useEffect, useState } from "react";
import { DOMAIN_META, type Domain } from "@/lib/points-catalog";

export interface CustomDomain {
  key: string;       // unique key, e.g. "cd_creative_1700"
  label: string;     // user-facing name
  emoji: string;     // single emoji / symbol
}

const CUSTOM_DOMAINS_KEY = "momentum:custom-domains";

// Built-in domain keys exposed in the picker. "consistency" is internal-only.
export const BUILTIN_DOMAIN_KEYS: Domain[] = ["physical", "mental", "social", "self_regulation"];

export type DomainMeta = { label: string; tokenClass: string; emoji: string };

export function loadCustomDomains(): CustomDomain[] {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(CUSTOM_DOMAINS_KEY) || "[]") as CustomDomain[]) ?? []; }
  catch { return []; }
}
export function saveCustomDomains(list: CustomDomain[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_DOMAINS_KEY, JSON.stringify(list));
}

/** React hook: returns [customDomains, setCustomDomains] persisted to localStorage. */
export function useCustomDomains(): [CustomDomain[], (next: CustomDomain[]) => void] {
  const [list, setList] = useState<CustomDomain[]>([]);
  useEffect(() => { setList(loadCustomDomains()); }, []);
  const update = (next: CustomDomain[]) => { setList(next); saveCustomDomains(next); };
  return [list, update];
}

/** Resolve display meta for ANY domain key (built-in or custom). Falls back gracefully. */
export function getDomainMeta(key: string, custom: CustomDomain[] = []): DomainMeta {
  if ((DOMAIN_META as Record<string, DomainMeta>)[key]) return (DOMAIN_META as Record<string, DomainMeta>)[key];
  const c = custom.find((d) => d.key === key);
  if (c) return { label: c.label, emoji: c.emoji, tokenClass: "text-foreground" };
  return { label: key, emoji: "•", tokenClass: "text-muted-foreground" };
}

/** Returns the picker list = built-in domains + custom domains. */
export function getAllDomainKeys(custom: CustomDomain[]): string[] {
  return [...BUILTIN_DOMAIN_KEYS, ...custom.map((c) => c.key)];
}
