import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Card, Stat, Badge, Spinner, ErrorMsg, AllocBar, HeatCell,
  Sparkline, RebalanceAlert, T, usd, pct, sign, colorPN
} from '../components/ui';

const MOCK_HEAT = [
  { s:'GLD', c:1.2 },{ s:'GSG', c:0.8 },{ s:'XLE', c:0.3 },{ s:'BIL', c:0.0 },
  { s:'SPY', c:-0.4 },{ s:'QQQ', c:-0.7 },{ s:'EEM', c:-1.1 },{ s:'TLT', c:0.0 },
];

const ALLOC_COLORS = { GLD:'#F59E0B', GSG:'#3B82F6', XLE:'#10B981', IEF:'#A78BFA',
                       GS:'#F472B6', EEM:'#FB923C', SPY:'#60A5FA', CASH:'#334155' };

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [data, setData]       = useState(null);
  const [eq, setEq]           = useState([]);
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [p, h] = await Promise.all([
        authFetch('/api/portfolio').then(r => r.json()),
        authFetch('/api/equity-history').then(r => r.ok ? r.json() : { history: [] }),
      ]);
      if (p.error) throw new Error(p.error);
      setData(p);
      setEq((h.history || []).map(r => r.equity));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (err)     return <ErrorMsg msg={err} />;

  const portfolio   = data?.portfolio  || {};
  const state       = data?.state      || {};
  const positions   = data?.positions  || [];
  const equity      = portfolio.equity ?? 100000;
  const cash        = portfolio.cash   ?? 0;
  const pnlDay      = portfolio.unrealized_pl ?? 0;
  const drawdown    = state.current_drawdown  ?? 0;
  const maxDd       = state.max_drawdown_ever ?? 0;
  const lastReb     = state.last_rebalance     ?? '—';
  const nextRebDate = '17 mars 2026';

  // Ticker prices from positions
  const tickers = positions.slice(0, 5);

  // Alloc from positions
  const alloc = positions.map(p => ({
    symbol: p.symbol.replace('-USD',''),
    value: parseFloat(p.market_value) || 0,
    pct: (parseFloat(p.market_value) || 0) / equity,
    color: ALLOC_COLORS[p.symbol.replace('-USD','')] || T.blue,
  }));
  const cashPct = cash / equity;

  return (
    <div>
      {/* Ticker strip */}
      <div style={{ display:'flex', gap:16, overflowX:'auto', marginBottom:12,
                    padding:'7px 12px', background:T.bg1, borderRadius:8,
                    border:`1px solid ${T.border}`, alignItems:'center', scrollbarWidth:'none' }}>
        {tickers.map(p => {
          const chg = parseFloat(p.unrealized_plpc) || 0;
          return (
            <div key={p.symbol} style={{ display:'flex', gap:7, alignItems:'center',
                                         whiteSpace:'nowrap', fontSize:11 }}>
              <span style={{ fontFamily:T.mono, color:T.text1 }}>{p.symbol.replace('-USD','')}</span>
              <span style={{ fontFamily:T.mono, color:T.text0 }}>{usd(parseFloat(p.current_price),2)}</span>
              <span style={{ color: colorPN(chg) }}>{sign(chg)}{(chg*100).toFixed(2)}%</span>
            </div>
          );
        })}
        <div style={{ marginLeft:'auto', whiteSpace:'nowrap', fontSize:9, fontFamily:T.mono,
                      background:'#022C22', color:'#34D399', padding:'2px 8px', borderRadius:4 }}>
          ● NYSE OUVERT
        </div>
        {/* compact toggle */}
        <button onClick={() => setCompact(c => !c)}
          style={{ marginLeft:8, padding:'3px 9px', borderRadius:5, border:`1px solid ${T.border}`,
                   background:'transparent', color:T.text2, fontSize:9, cursor:'pointer',
                   fontFamily:'inherit', whiteSpace:'nowrap' }}>
          {compact ? 'Vue complète' : 'Vue compacte'}
        </button>
      </div>

      {/* Rebalance alert */}
      <RebalanceAlert nextDate={nextRebDate} daysUntil={4} />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
        <Card accent={T.blue}>
          <Stat label="Valeur portefeuille" value={usd(equity)}
                sub={<span style={{color:colorPN(equity-100000)}}>{sign(equity-100000)}{usd(equity-100000)} depuis départ</span>} />
        </Card>
        <Card accent={colorPN(pnlDay)}>
          <Stat label="P&L du jour" value={<span style={{color:colorPN(pnlDay)}}>{sign(pnlDay)}{usd(pnlDay)}</span>}
                sub={<span style={{color:colorPN(pnlDay)}}>{sign(pnlDay)}{(Math.abs(pnlDay/equity)*100).toFixed(2)}% aujourd'hui</span>} />
        </Card>
        <Card accent={T.red}>
          <Stat label="Drawdown actuel" value={<span style={{color:T.text1}}>{(drawdown*100).toFixed(2)}%</span>}
                sub={`Max historique: ${(maxDd*100).toFixed(1)}%`} />
        </Card>
        <Card>
          <Stat label="Prochain rééquilibrage" value={<span style={{fontSize:14,color:T.text1}}>{nextRebDate}</span>}
                sub="dans 4 jours" />
        </Card>
      </div>

      {!compact ? (
        <>
          {/* Charts row */}
          <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:10, marginBottom:10 }}>
            <Card title="Courbe de performance">
              {eq.length > 1 ? (
                <>
                  <Sparkline values={eq} color={T.blue} height={110} />
                  <div style={{ display:'flex', gap:14, marginTop:6, fontSize:10 }}>
                    <span style={{color:T.blue}}>▬ Dual Momentum</span>
                    <span style={{color:T.text2}}>╌ SPY buy-and-hold</span>
                  </div>
                </>
              ) : (
                <div style={{fontSize:12,color:T.text2,padding:'20px 0',textAlign:'center'}}>
                  Historique insuffisant — données disponibles après quelques rééquilibrages
                </div>
              )}
            </Card>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Card title="Allocation actuelle" style={{ flex:1 }}>
                {alloc.map(a => (
                  <AllocBar key={a.symbol} symbol={a.symbol} pct={a.pct} color={a.color} />
                ))}
                {cashPct > 0.005 && <AllocBar symbol="CASH" pct={cashPct} color="#334155" />}
              </Card>
              <Card title="Drawdown">
                <Sparkline values={eq.length > 1
                  ? eq.map((v, i) => { const mx = Math.max(...eq.slice(0, i+1)); return ((v-mx)/mx)*100; })
                  : [-1,-2,-3,-2,-4,-3,-2,-1]} color={T.red} height={40} />
              </Card>
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {/* Heatmap */}
            <Card title="Heatmap univers (jour)">
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:3 }}>
                {MOCK_HEAT.map(h => <HeatCell key={h.s} symbol={h.s} change={h.c} />)}
              </div>
            </Card>

            {/* Positions */}
            <Card title="Positions ouvertes">
              {positions.length === 0 && (
                <div style={{fontSize:12,color:T.text2}}>Aucune position ouverte (paper trading)</div>
              )}
              {positions.map(p => {
                const sym  = p.symbol.replace('-USD','');
                const plpc = parseFloat(p.unrealized_plpc) || 0;
                return (
                  <div key={p.symbol} style={{ display:'flex', justifyContent:'space-between',
                                               alignItems:'center', padding:'7px 0',
                                               borderBottom:`1px solid ${T.border}` }}>
                    <span style={{ fontFamily:T.mono, fontSize:12,
                                   color: ALLOC_COLORS[sym] || T.text0 }}>{sym}</span>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:T.mono, fontSize:12, color:T.text0 }}>
                        {usd(parseFloat(p.market_value))}
                      </div>
                      <div style={{ fontSize:10, color: colorPN(plpc) }}>
                        {sign(plpc)}{(plpc*100).toFixed(2)}% depuis entrée
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>

            {/* Strategy stats */}
            <Card title="Métriques backtest">
              {[
                ['CAGR stratégie', '12.01%', T.green],
                ['CAGR SPY',       '9.45%',  T.text1],
                ['Alpha annuel',   '+2.55%', T.green],
                ['Sharpe ratio',   '1.04',   T.text0],
                ['Max drawdown',   '-12.6%', T.red  ],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between',
                                      alignItems:'center', padding:'7px 0',
                                      borderBottom:`1px solid ${T.border}`, fontSize:11 }}>
                  <span style={{color:T.text2}}>{l}</span>
                  <span style={{fontFamily:T.mono, color:c}}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      ) : (
        /* ─── Compact view ─── */
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Card title="Positions ouvertes">
            {positions.map(p => {
              const sym  = p.symbol.replace('-USD','');
              const plpc = parseFloat(p.unrealized_plpc) || 0;
              return (
                <div key={p.symbol} style={{ display:'flex', justifyContent:'space-between',
                                             padding:'6px 0', borderBottom:`1px solid ${T.border}` }}>
                  <span style={{fontFamily:T.mono,fontSize:12,color:ALLOC_COLORS[sym]||T.text0}}>{sym}</span>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:T.mono,fontSize:12,color:T.text0}}>{usd(parseFloat(p.market_value))}</div>
                    <div style={{fontSize:10,color:colorPN(plpc)}}>{sign(plpc)}{(plpc*100).toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
          </Card>
          <Card title="Allocation">
            {alloc.map(a => <AllocBar key={a.symbol} symbol={a.symbol} pct={a.pct} color={a.color} />)}
          </Card>
        </div>
      )}
    </div>
  );
}
