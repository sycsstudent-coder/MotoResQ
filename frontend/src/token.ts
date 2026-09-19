import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "motoresq_token";
let webToken: string | null = null;

export async function saveToken(t: string) {
  if (Platform.OS === "web") {
    webToken = t;
    try { localStorage.setItem(KEY, t); } catch {}
  } else {
    await SecureStore.setItemAsync(KEY, t);
  }
}

export async function readToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (webToken) return webToken;
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    webToken = null;
    try { localStorage.removeItem(KEY); } catch {}
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}
