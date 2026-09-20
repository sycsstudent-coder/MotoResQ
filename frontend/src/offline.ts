import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api";

const PREFIX = "motoresq_cache:";

export interface Cached<T> { data: T; fromCache: boolean }

/** Network-first GET; falls back to the last saved copy when offline. */
export async function cachedGet<T = any>(path: string): Promise<Cached<T>> {
  const key = PREFIX + path;
  try {
    const data = await api<T>(path);
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    return { data, fromCache: false };
  } catch (e) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return { data: JSON.parse(raw) as T, fromCache: true };
    throw e;
  }
}

/** Download every guide and diagnostic tree once so they open with zero signal. */
export async function prefetchOfflineContent(): Promise<void> {
  try {
    const guides = await cachedGet<{ id: string }[]>("/guides");
    await Promise.all(guides.data.map((g) => cachedGet(`/guides/${g.id}`)));
    const cats = await cachedGet<{ id: string }[]>("/diagnostic/categories");
    await Promise.all(cats.data.map((c) => cachedGet(`/diagnostic/${c.id}`)));
    await AsyncStorage.setItem(PREFIX + "synced_at", new Date().toISOString());
  } catch {}
}

export async function offlineSyncedAt(): Promise<string | null> {
  return AsyncStorage.getItem(PREFIX + "synced_at");
}

interface Rule { if: Record<string, string>; cause: string; severity: string; guide_id: string | null }
export interface DiagResult { cause: string; severity: string; guide_id: string | null }

/** Same rule engine as the backend — used when /diagnostic/analyze is unreachable. */
export function analyzeLocally(rules: Rule[], answers: Record<string, string>): DiagResult[] {
  const matches = rules
    .filter((r) => Object.entries(r.if).every(([k, v]) => answers[k] === v))
    .map((r) => ({ cause: r.cause, severity: r.severity, guide_id: r.guide_id }));
  if (matches.length === 0) {
    matches.push({
      cause: "Symptoms don't match a common pattern. Try the AI Chat for personalized help, or consult a mechanic.",
      severity: "low",
      guide_id: null,
    });
  }
  return matches;
}
