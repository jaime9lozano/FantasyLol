import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { http } from '../lib/http';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

export default function HomePage() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<any | null>(null);
  const [compact, setCompact] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const leagueId = payload?.leagueId; const teamId = payload?.teamId;

  useEffect(() => {
    if (!leagueId || !teamId) return;
    setError(null);
    http.get(`/fantasy/leagues/${leagueId}/summary`).then(({ data }) => setSummary(data)).catch((e) => setError(e?.response?.data?.message || 'Error summary'));
    http.get(`/fantasy/teams/${teamId}/roster/compact`).then(({ data }) => setCompact(data)).catch((e) => setError(e?.response?.data?.message || 'Error roster'));
  }, [leagueId, teamId]);

  if (!leagueId || !teamId) return <div style={{ padding: 16 }}>No hay contexto de liga. Vuelve al selector.</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Home Liga {leagueId}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ opacity: 0.8 }}>Hola, {user?.displayName || 'manager'}</span>
          <button onClick={() => { logout(); nav('/login', { replace: true }); }}>Salir</button>
        </div>
      </div>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      <section>
        <h3>Ranking Top</h3>
        <pre style={{ background: '#f5f5f5', padding: 8 }}>{JSON.stringify(summary?.ranking ?? [], null, 2)}</pre>
      </section>
      <section>
        <h3>Tu equipo #{teamId}</h3>
        <pre style={{ background: '#f5f5f5', padding: 8 }}>{JSON.stringify(compact ?? {}, null, 2)}</pre>
      </section>
    </div>
  );
}
