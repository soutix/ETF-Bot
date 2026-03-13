import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Card, Spinner, ErrorMsg, Sparkline, T, usd, pct } from '../components/ui';

const DEFAULT = {
  momentumDays : 120,
  volDays      : 20,
  topK         : 3,
  targetVol    : 10,
  capital      : 10000,
  rebalance    : 'weekly',
};

// A/B param keys
const AB_PARAMS = [
  { key:'momentumDays', label:'Fenêtre momentum', min:30,  max:252, step:10,  unit:'j' },
  { key:'topK',         label:'Top K',            min:1,   max:5,   step:1,   unit:''  },
  { key:'targetVol',    label:'Cible de vol',     min:5,   max:25,  step:1,   unit:'%' },
  { key:'capital',      label:'Capital départ',   min:1000,max:100000,step:1000,unit:'$',prefix:true },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:T.bg1, border:`1px solid ${T.border}`, borderRadius:8,
                  padding:'8px 12px', fontSize:11 }}>
      <div style={{ color:T.text2, marginBottom:4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color:p.color, fontFamily:T.mono }}>
          {p.name}: {usd(p.value)}
        </div>
      ))}
    </div>
  );
};

export default function Backtest() {
  const { authFetch } = useAuth();

  // Scenario A (primary) & B (comparison)
  const [paramsA, setParamsA] = useState(DEFAULT);
  const [paramsB, setParamsB] = useState({ ...DEFAULT, momentumDays: 60, topK: 1 });
  const [showB, setShowB]     = useState(false);

  const [results, setResults]     = useState(null);
  const [resultsB, setResultsB]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [activeTab, setActiveTab] = useState('curve'); // 'curve' | 'trades'

  const run = useCallback(async (params, isB = false) => {
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({
        momentumDays : params.momentumDays,
        volDays      : params.volDays,
        topK         : params.topK,
        targetVol    : params.targetVol / 100,
        capital      : params.capital,
        rebalance    : params.rebalance,
      });
      const r = await authFetch(`/api/backtest?${q}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (isB) setResultsB(j); else setResults(j);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [authFetch]);

  const runBoth = () => {
    run(paramsA, false);
    if (showB) run(paramsB, true);
  };

  const chartData = (() => {
    if (!results?.equity) return [];
    return results.equity.map((pt, i) => ({
      date      : pt.date,
      strategie : pt.equity,
      benchmark : pt.benchmark,
      ...(resultsB?.equity?.[i] ? { strategieB: resultsB.equity[i].equity } : {}),
    }));
  })();

  const stats = results?.stats || {};
  const statsB = resultsB?.stats || {};

  const Slider = ({ params, setParams, p }) => (
    <div>
      <div style={{ fontSize:10, color:T.text2, marginBottom:4 }}>{p.label}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input type="range" min={p.min} max={p.max} step={p.step}
          value={params[p.key]}
          onChange={e => setParams(pr => ({ ...pr, [p.key]: Number(e.target.value) }))}
          style={{ flex:1, accentColor:T.blue }} />
        <span style={{ fontFamily:T.mono, fontSize:12, color:T.text0, width:52, textAlign:'right' }}>
          {p.prefix ? `$${params[p.key].toLocaleString()}` : `${params[p.key]}${p.unit}`}
        </span>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:15, fontWeight:500, color:T.text0 }}>Backtest</span>
        <span style={{ fontSize:10, color:T.text2, background:T.bg2, padding:'2px 8px',
                       borderRadius:4 }}>Dual Momentum + Vol Targeting</span>
        {results && (
          <span style={{ marginLeft:'auto', fontSize:11, color:T.text2 }}>
            {stats.years?.toFixed(1)} ans simulées · {stats.tradeCount} trades
          </span>
        )}
      </div>

      {/* Params */}
      <Card title="Paramètres de simulation" style={{ marginBottom:10 }}>
        <div style={{ display:'grid', gridTemplateColumns: showB ? '1fr 1fr' : '1fr', gap:16 }}>
          {/* Scenario A */}
          <div>
            {showB && <div style={{ fontSize:10, color:T.blue, marginBottom:8, fontFamily:T.mono }}>
              ─ Scénario A</div>}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:10 }}>
              {AB_PARAMS.map(p => <Slider key={p.key} params={paramsA} setParams={setParamsA} p={p} />)}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:10, color:T.text2 }}>Rééquilibrage :</span>
              {['weekly','monthly'].map(r => (
                <button key={r} onClick={() => setParamsA(p => ({ ...p, rebalance: r }))}
                  style={{ padding:'3px 10px', borderRadius:5, fontSize:10, cursor:'pointer',
                           fontFamily:'inherit', border:`1px solid ${T.border}`,
                           background: paramsA.rebalance === r ? '#1E3A5F' : 'transparent',
                           color: paramsA.rebalance === r ? '#60A5FA' : T.text2 }}>
                  {r === 'weekly' ? 'Hebdo' : 'Mensuel'}
                </button>
              ))}
            </div>
          </div>

          {/* Scenario B */}
          {showB && (
            <div style={{ borderLeft:`1px solid ${T.border}`, paddingLeft:16 }}>
              <div style={{ fontSize:10, color:'#A78BFA', marginBottom:8, fontFamily:T.mono }}>
                ─ Scénario B</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:10 }}>
                {AB_PARAMS.map(p => <Slider key={p.key} params={paramsB} setParams={setParamsB} p={p} />)}
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ fontSize:10, color:T.text2 }}>Rééquilibrage :</span>
                {['weekly','monthly'].map(r => (
                  <button key={r} onClick={() => setParamsB(p => ({ ...p, rebalance: r }))}
                    style={{ padding:'3px 10px', borderRadius:5, fontSize:10, cursor:'pointer',
                             fontFamily:'inherit', border:`1px solid ${T.border}`,
                             background: paramsB.rebalance === r ? '#2D1F5E' : 'transparent',
                             color: paramsB.rebalance === r ? '#A78BFA' : T.text2 }}>
                    {r === 'weekly' ? 'Hebdo' : 'Mensuel'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, marginTop:14, alignItems:'center' }}>
          <button onClick={() => setShowB(s => !s)}
            style={{ padding:'6px 14px', borderRadius:6, border:`1px solid ${T.border}`,
                     background:'transparent', color: showB ? '#A78BFA' : T.text2,
                     fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
            {showB ? '✕ Retirer scénario B' : '+ Comparer scénario B'}
          </button>
          <div style={{ flex:1 }} />
          <button onClick={runBoth} disabled={loading}
            style={{ padding:'8px 22px', borderRadius:7, border:'none',
                     background: loading ? T.bg2 : '#1D4ED8', color:'white',
                     fontSize:12, fontWeight:500, cursor: loading ? 'not-allowed' : 'pointer',
                     fontFamily:'inherit' }}>
            {loading ? '⏳ Calcul…' : '▶ Lancer le backtest'}
          </button>
        </div>
      </Card>

      {err && <ErrorMsg msg={err} />}
      {loading && <Spinner />}

      {results && !loading && (
        <>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${showB ? 2 : 1},1fr)`, gap:8, marginBottom:10 }}>
            {[[stats,'A',T.green], ...(showB && resultsB ? [[statsB,'B','#A78BFA']] : [])].map(([st, lbl, c]) => (
              <div key={lbl} style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
                {showB && <div style={{ gridColumn:'1/-1', fontSize:9, color:c, fontFamily:T.mono, marginBottom:-4 }}>
                  ─ Scénario {lbl}</div>}
                {[
                  ['CAGR',      `${(st.cagr*100).toFixed(2)}%`,    st.cagr  >= 0 ? T.green : T.red],
                  ['CAGR SPY',  `${(st.cagrBenchmark*100).toFixed(2)}%`, T.text1],
                  ['Alpha',     `${st.alpha >= 0 ? '+' : ''}${(st.alpha*100).toFixed(2)}%`, st.alpha >= 0 ? T.green : T.red],
                  ['Sharpe',    (st.sharpe||0).toFixed(2),           T.text0],
                  ['Max DD',    `${(st.maxDrawdown*100).toFixed(1)}%`, T.red],
                ].map(([l, v, col]) => (
                  <Card key={l} accent={col === T.green ? T.green : col === T.red ? T.red : undefined}>
                    <div style={{ fontSize:9, color:T.text2, textTransform:'uppercase', letterSpacing:'.8px', marginBottom:5 }}>{l}</div>
                    <div style={{ fontFamily:T.mono, fontSize:18, fontWeight:500, color:col }}>{v}</div>
                  </Card>
                ))}
              </div>
            ))}
          </div>

          {/* Sub-tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:10 }}>
            {[['curve','Courbe de performance'],['dd','Drawdown'],['trades','Journal des trades']].map(([id, lbl]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer',
                         fontFamily:'inherit', border:`1px solid ${T.border}`,
                         background: activeTab === id ? '#1E3A5F' : 'transparent',
                         color: activeTab === id ? '#60A5FA' : T.text2 }}>
                {lbl}
              </button>
            ))}
          </div>

          {activeTab === 'curve' && (
            <Card title="Courbe de performance" style={{ marginBottom:10 }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top:4, right:4, left:4, bottom:4 }}>
                  <XAxis dataKey="date" tick={{ fontSize:9, fill:T.text2, fontFamily:T.mono }}
                         tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                         tick={{ fontSize:9, fill:T.text2, fontFamily:T.mono }}
                         tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="strategie" stroke="#27AE60"
                        strokeWidth={2} dot={false} name="Stratégie A" />
                  {showB && resultsB && (
                    <Line type="monotone" dataKey="strategieB" stroke="#A78BFA"
                          strokeWidth={2} dot={false} name="Stratégie B" />
                  )}
                  <Line type="monotone" dataKey="benchmark" stroke="#95A5A6"
                        strokeWidth={1.5} dot={false} strokeDasharray="5 4" name="SPY B&H" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {activeTab === 'dd' && (
            <Card title="Drawdown" style={{ marginBottom:10 }}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData.map(d => ({ ...d, dd: stats.drawdownSeries?.[chartData.indexOf(d)] ?? 0 }))}>
                  <XAxis dataKey="date" tick={{ fontSize:9, fill:T.text2 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize:9, fill:T.text2 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="dd" stroke="#E74C3C" fill="#FADBD8"
                        strokeWidth={1.5} dot={false} name="Drawdown" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {activeTab === 'trades' && (
            <Card title="Journal des trades">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ color:T.text2, borderBottom:`1px solid ${T.border}` }}>
                    {['Date','Actif','Action','Qté','Prix','Valeur','Raison'].map((h,i) => (
                      <th key={h} style={{ padding:'4px 8px', fontWeight:400, textAlign: i >= 2 ? 'right' : 'left',
                                           ...(i === 3 && { textAlign:'center' }), ...(i === 6 && { textAlign:'left' }) }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(results.trades || []).slice(0, 40).map((t, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid #0F1629` }}>
                      <td style={{ padding:'6px 8px', fontFamily:T.mono, color:T.text2, fontSize:10 }}>{t.date}</td>
                      <td style={{ padding:'6px 8px', fontFamily:T.mono, fontWeight:500, color:T.text1 }}>{t.symbol}</td>
                      <td style={{ padding:'6px 8px', textAlign:'right' }}>
                        <span style={{ background: t.side === 'buy' ? '#064E3B' : '#450A0A',
                                       color: t.side === 'buy' ? '#34D399' : '#FCA5A5',
                                       padding:'1px 7px', borderRadius:4, fontSize:9,
                                       textTransform:'uppercase' }}>
                          {t.side === 'buy' ? 'Achat' : 'Vente'}
                        </span>
                      </td>
                      <td style={{ padding:'6px 8px', textAlign:'center', fontFamily:T.mono, color:T.text1 }}>
                        {t.qty?.toFixed(4)}
                      </td>
                      <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:T.mono, color:T.text1 }}>
                        {usd(t.price, 2)}
                      </td>
                      <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:T.mono, color:T.text0 }}>
                        {usd(t.value)}
                      </td>
                      <td style={{ padding:'6px 8px', color:T.text2, fontSize:10 }}>{t.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(results.trades || []).length > 40 && (
                <div style={{ textAlign:'center', padding:'10px 0', fontSize:11, color:T.text2 }}>
                  + {results.trades.length - 40} trades supplémentaires
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {!results && !loading && (
        <Card>
          <div style={{ textAlign:'center', padding:'32px 0', color:T.text2, fontSize:13 }}>
            Configure les paramètres et lance le backtest pour voir les résultats.
          </div>
        </Card>
      )}
    </div>
  );
}
