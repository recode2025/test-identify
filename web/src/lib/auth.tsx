import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { closeSocket } from './socket';
import type { Me } from './types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => void;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.set(null);
    closeSocket();
    setUser(null);
    api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.set(null);
      closeSocket();
      setUser(null);
    });
    api<Me>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string; user: Me }>('/auth/login', { method: 'POST', json: { username, password } });
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const setToken = useCallback((token: string) => tokenStore.set(token), []);

  return <AuthContext.Provider value={{ user, loading, login, logout, setToken }}>{children}</AuthContext.Provider>;
}
