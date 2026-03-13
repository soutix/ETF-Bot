import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import Universe  from './pages/Universe';
import Backtest  from './pages/Backtest';

const NAV = [
  { id: 'dashboard', label: '📊 Tableau de bord' },
  { id: 'universe',  label: '🌍 Univers'          },
  { id: 'backtest',  label: '🔬 Backtest'          },
];

function Login() {
  const { login } = useAuth();
  const [pw, setPw]   = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setLoading(true);
    setErr('');
    try {
      await login(pw);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                  background:'#f8f9fa' }}>
      <div style={{ background:'white', borderRadius:16, padding:40, boxShadow:'0 4px 24px rgba(0,0,0,0.08)',
                    width:320, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:8 }}>🤑</div>
        <h2 style={{ margin:'0 0 4px', fontWeight:600, fontSize:20 }}>ETF Bot</h2>
        <p style={{ margin:'0 0 24px', color:'#6c757d', fontSize:14 }}>Tableau de bord</p>
        <input
          type="password"
          placeholder="Mot de passe"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width:'100%', padding:'10px 14px', borderRadius:8,
                   border:'1px solid #dee2e6', fontSize:14,
                   boxSizing:'border-box', marginBottom:8, outline:'none' }}
        />
        {err && <p style={{ color:'#dc3545', fontSize:13, margin:'0 0 8px' }}>{err}</p>}
        <button onClick={submit} disabled={loading}
          style={{ width:'100%', padding:'10px 0', borderRadius:8, border:'none',
                   cursor: loading ? 'not-allowed' : 'pointer',
                   background:'#212529', color:'white',
                   fontWeight:500, fontSize:14, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}

function AppInner() {
  const { authed, checking, logout } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (checking) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontSize:32 }}>🤑</div>
      </div>
    );
  }

  if (!authed) return <Login />;

  const pages = { dashboard: Dashboard, universe: Universe, backtest: Backtest };
  const Page  = pages[page] || Dashboard;

  return (
    <div style={{ minHeight:'100vh', background:'#f8f9fa' }}>
      <nav style={{ background:'white', borderBottom:'1px solid #dee2e6',
                    display:'flex', alignItems:'center', gap:4, padding:'0 24px', height:52,
                    boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        <span style={{ fontWeight:600, marginRight:16, fontSize:15 }}>🤑 ETF Bot</span>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13,
                     fontWeight: page === n.id ? 500 : 400,
                     background: page === n.id ? '#f1f3f5' : 'transparent',
                     color:'#212529' }}>
            {n.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button onClick={logout}
          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #dee2e6',
                   cursor:'pointer', fontSize:12, background:'transparent', color:'#6c757d' }}>
          Déconnexion
        </button>
      </nav>
      <main style={{ maxWidth:1200, margin:'0 auto', padding:'24px 16px' }}>
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
