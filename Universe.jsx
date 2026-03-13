import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Card, Badge, Spinner, ErrorMsg, pct, sign } from '../components/ui';

const CATEGORY_COLORS = {
  'US Equities'  : 'var(--color-text-info)',
  'Intl Equities': '#8B7CF7',
  'Bonds'        : 'var(--color-text-success)',
  'Commodities'  : '#EF9F27',
  'Sector'       : '#D4537E',
  'Cash'         : 'var(--color-text-tertiary)',
};

export default function Universe() {
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/universe');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;
  if (!data)   return null;

  const { etfs, summary, config } = data;

  // Bar chart data — sorted by momentum desc
  const chartData = [...etfs].sort((a, b) => (b.momentum || 0) - (a.momentum || 0)).map(e => ({
    symbol  : e.symbol,
    momentum: e.momentum != null ? parseFloat((e.momentum * 100).toFixed(2)) : null,
    selected: e.isSelected,
    eligible: e.isEligible,
  }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontWeight:500, flex:1, fontSize:20 }}>Universe scores</h2>
        <Badge type="neutral">{config.MOMENTUM_DAYS}d momentum</Badge>
        <Badge type="neutral">Top {config.TOP_K} selected</Badge>
        {summary.inSafeHarbor && <Badge type="info">🛡 In safe harbor</Badge>}
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:12 }}>
        {[
          { label:'Total ETFs',    value: summary.total },
          { label:'Eligible',      value: summary.eligible,    sub:'Beat risk-free rate' },
          { label:'Selected',      value: summary.selected,    sub:'Top-K holdings' },
          { label:'Risk-free rate (BIL)', value: summary.riskFreeReturn != null ? `${(summary.riskFreeReturn*100).toFixed(2)}%` : '—', sub:`${config.MOMENTUM_DAYS}d return` },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize:22, fontWeight:500 }}>{s.value}</div>
            <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:2 }}>{s.label}</div>
            {s.sub && <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:1 }}>{s.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Momentum bar chart */}
      <Card title="Momentum scores vs risk-free rate">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top:8, right:8, left:0, bottom:4 }}>
            <XAxis dataKey="symbol" tick={{ fontSize:11, fill:'var(--color-text-secondary)' }} />
            <YAxis tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
              tickFormatter={v => `${v}%`} width={42} />
            <Tooltip
              contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }}
              formatter={v => [`${v}%`, 'Momentum']} />
            <ReferenceLine y={summary.riskFreeReturn != null ? parseFloat((summary.riskFreeReturn*100).toFixed(2)) : 0}
              stroke="var(--color-text-danger)" strokeDasharray="4 4" label={{ value:'Risk-free', fill:'var(--color-text-danger)', fontSize:11, position:'right' }} />
            <Bar dataKey="momentum" radius={[3,3,0,0]}>
              {chartData.map(d => (
                <Cell key={d.symbol}
                  fill={d.selected ? 'var(--color-text-success)' : d.eligible ? 'var(--color-text-info)' : 'var(--color-border-secondary)'}
                  opacity={d.selected ? 1 : d.eligible ? 0.7 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12, color:'var(--color-text-secondary)' }}>
          <span><span style={{ color:'var(--color-text-success)' }}>■</span> Selected (top {config.TOP_K})</span>
          <span><span style={{ color:'var(--color-text-info)', opacity:0.7 }}>■</span> Eligible</span>
          <span><span style={{ color:'var(--color-border-secondary)', opacity:0.8 }}>■</span> Below risk-free</span>
        </div>
      </Card>

      {/* Full table */}
      <Card title="All ETFs">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ color:'var(--color-text-secondary)', textAlign:'left' }}>
                {['#','Symbol','Name','Category','Price','Momentum','Vol (20d)','Status','Weight'].map(h => (
                  <th key={h} style={{ padding:'4px 8px', fontWeight:400, borderBottom:'1px solid var(--color-border-tertiary)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etfs.map((e, i) => (
                <tr key={e.symbol}
                  style={{ borderBottom:'1px solid var(--color-border-tertiary)',
                           background: e.isSelected ? 'var(--color-background-success)' : e.isEligible ? 'var(--color-background-info)' : undefined,
                           opacity: e.isSelected ? 1 : e.isEligible ? 0.9 : 0.6 }}>
                  <td style={{ padding:'7px 8px', color:'var(--color-text-tertiary)' }}>{i + 1}</td>
                  <td style={{ padding:'7px 8px', fontWeight:500 }}>{e.symbol}</td>
                  <td style={{ padding:'7px 8px', color:'var(--color-text-secondary)' }}>{e.name}</td>
                  <td style={{ padding:'7px 8px' }}>
                    <span style={{ fontSize:11, color: CATEGORY_COLORS[e.category] || 'var(--color-text-secondary)' }}>
                      {e.category}
                    </span>
                  </td>
                  <td style={{ padding:'7px 8px' }}>{e.price != null ? `$${e.price.toFixed(2)}` : '—'}</td>
                  <td style={{ padding:'7px 8px', color: e.momentum >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)', fontWeight: e.isSelected ? 500 : 400 }}>
                    {e.momentum != null ? `${sign(e.momentum)}${(e.momentum*100).toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding:'7px 8px', color:'var(--color-text-secondary)' }}>
                    {e.vol != null ? pct(e.vol) : '—'}
                  </td>
                  <td style={{ padding:'7px 8px' }}>
                    {e.isSelected
                      ? <Badge type="success">● Selected</Badge>
                      : e.isEligible
                        ? <Badge type="info">Eligible</Badge>
                        : <Badge type="neutral">Below BIL</Badge>}
                  </td>
                  <td style={{ padding:'7px 8px', fontWeight: e.isSelected ? 500 : 400 }}>
                    {e.isSelected ? pct(e.targetWeight) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
