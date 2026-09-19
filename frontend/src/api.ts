import { Platform } from "react-native";
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

/** Multipart upload that works on both native (uri object) and web (Blob). */
export async function uploadFile<T = any>(
  path: string,
  file: { uri: string; name: string; type: string },
): Promise<T> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", new File([blob], file.name, { type: blob.type || file.type }));
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
  }
  const t = await readToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : undefined,
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || `Upload failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

/** Authenticated file URL (token in query so <Image> works on web too). */
export function fileUrl(path: string, token: string): string {
  return `${BASE}/api/files/${path}?token=${encodeURIComponent(token)}`;
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
  bike_photo?: string | null;
}
export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  kind: "tow" | "roadside" | "personal";
}
export interface Reminder {
  id: string;
  label: string;
  interval_km: number;
  icon: string;
  log_type: string;
  status: "overdue" | "due_soon" | "ok" | "unknown";
  last_odometer: number | null;
  last_date: string | null;
  due_at_km: number | null;
  remaining_km: number | null;
  progress: number;
  message: string;
}
export interface RemindersResponse {
  odometer: number;
  has_motorcycle: boolean;
  summary: { overdue: number; due_soon: number; tracked: number };
  items: Reminder[];
}
