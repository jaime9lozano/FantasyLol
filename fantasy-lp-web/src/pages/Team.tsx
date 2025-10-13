import { useEffect, useMemo, useState } from 'react';
import BottomNav from '../components/BottomNav';
import { http } from '../lib/http';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

type RosterItem = {
  id: number;
  slot: 'TOP'|'JNG'|'MID'|'ADC'|'SUP'|'BENCH';
  starter: boolean;
  lockedUntil?: string | null;
  player: { id: number; name: string; role?: string | null };
  value: number;
};

export default function TeamPage() {
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const teamId = payload?.teamId; const leagueId = payload?.leagueId;
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = async () => {
    if (!teamId) return;
    try {
      const { data } = await http.get(`/fantasy/teams/${teamId}/roster/compact`);
      setRoster(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error cargando equipo');
    }
  };

  useEffect(() => { load(); }, [teamId]);

  const sell = async (playerId: number) => {
    if (!leagueId || !teamId) return;
    try {
      const { data: info } = await http.get(`/fantasy/teams/${teamId}/player/${playerId}/stats`, { params: { leagueId } });
      const price = Number(info?.currentValue || 0);
      const ok = window.confirm(`Vas a vender por ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price)}. ¿Confirmas?`);
      if (!ok) return;
    } catch {}
    try {
      await http.post('/fantasy/market/sell-to-league', { fantasyLeagueId: leagueId, teamId, playerId });
      await load();
      alert('Venta realizada');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error al vender');
    }
  };

  const move = async (item: RosterItem, newSlot: RosterItem['slot'], newStarter: boolean) => {
    if (!teamId) return;
    try {
      setSaving(item.id);
      await http.post(`/fantasy/teams/${teamId}/lineup`, { rosterSlotId: item.id, slot: newSlot, starter: newStarter });
      await load();
      alert('Alineación actualizada');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'No se pudo actualizar la alineación');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ padding: '16px 16px 64px', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Mi equipo</h2>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {roster.map((s) => (
        <div key={s.id} style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 54, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666' }}>{s.slot}</div>
              {s.starter ? <span style={{ fontSize: 10, color: '#0a7' }}>Titular</span> : <span style={{ fontSize: 10, color: '#777' }}>Banquillo</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{s.player?.name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Rol: {s.player?.role || 'FLEX'}{s.lockedUntil ? ' · Bloqueado' : ''}</div>
            </div>
            <div style={{ fontWeight: 600 }}>{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(s.value || 0))}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Botones de alineación */}
            {['TOP','JNG','MID','ADC','SUP','BENCH'].map((slot) => (
              <button
                key={slot}
                disabled={saving === s.id || s.lockedUntil != null}
                onClick={() => move(s, slot as any, slot !== 'BENCH')}
                title={slot !== 'BENCH' ? 'Alinear como titular en ' + slot : 'Enviar al banquillo'}
              >{slot}</button>
            ))}
            <button disabled={saving === s.id} onClick={() => sell(s.player.id)}>Vender</button>
          </div>
        </div>
      ))}
      {roster.length === 0 && <div>No hay jugadores.</div>}
      <div style={{ height: 56 }} />
      <BottomNav />
    </div>
  );
}
