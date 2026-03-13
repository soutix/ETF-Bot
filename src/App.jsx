import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import Universe  from './pages/Universe';
import Backtest  from './pages/Backtest';
import { T } from './components/ui';

const NAV = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'universe',  label: 'Univers'          },
  { id: 'backtest',  label: 'Backtest'          },
];

function Login() {
  const { login } = useAuth();
  const [pw, setPw]     = useState('');
  const [err, setErr]   = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setBusy(true); setErr('');
    try { await login(pw); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: T.bg0 }}>
      <div style={{ background: T.bg1, borderRadius: 14, padding: '36px 32px',
                    width: 300, textAlign: 'center', border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🤑</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: T.text0, marginBottom: 4 }}>ETF.Bot</div>
        <div style={{ fontSize: 11, color: T.text2, marginBottom: 24 }}>
          Accès sécurisé · Auth serveur
        </div>
        <input
          type="password"
          placeholder="Mot de passe"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', background: T.bg0, border: `1px solid ${T.border}`,
                   borderRadius: 8, padding: '9px 12px', color: T.text1, fontSize: 13,
                   boxSizing: 'border-box', marginBottom: 8, outline: 'none',
                   fontFamily: 'inherit' }}
        />
        {err && <div style={{ color: '#FCA5A5', fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <button onClick={submit} disabled={busy}
          style={{ width: '100%', background: busy ? T.bg2 : '#1D4ED8', border: 'none',
                   borderRadius: 8, padding: '10px 0', color: 'white', fontSize: 13,
                   fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer',
                   fontFamily: 'inherit' }}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[['Token TTL', '12h', T.blue], ['Transport', 'HTTPS', T.green]].map(([l, v, c]) => (
            <div key={l} style={{ background: T.bg0, borderRadius: 6, padding: '6px 8px', textAlign: 'left' }}>
              <div style={{ fontSize: 9, color: T.text2 }}>{l}</div>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppInner() {
  const { authed, checking, logout } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: T.bg0 }}>
        <div style={{ fontSize: 32 }}>🤑</div>
      </div>
    );
  }

  if (!authed) return <Login />;

  const pages = { dashboard: Dashboard, universe: Universe, backtest: Backtest };
  const Page  = pages[page] || Dashboard;

  return (
    <div style={{ minHeight: '100vh', background: T.bg0 }}>
      {/* Nav */}
      <nav style={{ background: T.bg1, borderBottom: `1px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', gap: 2,
                    padding: '0 18px', height: 46, position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14,
                       fontWeight: 500, color: T.text0, marginRight: 16, letterSpacing: '-.3px' }}>
          ETF<span style={{ color: T.blue }}>.</span>BOT
        </span>

        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none',
                     cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                     background: page === n.id ? '#1E3A5F' : 'transparent',
                     color: page === n.id ? '#60A5FA' : T.text2,
                     transition: 'all .15s' }}>
            {n.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, fontFamily: T.mono, background: '#022C22',
                       color: '#34D399', padding: '2px 8px', borderRadius: 4 }}>
          PAPER
        </span>
        <button onClick={logout}
          style={{ marginLeft: 10, padding: '4px 10px', borderRadius: 6,
                   border: `1px solid ${T.border}`, cursor: 'pointer', fontSize: 10,
                   background: 'transparent', color: T.text2, fontFamily: 'inherit' }}>
          Déconnexion
        </button>
      </nav>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '16px' }}>
        <Page />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
