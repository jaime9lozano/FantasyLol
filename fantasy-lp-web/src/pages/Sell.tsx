import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { http } from '../lib/http';
import BottomNav from '../components/BottomNav';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

export default function SellPage() {
  const { user } = useAuth();
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const teamId = payload?.teamId; const leagueId = payload?.leagueId;
  const [roster, setRoster] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    http.get(`/fantasy/teams/${teamId}/roster/compact`).then(({ data }) => setRoster(data)).catch((e) => setError(e?.response?.data?.message || 'Error roster'));
  }, [teamId]);

  const sell = async (playerId: number) => {
    if (!leagueId || !teamId) return;
    if (!window.confirm('¿Seguro que quieres vender este jugador a la liga?')) return;
    try {
      await http.post('/fantasy/market/sell-to-league', { fantasyLeagueId: leagueId, teamId, playerId });
      const { data } = await http.get(`/fantasy/teams/${teamId}/roster/compact`);
      setRoster(data);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error al vender');
    }
  };

  return (
    <div style={{ padding: '16px 16px 64px', display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>Vender a la liga</h2>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {roster.filter(s => s.active).map((s: any) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{s.player?.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{s.slot} · {s.starter ? 'Titular' : 'Banquillo'}</div>
          </div>
          <button onClick={() => sell(Number(s.player?.id))}>Vender</button>
        </div>
      ))}
      {roster.length === 0 && <div>No hay jugadores.</div>}
      <div style={{ height: 56 }} />
      <BottomNav />
    </div>
  );
}
