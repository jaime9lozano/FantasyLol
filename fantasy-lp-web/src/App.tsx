import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import LeagueSelectorPage from './pages/LeagueSelector';
import HomePage from './pages/Home';
import MarketPage from './pages/Market';
import TeamPage from './pages/Team';
import PlayerPage from './pages/Player';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { access } = useAuth();
  if (!access) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/select-league" element={<RequireAuth><LeagueSelectorPage /></RequireAuth>} />
          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/market" element={<RequireAuth><MarketPage /></RequireAuth>} />
          <Route path="/team" element={<RequireAuth><TeamPage /></RequireAuth>} />
          <Route path="/player/:playerId" element={<RequireAuth><PlayerPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
