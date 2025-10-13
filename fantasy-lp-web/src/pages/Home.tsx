import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { http } from '../lib/http';
import BottomNav from '../components/BottomNav';

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
  const [viewTeam, setViewTeam] = useState<{ id: number; name: string } | null>(null);
  const [viewRoster, setViewRoster] = useState<any[] | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [buying, setBuying] = useState<number | null>(null);
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const leagueId = payload?.leagueId; const teamId = payload?.teamId;
  const leagueName = useMemo(() => user?.memberships?.find(m => m.leagueId === leagueId)?.leagueName ?? `Liga #${leagueId}`, [user, leagueId]);

  useEffect(() => {
    if (!leagueId || !teamId) return;
    setError(null);
    http.get(`/fantasy/leagues/${leagueId}/summary`).then(({ data }) => setSummary(data)).catch((e) => setError(e?.response?.data?.message || 'Error summary'));
    http.get(`/fantasy/teams/${teamId}/roster/compact`).then(({ data }) => setCompact(data)).catch((e) => setError(e?.response?.data?.message || 'Error roster'));
  }, [leagueId, teamId]);

  // cargar roster de otro equipo cuando se selecciona
  useEffect(() => {
    const load = async () => {
      if (!viewTeam) return;
      setViewError(null);
      setViewRoster(null);
      try {
        const { data } = await http.get(`/fantasy/teams/${viewTeam.id}/roster/compact`);
        setViewRoster(data);
      } catch (e: any) {
        setViewError(e?.response?.data?.message || 'Error cargando equipo');
      }
    };
    load();
  }, [viewTeam]);

  if (!leagueId || !teamId) return <div style={{ padding: 16 }}>No hay contexto de liga. Vuelve al selector.</div>;

  return (
    <div style={{ padding: '16px 16px 64px', display: 'grid', gap: 16 }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Mi liga</div>
          <h1 style={{ margin: 0 }}>{leagueName}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ opacity: 0.8 }}>Hola, {user?.displayName || 'manager'}</span>
          <button onClick={() => { logout(); nav('/login', { replace: true }); }}>Salir</button>
        </div>
      </header>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {/* Info rápida de tu equipo */}
      {summary?.yourTeam && (
        <section>
          <h3 style={{ marginBottom: 8 }}>Tu presupuesto</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{summary.yourTeam.name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Posición: {summary.yourTeam.position} · Puntos: {Math.round(summary.yourTeam.points)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>Disponible: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(summary.yourTeam.budgetRemaining || 0))}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Reservado: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(summary.yourTeam.budgetReserved || 0))}</div>
            </div>
          </div>
        </section>
      )}

      {/* Ranking tarjetas */}
      <section>
        <h3 style={{ marginBottom: 8 }}>Clasificación</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(summary?.ranking ?? []).map((row: any, idx: number) => (
            <div
              key={row.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eee', borderRadius: 10, cursor: 'pointer' }}
              onClick={() => {
                const id = Number(row.id);
                if (id === teamId) {
                  return nav('/team');
                }
                setViewTeam({ id, name: row.name });
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 14, background: '#222', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{row.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{row.display_name}</div>
              </div>
              <div style={{ fontWeight: 600 }}>{Math.round(row.points)} pts</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tu equipo compacto */}
      <section>
        <h3 style={{ marginBottom: 8 }}>Tu equipo</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(compact ?? []).map((s: any) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
              <div style={{ width: 54, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#666' }}>{s.slot}</div>
                {s.starter ? <span style={{ fontSize: 10, color: '#0a7' }}>Titular</span> : <span style={{ fontSize: 10, color: '#777' }}>Banquillo</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.player?.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{s.lockedUntil ? 'Bloqueado' : 'Disponible'}</div>
              </div>
              <div style={{ fontWeight: 600 }}>{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(s.value || 0))}</div>
            </div>
          ))}
        </div>
      </section>
      <div style={{ height: 56 }} />
      {/* Modal roster de otro equipo */}
      {viewTeam && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setViewTeam(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(640px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{viewTeam.name}</h3>
              <button onClick={() => setViewTeam(null)}>Cerrar</button>
            </div>
            {viewError && <div style={{ color: 'crimson' }}>{viewError}</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {(viewRoster ?? []).map((s: any) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
                  <div style={{ width: 54, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#666' }}>{s.slot}</div>
                    {s.starter ? <span style={{ fontSize: 10, color: '#0a7' }}>Titular</span> : <span style={{ fontSize: 10, color: '#777' }}>Banquillo</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{s.player?.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>Rol: {s.player?.role || 'FLEX'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>Cláusula: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(s.clause || 0))}</div>
                    <button disabled={buying === s.player?.id} onClick={async () => {
                      if (!leagueId) return;
                      const ok = window.confirm('Pagar cláusula de ' + (s.player?.name || '') + '?');
                      if (!ok) return;
                      try {
                        setBuying(Number(s.player?.id));
                        await http.post('/fantasy/valuation/pay-clause', { fantasyLeagueId: leagueId, playerId: Number(s.player?.id), toTeamId: teamId });
                        alert('Cláusula pagada');
                        setViewTeam(null);
                        // refrescar tu home
                        const [sum, comp] = await Promise.all([
                          http.get(`/fantasy/leagues/${leagueId}/summary`),
                          http.get(`/fantasy/teams/${teamId}/roster/compact`),
                        ]);
                        setSummary(sum.data);
                        setCompact(comp.data);
                      } catch (e: any) {
                        alert(e?.response?.data?.message || 'No se pudo pagar la cláusula');
                      } finally {
                        setBuying(null);
                      }
                    }}>Pagar cláusula</button>
                  </div>
                </div>
              ))}
              {(viewRoster?.length ?? 0) === 0 && <div>Sin jugadores.</div>}
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
