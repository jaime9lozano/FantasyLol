import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function BottomNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const active = useMemo(() => {
    if (loc.pathname.startsWith('/market')) return 'market';
    if (loc.pathname.startsWith('/team') || loc.pathname.startsWith('/sell')) return 'team';
    return 'home';
  }, [loc.pathname]);

  const Btn = ({ id, label, to }: { id: string; label: string; to: string }) => (
    <button
      onClick={() => nav(to)}
      style={{
        flex: 1,
        padding: '12px 8px',
        border: 'none',
        background: 'transparent',
        color: active === id ? '#111' : '#666',
        borderTop: active === id ? '2px solid #111' : '2px solid transparent',
      }}
    >{label}</button>
  );

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: '1px solid #eee', background: '#fafafa', display: 'flex' }}>
      <Btn id="home" label="Mi liga" to="/home" />
      <Btn id="market" label="Mercado" to="/market" />
      <Btn id="team" label="Mi equipo" to="/team" />
    </nav>
  );
}
