import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import TopBar from '../components/TopBar';
import { http } from '../lib/http';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

type PeriodRow = { period_id: number; name: string; points: number };
type Breakdown = {
  games: Array<{
    game_id: number;
    datetime_utc: string;
    kills: number; assists: number; deaths: number; cs: number; player_win: boolean;
    points_kills: number; points_assists: number; points_deaths: number; points_cs10: number; points_win: number; points_total: number;
  }>;
  breakdown: {
    kills: { count: number; points: number };
    assists: { count: number; points: number };
    deaths: { count: number; points: number };
    cs10: { count: number; points: number };
    wins: { count: number; points: number };
  };
  weights: { kill: number; assist: number; death: number; cs10: number; win: number };
};

function Sparkline({ data, width = 160, height = 36, stroke = '#4c7cff' }: { data: number[]; width?: number; height?: number; stroke?: string }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} points={points} />
    </svg>
  );
}

export default function PlayerPage() {
  const { playerId } = useParams();
  const nav = useNavigate();
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const leagueId = payload?.leagueId as number | undefined;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ id: number; name?: string | null; country?: string | null; photo_url?: string | null } | null>(null);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [cache, setCache] = useState<Record<number, Breakdown>>({});

  useEffect(() => {
    const run = async () => {
      if (!playerId || !leagueId) return;
      setLoading(true);
      try {
        const [{ data: summary }, { data: per } ] = await Promise.all([
          http.get(`/fantasy/scoring/players/${playerId}/summary`, { params: { leagueId } }),
          http.get(`/fantasy/scoring/players/${playerId}/periods`, { params: { leagueId } }),
        ]);
        setPlayer(summary?.player || { id: Number(playerId) });
        setCurrentValue(Number(summary?.currentValue || 0));
        setTotalPoints(Number(summary?.totalPoints || 0));
        setPeriods(per || []);
        if ((per || []).length > 0) {
          setSelectedPeriodId(per[per.length - 1].period_id);
        }
        setErr(null);
      } catch (e: any) {
        setErr(e?.response?.data?.message || 'No se pudieron cargar los datos del jugador');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [playerId, leagueId]);

  useEffect(() => {
    const loadBreakdown = async () => {
      if (!playerId || !leagueId || !selectedPeriodId) { setBreakdown(null); return; }
      if (cache[selectedPeriodId]) { setBreakdown(cache[selectedPeriodId]); return; }
      try {
        const { data } = await http.get(`/fantasy/scoring/players/${playerId}/periods/${selectedPeriodId}/breakdown`, { params: { leagueId } });
        setBreakdown(data);
        setCache(prev => ({ ...prev, [selectedPeriodId]: data }));
      } catch (e: any) {
        setBreakdown(null);
      }
    };
    loadBreakdown();
  }, [playerId, leagueId, selectedPeriodId]);

  const fmtMoney = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  return (
    <div style={{ padding: '72px 16px 64px', display: 'grid', gap: 12 }}>
      <TopBar />
      <button onClick={() => nav(-1)} style={{ width: 'fit-content' }}>← Volver</button>
      <h2 style={{ margin: 0 }}>Jugador</h2>
      {loading && <div>Cargando…</div>}
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      {player && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {player.photo_url && <img src={player.photo_url} alt={player.name || ''} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{player.name || `#${player.id}`}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{player.country || ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#666' }}>Valor actual</div>
            <div style={{ fontWeight: 700 }}>{fmtMoney(currentValue)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Puntos totales</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{totalPoints.toFixed(0)}</div>
        </div>
        <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Jornadas jugadas</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{periods.filter(p => p.points > 0).length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Puntos por jornada</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ padding: 8, border: '1px dashed #e3e8ff', borderRadius: 8 }}>
            <Sparkline data={periods.map(p => p.points)} />
          </div>
          {periods.map(p => (
            <button
              key={p.period_id}
              onClick={() => setSelectedPeriodId(p.period_id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 8, border: '1px solid #eee',
                background: selectedPeriodId === p.period_id ? '#f3f6ff' : 'white'
              }}
            >
              <span>{p.name}</span>
              <b>{p.points.toFixed(0)}</b>
            </button>
          ))}
          {periods.length === 0 && <div style={{ color: '#777' }}>Sin jornadas</div>}
        </div>
      </div>

      {selectedPeriodId && breakdown && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Desglose de la jornada</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {([
              ['Asesinatos', 'kills' as const, breakdown.breakdown.kills],
              ['Asistencias', 'assists' as const, breakdown.breakdown.assists],
              ['Muertes', 'deaths' as const, breakdown.breakdown.deaths],
              ['Oleadas (x10)', 'cs10' as const, breakdown.breakdown.cs10],
              ['Victorias', 'wins' as const, breakdown.breakdown.wins],
            ] as const).map(([label, key, val]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{label} · {val.count}</span>
                <b>{val.points.toFixed(1)} pts</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#777' }}>
            Pesos: K {breakdown.weights.kill}, A {breakdown.weights.assist}, D {breakdown.weights.death}, CS/10 {breakdown.weights.cs10}, Win {breakdown.weights.win}
          </div>
          <div style={{ fontWeight: 600, marginTop: 8 }}>Partidos de la jornada</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {breakdown.games.map(g => (
              <div key={g.game_id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(g.datetime_utc).toLocaleString('es-ES')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>K {g.kills} · A {g.assists} · D {g.deaths} · CS {g.cs} · {g.player_win ? 'Win' : 'Lose'}</span>
                  <b>{g.points_total.toFixed(1)} pts</b>
                </div>
              </div>
            ))}
            {breakdown.games.length === 0 && <div style={{ color: '#777' }}>Sin partidos en esta jornada</div>}
          </div>
        </div>
      )}

      <div style={{ height: 56 }} />
      <BottomNav />
    </div>
  );
}
