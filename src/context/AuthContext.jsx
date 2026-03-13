import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => sessionStorage.getItem('etf_token') || null);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch('/api/auth', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.ok) { setAuthed(true); }
        else { sessionStorage.removeItem('etf_token'); setToken(null); }
      })
      .catch(() => { sessionStorage.removeItem('etf_token'); setToken(null); })
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (password) => {
    const r = await fetch('/api/auth', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur de connexion');
    sessionStorage.setItem('etf_token', data.token);
    setToken(data.token);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('etf_token');
    setToken(null);
    setAuthed(false);
  }, []);

  // Authenticated fetch helper — attaches Bearer token automatically
  const authFetch = useCallback((url, opts = {}) => {
    return fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ authed, checking, token, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
