import { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, AreaChart, Area } from 'recharts';
import { Card, Stat, Badge, Spinner, ErrorMsg, pct, usd, sign, colorPN } from '../components/ui';

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
    { label:'Strategy CAGR',  value: pct(stats.cagr, 2),       color: colorPN(stats.cagr)      },
    { label:'SPY CAGR',       value: pct(stats.benchCAGR, 2),   color: colorPN(stats.benchCAGR) },
    { label:'Alpha (annual)', value: `${sign(alpha)}${pct(alpha, 2)}`, color: colorPN(alpha)    },
    { label:'Sharpe ratio',   value: stats.sharpe?.toFixed(2),  color: stats.sharpe > 1 ? 'var(--color-text-success)' : undefined },
    { label:'Max drawdown',   value: pct(stats.maxDrawdown, 2), color: 'var(--color-text-danger)' },
    { label:'Total return',   value: pct(stats.totalReturn, 1), color: colorPN(stats.totalReturn) },
    { label:'SPY total return', value: pct(stats.benchmarkReturn, 1) },
    { label:'Final value',    value: usd(stats.finalEquity)     },
    { label:'Total trades',   value: stats.totalTrades          },
    { label:'Years',          value: stats.years                },
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
      const r = await fetch(`/api/backtest?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      setResult(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // Downsample equity curve for chart performance (max 300 points)
  const chartData = result ? (() => {
    const ec = result.equityCurve;
    const step = Math.max(1, Math.floor(ec.length / 300));
    return ec.filter((_, i) => i % step === 0 || i === ec.length - 1).map(p => ({
      date     : p.date,
      strategy : parseFloat(p.equity?.toFixed(2)),
      benchmark: parseFloat(p.benchmark?.toFixed(2)),
      drawdown : parseFloat((-(p.drawdown || 0)).toFixed(4)),
    }));
  })() : [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <h2 style={{ margin:0, fontWeight:500, flex:1, fontSize:20 }}>Backtest</h2>
        <Badge type="neutral">Dual Momentum vs SPY buy-and-hold</Badge>
      </div>

      {/* Parameters */}
      <Card title="Parameters">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:20 }}>
          <ParamSlider label="Momentum lookback" param="momentumDays" value={params.momentumDays}
            min={60} max={252} step={10} format={v => `${v} days`} onChange={setParam} />
          <ParamSlider label="Number of holdings (Top K)" param="topK" value={params.topK}
            min={1} max={6} step={1} onChange={setParam} />
          <ParamSlider label="Volatility target" param="targetVol" value={params.targetVol}
            min={0.05} max={0.30} step={0.01} format={v => `${(v*100).toFixed(0)}%`} onChange={setParam} />
          <ParamSlider label="Starting capital" param="startCapital" value={params.startCapital}
            min={1000} max={100000} step={1000} format={v => `$${v.toLocaleString()}`} onChange={setParam} />
        </div>

        {/* Frequency toggle */}
        <div style={{ display:'flex', gap:8, marginTop:16, alignItems:'center' }}>
          <span style={{ fontSize:13, color:'var(--color-text-secondary)' }}>Rebalance:</span>
          {['weekly', 'monthly'].map(f => (
            <button key={f} onClick={() => setParam('frequency', f)}
              style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--color-border-tertiary)',
                       cursor:'pointer', fontSize:13, fontWeight: params.frequency === f ? 500 : 400,
                       background: params.frequency === f ? 'var(--color-background-secondary)' : 'transparent',
                       color:'var(--color-text-primary)' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <button onClick={run} disabled={loading}
          style={{ marginTop:20, padding:'10px 28px', borderRadius:8, border:'none', cursor: loading ? 'not-allowed' : 'pointer',
                   background:'var(--color-text-primary)', color:'var(--color-background-primary)',
                   fontWeight:500, fontSize:14, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Running simulation…' : 'Run backtest'}
        </button>
        <p style={{ margin:'8px 0 0', fontSize:12, color:'var(--color-text-tertiary)' }}>
          Fetches ~5 years of daily data from Alpaca and simulates the strategy. May take 10–20s.
        </p>
      </Card>

      {error && <ErrorMsg msg={error} />}

      {loading && (
        <Card>
          <Spinner />
          <p style={{ textAlign:'center', color:'var(--color-text-secondary)', fontSize:13, margin:0 }}>
            Fetching historical data and running simulation…
          </p>
        </Card>
      )}

      {result && !loading && (
        <>
          {/* Stats grid */}
          <StatGrid stats={result.stats} />

          {/* Equity curve */}
          <Card title="Equity curve — strategy vs SPY buy-and-hold">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={48} />
                <Tooltip
                  contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }}
                  formatter={(v, n) => [usd(v, 0), n === 'strategy' ? 'Dual Momentum' : 'SPY B&H']} />
                <Legend formatter={v => v === 'strategy' ? 'Dual Momentum' : 'SPY buy-and-hold'}
                  wrapperStyle={{ fontSize:12 }} />
                <Line type="monotone" dataKey="strategy"  stroke="var(--color-text-success)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="benchmark" stroke="var(--color-text-secondary)" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Drawdown chart */}
          <Card title="Drawdown">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                  tickFormatter={v => `${(v*100).toFixed(0)}%`} width={40} domain={[-1, 0]} />
                <Tooltip formatter={v => `${(v*100).toFixed(2)}%`}
                  contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }} />
                <Area type="monotone" dataKey="drawdown" stroke="var(--color-text-danger)"
                  fill="var(--color-background-danger)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Recent trades */}
          {result.tradeLog?.length > 0 && (
            <Card title={`Trade log (last ${Math.min(result.tradeLog.length, 50)} of ${result.stats.totalTrades})`}>
              <div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, background:'var(--color-background-primary)' }}>
                    <tr style={{ color:'var(--color-text-secondary)' }}>
                      {['Date','Action','Symbol','Shares','Price','Value'].map(h => (
                        <th key={h} style={{ padding:'4px 8px', fontWeight:400, borderBottom:'1px solid var(--color-border-tertiary)', textAlign:'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.tradeLog.slice(-50).reverse().map((t, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--color-border-tertiary)' }}>
                        <td style={{ padding:'5px 8px', color:'var(--color-text-secondary)' }}>{t.date}</td>
                        <td style={{ padding:'5px 8px' }}>
                          <Badge type={t.action === 'BUY' ? 'success' : 'danger'}>{t.action}</Badge>
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
