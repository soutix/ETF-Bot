import { useState, useEffect, useCallback } from 'react';
import { ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Stat, Badge, Spinner, ErrorMsg, pct, usd, sign, colorPN } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const POLL_MS = 30_000;

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/portfolio');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;
  if (!data)   return null;

  const { account, positions, state, equityHistory, market, dryRun } = data;

  const chartData = (equityHistory || []).slice(-90).map(p => ({
    date    : p.timestamp?.split('T')[0] || p.date,
    equity  : p.equity,
    drawdown: -(p.drawdown || 0),
  }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* En-tête */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontWeight:500, flex:1, fontSize:20 }}>Portefeuille</h2>
        {dryRun && <Badge type="warning">Paper trading</Badge>}
        <Badge type={market.isOpenNow ? 'success' : 'neutral'}>
          {market.isOpenNow ? '● Marché ouvert' : '○ Marché fermé'}
        </Badge>
        {state.inSafeHarbor && <Badge type="info">🛡 Safe harbor</Badge>}
      </div>

      {/* Métriques clés */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12 }}>
        <Card><Stat label="Valeur du portefeuille" value={usd(account.portfolioValue)} /></Card>
        <Card>
          <Stat label="P&L du jour"
            value={`${sign(account.equityChange1d)}${usd(account.equityChange1d, 2)}`}
            sub={`${sign(account.equityChangePct)}${account.equityChangePct?.toFixed(2)}%`}
            color={colorPN(account.equityChange1d)} />
        </Card>
        <Card><Stat label="Liquidités" value={usd(account.cash)} sub={pct(account.cashWeight)} /></Card>
        <Card>
          <Stat label="Drawdown actuel"
            value={pct(state.currentDrawdown)}
            sub={`Max : ${pct(state.maxDrawdown)}`}
            color={state.currentDrawdown > 0.1 ? 'var(--color-text-danger)' : undefined} />
        </Card>
        <Card>
          <Stat label="Dernier rééquilibrage"
            value={state.lastRebalance ? new Date(state.lastRebalance).toLocaleDateString('fr-BE') : '—'}
            sub={state.lastRebalance ? new Date(state.lastRebalance).toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) : ''} />
        </Card>
      </div>

      {/* Courbe de performance */}
      {chartData.length > 2 && (
        <Card title="Courbe de performance">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
              <XAxis dataKey="date" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                tickFormatter={d => d?.slice(5)} interval="preserveStartEnd" />
              <YAxis yAxisId="eq" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={50} />
              <YAxis yAxisId="dd" orientation="right" tick={{ fontSize:11, fill:'var(--color-text-tertiary)' }}
                tickFormatter={v => `${(v*100).toFixed(0)}%`} width={40} domain={[-0.5, 0]} />
              <Tooltip
                contentStyle={{ background:'var(--color-background-primary)', border:'1px solid var(--color-border-secondary)', borderRadius:8, fontSize:12 }}
                formatter={(v, n) => n === 'equity' ? usd(v, 2) : `${(v*100).toFixed(2)}%`} />
              <Area yAxisId="eq" type="monotone" dataKey="equity"
                stroke="var(--color-text-info)" fill="var(--color-background-info)" strokeWidth={2} dot={false} />
              <Bar yAxisId="dd" dataKey="drawdown" fill="var(--color-text-danger)" opacity={0.25} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Positions */}
      <Card title={`Positions (${positions.length})`}>
        {positions.length === 0 ? (
          <p style={{ color:'var(--color-text-secondary)', fontSize:14, margin:0 }}>
            Aucune position ouverte.
          </p>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ color:'var(--color-text-secondary)', textAlign:'left' }}>
                  {['Symbole','Prix','Valeur marché','Poids','Cible','P&L non réalisé','Momentum','Vol'].map(h => (
                    <th key={h} style={{ padding:'4px 8px', fontWeight:400, borderBottom:'1px solid var(--color-border-tertiary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.symbol} style={{ borderBottom:'1px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding:'8px 8px', fontWeight:500 }}>{p.symbol}</td>
                    <td style={{ padding:'8px 8px' }}>{usd(p.currentPrice, 2)}</td>
                    <td style={{ padding:'8px 8px' }}>{usd(p.marketValue)}</td>
                    <td style={{ padding:'8px 8px' }}>{pct(p.weight)}</td>
                    <td style={{ padding:'8px 8px', color:'var(--color-text-secondary)' }}>{p.targetWeight != null ? pct(p.targetWeight) : '—'}</td>
                    <td style={{ padding:'8px 8px', color: colorPN(p.unrealizedPL) }}>
                      {sign(p.unrealizedPL)}{usd(p.unrealizedPL, 2)} ({sign(p.unrealizedPct)}{p.unrealizedPct?.toFixed(2)}%)
                    </td>
                    <td style={{ padding:'8px 8px', color: p.momentum >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
                      {p.momentum != null ? `${sign(p.momentum)}${(p.momentum*100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding:'8px 8px', color:'var(--color-text-secondary)' }}>
                      {p.vol != null ? pct(p.vol) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
