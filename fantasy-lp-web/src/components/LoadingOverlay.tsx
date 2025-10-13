import { ReactNode } from 'react';

export function LoadingOverlay({ title = 'Procesando…', message, progress }: { title?: string; message?: ReactNode; progress?: number | { total?: number; done?: number } }) {
  let pct: number | null = null;
  if (typeof progress === 'number') pct = Math.max(0, Math.min(100, progress));
  if (typeof progress === 'object' && progress) {
    const total = progress.total ?? 0;
    const done = progress.done ?? 0;
    pct = total > 0 ? Math.round((done / total) * 100) : null;
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 12, padding: 16, minWidth: 280, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
        {message && <div style={{ marginBottom: 12, color: '#444' }}>{message}</div>}
        {pct !== null && (
          <div style={{ width: '100%', height: 10, background: '#eee', borderRadius: 6 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#4a8df6', borderRadius: 6, transition: 'width 200ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
