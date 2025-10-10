import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { http } from '../lib/http';
import { useAuth } from '../auth/AuthContext';

export default function RegisterPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [displayName, setDisplayName] = useState('Nuevo Manager');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await http.post('/auth/register', { displayName, email, password });
      // Auto-login tras registrar para continuar el flujo
      await login(email, password);
      nav('/select-league', { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Crear cuenta</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nombre a mostrar" required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
        <button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Registrarme'}</button>
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </form>
      <div style={{ marginTop: 12 }}>
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </div>
    </div>
  );
}
