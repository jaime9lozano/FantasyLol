import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('jaime@correo.com');
  const [password, setPassword] = useState('Contraseña312');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      nav('/select-league', { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error de login');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
        <button type="submit">Entrar</button>
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </form>
      <div style={{ marginTop: 12 }}>
        ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
      </div>
    </div>
  );
}
