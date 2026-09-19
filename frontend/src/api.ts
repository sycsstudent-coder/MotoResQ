import { readToken } from "./token";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function api<T = any>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.auth !== false) {
    const t = await readToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export async function apiRawAudioUrl(text: string, voice = "nova"): Promise<string> {
  // Returns a blob URL for web; native uses fetch directly.
  const t = await readToken();
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export interface Motorcycle {
  make: string;
  model: string;
  year: number;
  odometer: number;
  vin?: string | null;
  nickname?: string | null;
}
export interface User {
  id: string;
  email: string;
  name?: string | null;
  motorcycle?: Motorcycle | null;
}
