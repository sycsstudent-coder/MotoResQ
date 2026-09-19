import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, User } from "./api";
import { clearToken, readToken, saveToken } from "./token";

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await readToken();
    if (!t) { setUser(null); setToken(null); return; }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      setToken(t);
    } catch {
      await clearToken();
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST", auth: false,
      body: JSON.stringify({ email, password }),
    });
    await saveToken(r.access_token);
    setToken(r.access_token);
    setUser(r.user);
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/signup", {
      method: "POST", auth: false,
      body: JSON.stringify({ email, password, name }),
    });
    await saveToken(r.access_token);
    setToken(r.access_token);
    setUser(r.user);
  };

  const signOut = async () => {
    await clearToken();
    setUser(null);
    setToken(null);
  };

  return <Ctx.Provider value={{ user, token, loading, signIn, signUp, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
