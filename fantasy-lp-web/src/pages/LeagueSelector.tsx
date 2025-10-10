import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/http';
import { useAuth } from '../auth/AuthContext';

export default function LeagueSelectorPage() {
  const nav = useNavigate();
  const { access, selectLeague } = useAuth();
  const [items, setItems] = useState<Array<{ leagueId: number; leagueName: string; teamId: number; teamName: string; sourceLeagueCode: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('Mi Equipo');
  const [newLeagueName, setNewLeagueName] = useState('Mi Fantasy League');
  const [newLeagueBase, setNewLeagueBase] = useState<'LCK' | 'LEC' | 'LPL'>('LCK');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!access) { nav('/login', { replace: true }); return; }
      try {
        const { data } = await http.get('/auth/memberships');
        if (cancelled) return;
        setItems(data);
        // Auto-selección si sólo hay una
        if (Array.isArray(data) && data.length === 1) {
          await selectLeague(data[0].leagueId);
          if (!cancelled) nav('/home', { replace: true });
        }
      } catch (e: any) {
        const msg = e?.response?.data?.message || 'Error';
        if (e?.response?.status === 401) { nav('/login', { replace: true }); return; }
        if (!cancelled) setError(msg);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [nav, access, selectLeague]);

  async function pick(leagueId: number) {
    setError(null);
    try {
      await selectLeague(leagueId);
      nav('/home', { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al seleccionar liga');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Elige tu liga</h1>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!access ? <i>Redirigiendo…</i> : items.length === 0 ? (
        <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
          <i>No tienes ligas todavía</i>
          <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <h3>Unirme con código de invitación</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await http.post('/fantasy/leagues/join', { inviteCode, teamName });
                // tras unirse, refrescar memberships
                const { data } = await http.get('/auth/memberships');
                setItems(data);
              } catch (e: any) {
                setError(e?.response?.data?.message || 'Error al unirse a la liga');
              }
            }} style={{ display: 'grid', gap: 8 }}>
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="Código de invitación" required />
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nombre de tu equipo" required />
              <button type="submit">Unirme</button>
            </form>
          </div>
          <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <h3>Crear nueva liga</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setCreating(true);
              try {
                // Crear liga (pública en el backend ahora mismo)
                const mapCode = (base: 'LCK'|'LEC'|'LPL') => base === 'LEC' ? 'LEC' : (base === 'LCK' ? 'LCK21' : 'LPL2020');
                const sourceLeagueCode = mapCode(newLeagueBase);
                const { data: league } = await http.post('/fantasy/leagues', { name: newLeagueName, sourceLeagueCode });
                // Unirse a la liga como manager actual (el backend toma el userId del token)
                await http.post('/fantasy/leagues/join', { inviteCode: league.inviteCode, teamName });
                const { data } = await http.get('/auth/memberships');
                setItems(data);
              } catch (e: any) {
                setError(e?.response?.data?.message || 'Error al crear/unirse a liga');
              } finally {
                setCreating(false);
              }
            }} style={{ display: 'grid', gap: 8 }}>
              <input value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} placeholder="Nombre de la liga" required />
              <label>Base de liga:</label>
              <select value={newLeagueBase} onChange={e => setNewLeagueBase(e.target.value as any)}>
                <option value="LCK">LCK</option>
                <option value="LEC">LEC</option>
                <option value="LPL">LPL</option>
              </select>
              {/* Ya no pedimos código libre; mapeamos base→code automáticamente */}
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nombre de tu equipo" required />
              <button type="submit" disabled={creating}>{creating ? 'Creando…' : 'Crear y unirme'}</button>
            </form>
          </div>
        </div>
      ) : (
        <ul>
          {items.map(it => (
            <li key={it.teamId}>
              {it.leagueName} ({it.sourceLeagueCode || 'N/A'}) — {it.teamName}
              <button onClick={() => pick(it.leagueId)} style={{ marginLeft: 8 }}>Usar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
