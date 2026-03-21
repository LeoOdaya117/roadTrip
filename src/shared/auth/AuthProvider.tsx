import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  socialLogin: (provider: 'google' | 'facebook') => Promise<boolean>;
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

  const login = async (email: string, password: string) => {
    // Check local test account and any registered local accounts first
    if (email === LOCAL_TEST_CREDENTIALS.email && password === LOCAL_TEST_CREDENTIALS.password) {
      setToken(LOCAL_TEST_CREDENTIALS.token);
      setUser(LOCAL_TEST_CREDENTIALS.user as User);
      return true;
    }

    const accounts = readLocalAccounts();
    const match = accounts.find(a => a.email === email && a.password === password);
    if (match) {
      setToken(match.token);
      setUser(match.user);
      return true;
    }

    // Otherwise attempt real API call
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (data?.token) {
        setToken(data.token);
        setUser(data.user || { id: data.id || 'unknown', email } as User);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login error', e);
      return false;
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    const accounts = readLocalAccounts();
    if (accounts.find(a => a.email === email)) return false; // already exists
    const token = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const user = { id: `local-${Date.now()}`, email, name: name || email.split('@')[0] } as User;
    accounts.push({ email, password, token, user });
    writeLocalAccounts(accounts);
    setToken(token);
    setUser(user);
    return true;
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
