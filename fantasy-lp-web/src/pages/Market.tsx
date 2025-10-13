import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiGetCurrentMarket, apiPlaceBid } from '../api';
import BottomNav from '../components/BottomNav';
import TopBar from '../components/TopBar';

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try { const [, p] = token.split('.'); return JSON.parse(atob(p)); } catch { return null; }
}

export default function MarketPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const access = localStorage.getItem('access');
  const payload = useMemo(() => decodeJwt(access), [access]);
  const leagueId = payload?.leagueId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [placing, setPlacing] = useState<number | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    apiGetCurrentMarket(leagueId).then((d) => { setData(d); setLoading(false); }).catch((e) => { setError(e?.response?.data?.message || 'Error mercado'); setLoading(false); });
  }, [leagueId]);

  const onBid = async (orderId: number, minNext: number) => {
    const amountStr = window.prompt(`Cantidad a pujar:`, String("Valor"));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount < minNext) {
      alert('Importe inválido.');
      return;
    }
    try {
      setPlacing(orderId);
      await apiPlaceBid(orderId, amount);
      // refrescar mercado
      if (leagueId) {
        const d = await apiGetCurrentMarket(leagueId);
        setData(d);
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error al pujar');
    } finally {
      setPlacing(null);
    }
  };

  if (!leagueId) return <div style={{ padding: 16 }}>No hay liga seleccionada.</div>;
  if (loading) return <div style={{ padding: 16 }}>Cargando mercado…</div>;
  if (error) return <div style={{ padding: 16, color: 'crimson' }}>{error}</div>;

  const leagueName = user?.memberships?.find(m => m.leagueId === leagueId)?.leagueName ?? 'Mi liga';

  return (
    <div style={{ padding: '72px 16px 64px', display: 'grid', gap: 16 }}>
      <TopBar />
      <header>
        <h2 style={{ margin: 0 }}>Mercado — {leagueName}</h2>
        {data?.cycle && (
          <div style={{ fontSize: 12, color: '#555' }}>
            Cierra: {new Date(data.cycle.closesAt).toLocaleString()}
          </div>
        )}
      </header>

      <section style={{ display: 'grid', gap: 8 }}>
        {(data?.orders ?? []).map((o: any) => (
          <div key={o.order_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: 12, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                <span
                  role="link"
                  onClick={() => (window.history.pushState({}, '', `/player/${o.player_id}`), window.dispatchEvent(new PopStateEvent('popstate')))}
                  style={{ cursor: 'pointer', color: 'inherit', textDecoration: 'none' }}
                  title="Ver estadísticas"
                >
                  {o.player_name}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                Valor: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(o.valuation || 0))}
                {' · '}Pujas de usuarios: {o.bidders_count}
              </div>
            </div>
            <div>
              <button disabled={placing === o.order_id} onClick={() => onBid(o.order_id, Number(o.min_next_bid))}>
                {placing === o.order_id ? 'Pujando…' : `Pujar ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(o.valuation || 0))}`}
              </button>
            </div>
          </div>
        ))}
        {data?.orders?.length === 0 && <div>No hay órdenes activas. Espera a la siguiente rotación automática.</div>}
      </section>
      <div style={{ height: 56 }} />
      <BottomNav />
    </div>
  );
}
