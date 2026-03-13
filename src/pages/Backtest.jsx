import { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { Card, Stat, Badge, Spinner, ErrorMsg, pct, usd, sign, colorPN } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const DEFAULT_PARAMS = {
  momentumDays: 120,
  topK        : 3,
  targetVol   : 0.10,
  startCapital: 10000,
  frequency   : 'weekly',
};

function ParamSlider({ label, param, value, min, max, step, format, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
        <span style={{ color:'var(--color-text-secondary)' }}>{label}</span>
        <span style={{ fontWeight:500 }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(param, parseFloat(e.target.value))}
        style={{ width:'100%', accentColor:'var(--color-text-info)' }} />
    </div>
  );
}

function StatGrid({ stats }) {
  const alpha = stats.cagr - stats.benchCAGR;
  const items = [
    { label:'CAGR stratégie',    value: pct(stats.cagr, 2),        color: colorPN(stats.cagr)      },
    { label:'CAGR SPY',          value: pct(stats.benchCAGR, 2),    color: colorPN(stats.benchCAGR) },
    { label:'Alpha (annuel)',     value: `${sign(alpha)}${pct(alpha, 2)}`, color: colorPN(alpha)    },
    { label:'Ratio de Sharpe',   value: stats.sharpe?.toFixed(2),   color: stats.sharpe > 1 ? 'var(--color-text-success)' : undefined },
    { label:'Drawdown max',      value: pct(stats.maxDrawdown, 2),  color: 'var(--color-text-danger)' },
    { label:'Rendement total',   value: pct(stats.totalReturn, 1),  color: colorPN(stats.totalReturn) },
    { label:'Rendement SPY',     value: pct(stats.benchmarkReturn, 1) },
    { label:'Valeur finale',     value: usd(stats.finalEquity)      },
    { label:'Nombre de trades',  value: stats.totalTrades           },
    { label:'Années simulées',   value: stats.years                 },
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10 }}>
      {items.map(s => (
        <Card key={s.label} style={{ padding:14 }}>
          <Stat label={s.label} value={s.value} color={s.color} />
        </Card>
      ))}
    </div>
  );
}

export default function Backtest() {
  const { authFetch } = useAuth();
  const [params, setParams]   = useState(DEFAULT_PARAMS);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const setParam = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        momentumDays: params.momentumDays,
        topK        : params.topK,
        targetVol   : params.targetVol,
        startCapital: params.startCapital,
        frequency   : params.frequency,
      });
      const r = await authFetch(`/api/backtest?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      setResult(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params, authFetch]);

  const chartData = result ? (() => {
    const ec   = result.equityCurve;
    const step = Math.max(1, Math.floor(ec.length / 300));
    return ec.filter((_, i) => i % step === 0 || i === ec.length - 1).map(p => ({
      date     : p.date,
      strategie: parseFloat(p.equity?.toFixed(2)),
      benchmark: parseFloat(p.benchmark?.toFixed(2)),
      drawdown : parseFloat((-(p.drawdown || 0)).toFixed(4)),
    }));
  })() : [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* En-tête */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <h2 style={{ margin:0, fontWeight:500, flex:1, fontSize:20 }}>Backtest</h2>
        <Badge type="neutral">Dual Momentum vs SPY buy-and-hold</Badge>
      </div>

      {/* Paramètres */}
      <Card title="Paramètres">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:20 }}>
          <ParamSlider label="Fenêtre momentum" param="momentumDays" value={params.momentumDays}
            min={60} max={252} step={10} format={v => `${v} jours`} onChange={setParam} />
          <ParamSlider label="Nombre de positions (Top K)" param="topK" value={params.topK}
            min={1} max={6} step={1} onChange={setParam} />
          <ParamSlider label="Cible de volatilité" param="targetVol" value={params.targetVol}
            min={0.05} max={0.30} step={0.01} format={v => `${(v*100).toFixed(0)}%`} onChange={setParam} />
          <ParamSlider label="Capital de départ" param="startCapital" value={params.startCapital}
            min={1000} max={100000} step={1000} format={v => `$${v.toLocaleString('fr-BE')}`} onChange={setParam} />
        </div>

        {/* Fréquence */}
        <div style={{ display:'flex', gap:8, marginTop:16, alignItems:'center' }}>
          <span style={{ fontSize:13, color:'var(--color-text-secondary)' }}>Rééquilibrage :</span>
          {[['weekly','Hebdomadaire'], ['monthly','Mensuel']].map(([f, label]) => (
            <button key={f} onClick={() => setParam('frequency', f)}
              style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--color-border-tertiary)',
                       cursor:'pointer', fontSize:13, fontWeight: params.frequency === f ? 500 : 400,
                       background: params.frequency === f ? 'var(--color-background-secondary)' : 'transparent',
                       color:'var(--color-text-primary)' }}>
              {label}
            </button>
          ))}
        </div>

        <button onClick={run} disabled={loading}
          style={{ marginTop:20, padding:'10px 28px', borderRadius:8, border:'none', cursor: loading ? 'not-allowed' : 'pointer',
                   background:'var(--color-text-primary)', color:'var(--color-background-primary)',
                   fontWeight:500, fontSize:14, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Simulation en cours…' : 'Lancer le backtest'}
        </button>
        <p style={{ margin:'8px 0 0', fontSize:12, color:'var(--color-text-tertiary)' }}>
          Télécharge ~5 ans de données journalières depuis Alpaca et simule la stratégie. Peut prendre 10–20s.
        </p>
      </Card>

      {error && <ErrorMsg msg={error} />}

      {loading && (
        <Card>
          <Spinner />
          <p style={{ textAlign:'center', color:'var(--color-text-secondary)', fontSize:13, margin:0 }}>
            Téléchargement des données historiques et simulation en cours…
          </p>
        </Card>
      )}

      {result && !loading && (
        <>
          <StatGrid stats={result.stats} />

          <Card title="Courbe de performance — stratégie vs SPY buy-and-hold">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={48} />
                <Tooltip
                  contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }}
                  formatter={(v, n) => [usd(v, 0), n === 'strategie' ? 'Dual Momentum' : 'SPY B&H']} />
                <Legend formatter={v => v === 'strategie' ? 'Dual Momentum' : 'SPY buy-and-hold'}
                  wrapperStyle={{ fontSize:12 }} />
                <Line type="monotone" dataKey="strategie"  stroke="#27AE60" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#95A5A6" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Drawdown">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={v => `${(v*100).toFixed(0)}%`} width={40} domain={[-1, 0]} />
                <Tooltip formatter={v => `${(v*100).toFixed(2)}%`}
                  contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }} />
                <Area type="monotone" dataKey="drawdown" stroke="#E74C3C"
                  fill="#FADBD8" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {result.tradeLog?.length > 0 && (
            <Card title={`Journal des trades (${Math.min(result.tradeLog.length, 50)} derniers sur ${result.stats.totalTrades})`}>
              <div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, background:'var(--color-background-primary)' }}>
                    <tr style={{ color:'var(--color-text-secondary)' }}>
                      {['Date','Action','Symbole','Titres','Prix','Montant'].map(h => (
                        <th key={h} style={{ padding:'4px 8px', fontWeight:400, borderBottom:'1px solid var(--color-border-tertiary)', textAlign:'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.tradeLog.slice(-50).reverse().map((t, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--color-border-tertiary)' }}>
                        <td style={{ padding:'5px 8px', color:'var(--color-text-secondary)' }}>{t.date}</td>
                        <td style={{ padding:'5px 8px' }}>
                          <Badge type={t.action === 'BUY' ? 'success' : 'danger'}>{t.action === 'BUY' ? 'ACHAT' : 'VENTE'}</Badge>
                        </td>
                        <td style={{ padding:'5px 8px', fontWeight:500 }}>{t.symbol}</td>
                        <td style={{ padding:'5px 8px', color:'var(--color-text-secondary)' }}>{t.shares?.toFixed(4)}</td>
                        <td style={{ padding:'5px 8px' }}>${t.price?.toFixed(2)}</td>
                        <td style={{ padding:'5px 8px' }}>{usd(t.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
