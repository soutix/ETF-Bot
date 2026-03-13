import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Universe  from './pages/Universe';
import Backtest  from './pages/Backtest';

const NAV = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'universe',  label: '🌍 Universe'  },
  { id: 'backtest',  label: '🔬 Backtest'  },
];

function Login({ onLogin }) {
  const [pw, setPw]  = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (pw === (import.meta.env.VITE_DASHBOARD_PASSWORD || 'admin')) {
      sessionStorage.setItem('etf_auth', '1');
      onLogin();
    } else {
      setErr('Incorrect password');
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                  background:'var(--color-background-tertiary)' }}>
      <div style={{ background:'var(--color-background-primary)', borderRadius:16, padding:40,
                    border:'1px solid var(--color-border-tertiary)', width:320, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>📈</div>
        <h2 style={{ margin:'0 0 4px', fontWeight:500 }}>ETF Bot</h2>
        <p style={{ margin:'0 0 24px', color:'var(--color-text-secondary)', fontSize:14 }}>Dashboard</p>
        <input
          type="password"
          placeholder="Password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--color-border-primary)',
                   background:'var(--color-background-secondary)', color:'var(--color-text-primary)',
                   fontSize:14, boxSizing:'border-box', marginBottom:8 }}
        />
        {err && <p style={{ color:'var(--color-text-danger)', fontSize:13, margin:'0 0 8px' }}>{err}</p>}
        <button onClick={submit}
          style={{ width:'100%', padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer',
                   background:'var(--color-text-primary)', color:'var(--color-background-primary)',
                   fontWeight:500, fontSize:14 }}>
          Sign in
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed]   = useState(!!sessionStorage.getItem('etf_auth'));
  const [page, setPage]       = useState('dashboard');

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const pages = { dashboard: Dashboard, universe: Universe, backtest: Backtest };
  const Page  = pages[page] || Dashboard;

  return (
    <div style={{ minHeight:'100vh', background:'var(--color-background-tertiary)' }}>
      {/* Top nav */}
      <nav style={{ background:'var(--color-background-primary)', borderBottom:'1px solid var(--color-border-tertiary)',
                    display:'flex', alignItems:'center', gap:4, padding:'0 24px', height:52 }}>
        <span style={{ fontWeight:500, marginRight:16, fontSize:15 }}>📈 ETF Bot</span>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13,
                     fontWeight: page === n.id ? 500 : 400,
                     background: page === n.id ? 'var(--color-background-secondary)' : 'transparent',
                     color:'var(--color-text-primary)' }}>
            {n.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button onClick={() => { sessionStorage.removeItem('etf_auth'); setAuthed(false); }}
          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--color-border-tertiary)',
                   cursor:'pointer', fontSize:12, background:'transparent', color:'var(--color-text-secondary)' }}>
          Sign out
        </button>
      </nav>
      <main style={{ maxWidth:1200, margin:'0 auto', padding:'24px 16px' }}>
        <Page />
      </main>
    </div>
  );
}
