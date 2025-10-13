import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { http } from '../lib/http';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

export default function TopBar() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const leagueId = payload?.leagueId as number | undefined;
  const [setup, setSetup] = useState<{ status: string; step?: string } | null>(null);

  const leagueName = useMemo(() => {
    const name = user?.memberships?.find((m) => m.leagueId === leagueId)?.leagueName;
    return name || 'Mi liga';
  }, [user, leagueId]);

  const managerName = user?.displayName || 'manager';

  useEffect(() => {
    let active = true;
    let t: any;
    const refreshedKey = leagueId ? `leagueSetupRefreshed_${leagueId}` : null;
    async function poll() {
      if (!leagueId) return;
      try {
        const { data } = await http.get(`/fantasy/leagues/${leagueId}/setup-status`);
        if (!active) return;
        setSetup({ status: data?.status, step: data?.step });
        // Si el setup no está done, asegurarnos de limpiar el flag para una futura recarga
        if (refreshedKey && data?.status !== 'done') {
          localStorage.removeItem(refreshedKey);
        }
        // Si acaba, recarga la página una única vez para refrescar valoraciones y rankings.
        if (data?.status === 'done') {
          // Evitar recarga infinita: usar un flag por liga en localStorage
          if (refreshedKey && !localStorage.getItem(refreshedKey)) {
            localStorage.setItem(refreshedKey, '1');
            setTimeout(() => {
              if (active) window.location.reload();
            }, 300);
          }
          return; // no reprogramar siguiente poll
        }
      } catch {}
      finally {
        if (active) t = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { active = false; if (t) clearTimeout(t); };
  }, [leagueId]);

  const stepLabel = useMemo(() => {
    const s = setup?.step;
    if (!s) return null;
    if (s === 'generating-periods') return 'Generando jornadas…';
    if (s === 'backfilling-player-points') return 'Calculando puntos históricos…';
    if (s === 'computing-periods') return 'Computando jornadas…';
    if (s === 'revaluating') return 'Calculando valoraciones…';
    return 'Preparando…';
  }, [setup]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #eee', background: '#fff', zIndex: 10 }}>
      <div>
        <div style={{ fontSize: 12, color: '#666' }}>Liga</div>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{leagueName}</span>
          {setup && setup.status !== 'done' && (
            <span style={{ fontSize: 12, color: '#888' }}>
              • {stepLabel}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ opacity: 0.85 }}>{managerName}</span>
        <button onClick={() => { logout(); nav('/login', { replace: true }); }}>Salir</button>
      </div>
    </div>
  );
}
