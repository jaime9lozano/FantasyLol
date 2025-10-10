import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

export async function apiLogin(email: string, password: string) {
  const { data } = await http.post('/auth/login', { email, password });
  return data as { access_token: string; refresh_token: string; payload: any };
}

export async function apiMe(access: string) {
  const { data } = await http.get('/auth/me', { headers: { Authorization: `Bearer ${access}` } });
  return data;
}

export async function apiMemberships(access: string) {
  const { data } = await http.get('/auth/memberships', { headers: { Authorization: `Bearer ${access}` } });
  return data as Array<{ teamId: number; teamName: string; leagueId: number; leagueName: string; sourceLeagueCode: string | null }>;
}

export async function apiSelectContext(access: string, leagueId: number) {
  const { data } = await http.post('/auth/context/select', { leagueId }, { headers: { Authorization: `Bearer ${access}` } });
  return data as { access_token: string; payload: any };
}
