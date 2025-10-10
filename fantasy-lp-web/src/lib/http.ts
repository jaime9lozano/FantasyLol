import axios from 'axios';

let accessToken: string | null = localStorage.getItem('access') || null;
let refreshToken: string | null = localStorage.getItem('refresh') || null;

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (access) localStorage.setItem('access', access); else localStorage.removeItem('access');
  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) localStorage.setItem('refresh', refresh); else localStorage.removeItem('refresh');
  }
}

export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  if (accessToken) {
    if (!config.headers) config.headers = {} as any;
    (config.headers as any)['Authorization'] = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshing: Promise<void> | null = null;
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && refreshToken && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = (async () => {
          try {
            const { data } = await axios.post('/api/auth/refresh', { refreshToken });
            setTokens(data.access_token, data.refresh_token);
          } finally {
            refreshing = null;
          }
        })();
      }
      try {
        await refreshing;
      } catch (e) {
        // Si el refresh falla, limpiar tokens para forzar re-login
        setTokens(null, null);
        throw e;
      }
      return http(original);
    }
    return Promise.reject(error);
  }
);
