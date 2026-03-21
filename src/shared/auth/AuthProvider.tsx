import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types';
import userApi from '../../api/userApi';

interface AuthResult {
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name?: string) => Promise<AuthResult>;
  socialLogin: (provider: 'google' | 'facebook') => Promise<boolean>;
  // New: methods now return structured result with optional message
  // (backwards-compatible callers should check the `success` field)
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_TOKEN_KEY = 'auth.token';
const LOCAL_USER_KEY = 'auth.user';
const LOCAL_ACCOUNTS_KEY = 'auth.localAccounts';

// Simple local test credentials
const LOCAL_TEST_CREDENTIALS = {
  email: 'test@local',
  password: 'pass123',
  token: 'local-test-token',
  user: { id: 'local-1', email: 'test@local', name: 'Local Tester' },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (token) localStorage.setItem(LOCAL_TOKEN_KEY, token); else localStorage.removeItem(LOCAL_TOKEN_KEY);
    } catch {}
  }, [token]);

  useEffect(() => {
    try {
      if (user) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user)); else localStorage.removeItem(LOCAL_USER_KEY);
    } catch {}
  }, [user]);

  const readLocalAccounts = (): Array<{ email: string; password: string; token: string; user: User }> => {
    try {
      const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const writeLocalAccounts = (accounts: Array<{ email: string; password: string; token: string; user: User }>) => {
    try {
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {}
  };

  const extractMessage = (maybeBody: any) => {
    // Walk common shapes: { response: { data: { message: { field: ["msg"] } } } }
    try {
      const msgObj = maybeBody?.response?.data?.message || maybeBody?.message || maybeBody?.response?.data || maybeBody?.response || maybeBody;
      if (!msgObj) return undefined;
      if (typeof msgObj === 'string') return msgObj;
      if (typeof msgObj === 'object') {
        // flatten arrays / strings
        const parts: string[] = [];
        const collect = (v: any) => {
          if (!v && v !== 0) return;
          if (Array.isArray(v)) v.forEach(collect);
          else if (typeof v === 'object') Object.values(v).forEach(collect);
          else parts.push(String(v));
        };
        collect(msgObj);
        return parts.join('; ');
      }
      return String(msgObj);
    } catch {
      return undefined;
    }
  };

  const extractErrors = (maybeBody: any): Record<string, string[]> | undefined => {
    try {
      const msgObj = maybeBody?.response?.data?.message || maybeBody?.message || maybeBody?.response?.data || maybeBody?.response || maybeBody;
      if (!msgObj) return undefined;
      if (typeof msgObj === 'object') {
        const result: Record<string, string[]> = {};
        const candidate = msgObj;
        if (candidate && typeof candidate === 'object') {
          Object.entries(candidate).forEach(([k, v]) => {
            if (Array.isArray(v)) result[k] = v.map(String);
            else if (typeof v === 'string') result[k] = [v];
            else result[k] = [String(v)];
          });
          return result;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    // Check local test account and any registered local accounts first
    if (email === LOCAL_TEST_CREDENTIALS.email && password === LOCAL_TEST_CREDENTIALS.password) {
      setToken(LOCAL_TEST_CREDENTIALS.token);
      setUser(LOCAL_TEST_CREDENTIALS.user as User);
      return { success: true };
    }

    const accounts = readLocalAccounts();
    const match = accounts.find(a => a.email === email && a.password === password);
    if (match) {
      setToken(match.token);
      setUser(match.user);
      return { success: true };
    }
    // Attempt server login
    try {
      // backend expects `username` in the payload
      const resp = await userApi.login({ username: email, password });
      const body = resp?.data;
      if (body) {
        // If backend reports success: true and no payload error
        if (body.success === true) {
          const payload = body.response?.data || body.response || body;
          const serverHasError = payload?.error === true;
          const serverMessage = extractMessage(body);
          const serverErrors = extractErrors(body);
          if (!serverHasError) {
            const serverToken = payload?.token || payload?.accessToken || payload?.access_token;
            const serverUser = payload?.user || payload;
            if (serverToken) {
              setToken(serverToken);
              try { localStorage.setItem('token', serverToken); } catch {}
              try { localStorage.setItem(LOCAL_TOKEN_KEY, serverToken); } catch {}
              setUser(serverUser as User);
              return { success: true };
            }
            // success but no token — treat as failure but surface message/errors
            return { success: false, message: serverMessage || 'Authentication failed', errors: serverErrors };
          }
          return { success: false, message: serverMessage || 'Authentication failed', errors: serverErrors };
        }
        // not success===true -> try to extract message/errors
        return { success: false, message: extractMessage(body) || 'Authentication failed', errors: extractErrors(body) };
      }
    } catch (err: any) {
      console.error('[Auth] remote login error', err);
      const maybe = err?.response?.data || err?.response || err;
      return { success: false, message: extractMessage(maybe) || String(err), errors: extractErrors(maybe) };
    }

    return { success: false, message: 'Authentication failed' };
  };

  const register = async (email: string, password: string, name?: string): Promise<{ success: boolean; message?: string }> => {
    const accounts = readLocalAccounts();
    if (accounts.find(a => a.email === email)) return { success: false, message: 'Account already exists' }; // already exists
    // Attempt server-side createUser if available
    try {
      // backend expects `username` rather than `email` for registration
      const resp = await (userApi.createUser ? userApi.createUser({ username: email, email, password, name }) : Promise.resolve(null));
      // if API returned, attempt to use its shape
      if (resp) {
        // resp may be the created user or wrapped response
        const msg = extractMessage(resp);
        // if resp contains token, set it
        const tokenFromResp = resp?.token || resp?.accessToken || resp?.access_token || resp?.response?.data?.token;
        const userFromResp = resp?.user || resp?.response?.data || resp;
        if (tokenFromResp) {
          setToken(tokenFromResp);
          try { localStorage.setItem('token', tokenFromResp); } catch {}
          try { localStorage.setItem(LOCAL_TOKEN_KEY, tokenFromResp); } catch {}
          setUser(userFromResp as User);
          return { success: true };
        }
        // API responded but didn't provide token — surface message or success
        return { success: true, message: msg };
      }
    } catch (err: any) {
      console.error('[Auth] register error', err);
      const maybe = err?.response?.data || err?.response || err;
      return { success: false, message: extractMessage(maybe) || String(err), errors: extractErrors(maybe) };
    }

    // fallback to local account creation
    const token = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const user = { id: `local-${Date.now()}`, email, name: name || email.split('@')[0] } as User;
    accounts.push({ email, password, token, user });
    writeLocalAccounts(accounts);
    setToken(token);
    setUser(user);
    return { success: true };
  };

  const socialLogin = async (provider: 'google' | 'facebook') => {
    // Create or reuse a local account representing the social identity.
    const email = `${provider}@social.local`;
    const accounts = readLocalAccounts();
    let acc = accounts.find(a => a.email === email);
    if (!acc) {
      const token = `social-${provider}-${Date.now()}`;
      const user = { id: `social-${provider}-${Date.now()}`, email, name: `${provider} user` } as User;
      acc = { email, password: '', token, user };
      accounts.push(acc);
      writeLocalAccounts(accounts);
    }
    setToken(acc.token);
    setUser(acc.user);
    return true;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!token,
    login,
    register,
    socialLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
