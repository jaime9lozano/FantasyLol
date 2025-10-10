import * as React from 'react';
import { createContext, useContext } from 'react';
import { http, setTokens } from '../lib/http';

type User = { id: number; displayName: string; email: string; role: string; memberships?: any[] } | null;

type AuthState = {
  access: string | null;
  user: User;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  selectLeague: (leagueId: number) => Promise<void>;
};

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState<string | null>(localStorage.getItem('access'));
  const [user, setUser] = React.useState<User>(null);

  async function login(email: string, password: string) {
    const { data } = await http.post('/auth/login', { email, password });
    setTokens(data.access_token, data.refresh_token);
    setAccess(data.access_token);
    // Verificar el token inmediatamente; si falla, cerrar sesión y propagar el error
    try {
      const me = await http.get('/auth/me');
      setUser(me.data);
    } catch (e) {
      logout();
      throw e;
    }
  }

  function logout() {
    setTokens(null, null);
    setAccess(null);
    setUser(null);
  }

  async function refreshMe() {
    if (!access) return;
    try {
      const { data } = await http.get('/auth/me');
      setUser(data);
    } catch {
      // Si falla (token inválido), cerrar sesión "silenciosamente"
      logout();
    }
  }

  React.useEffect(() => { if (access) refreshMe().catch(() => {}); }, []);

  async function selectLeague(leagueId: number) {
    const { data } = await http.post('/auth/context/select', { leagueId });
    // Este endpoint devuelve un nuevo access con leagueId/teamId en el payload
    setTokens(data.access_token);
    setAccess(data.access_token);
  }

  const value = React.useMemo(() => ({ access, user, login, logout, refreshMe, selectLeague }), [access, user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
