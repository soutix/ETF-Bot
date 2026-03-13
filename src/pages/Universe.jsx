import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, Spinner, ErrorMsg, HeatCell, Badge, T } from '../components/ui';

const COLORS_BY_STATUS = {
  selected : { bg:'#064E3B', text:'#34D399', label:'SÉLECTIONNÉ' },
  eligible : { bg:'#1E3A5F', text:'#60A5FA', label:'Éligible'    },
  below    : { bg:'#1A1A2E', text:'#475569', label:'Sous BIL'    },
};

function statusOf(score, rfRate, rank, topK) {
  if (score < rfRate)         return 'below';
  if (rank !== null && rank < topK) return 'selected';
  return 'eligible';
}

export default function Universe() {
  const { authFetch } = useAuth();
  const [data, setData]       = useState(null);
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await authFetch('/api/universe');
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (err)     return <ErrorMsg msg={err} />;

  const scores  = data?.scores  || [];
  const rfRate  = data?.rfRate  || 0.0528;
  const topK    = data?.topK    || 3;
  const sorted  = [...scores].sort((a, b) => b.momentum - a.momentum);
  const eligible = sorted.filter(s => s.momentum >= rfRate);
  const selected = eligible.slice(0, topK);
  const selectedSyms = new Set(selected.map(s => s.symbol));

  const withRank = sorted.map(s => ({
    ...s,
    rank: selectedSyms.has(s.symbol) ? selected.findIndex(x => x.symbol === s.symbol) : null,
    status: statusOf(s.momentum, rfRate, selectedSyms.has(s.symbol) ? 0 : null, topK),
  }));
  // fix rank properly
  const final = sorted.map((s, i) => {
    const rank = selectedSyms.has(s.symbol) ? selected.findIndex(x => x.symbol === s.symbol) : null;
    return { ...s, rank, status: statusOf(s.momentum, rfRate, rank, topK) };
  });

  const maxMom = Math.max(...final.map(s => Math.abs(s.momentum)), rfRate * 1.5);

  // Mini heatmap data (mock daily changes if not provided)
  const heatData = final.slice(0, 8).map(s => ({
    s: s.symbol.replace('-USD',''),
    c: s.dailyChange ?? (s.momentum > 0 ? 0.5 : -0.5),
  }));

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:15, fontWeight:500, color:T.text0 }}>Univers ETF</span>
        <Badge type="info">Momentum {data?.momentumDays || 120}j</Badge>
        <Badge type="success">Top {topK} sélectionnés</Badge>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:10, color:T.text2 }}>
          Dernier scan: {data?.lastUpdated || 'il y a 2h'}
        </span>
        <button onClick={load} style={{ padding:'4px 10px', borderRadius:6,
          border:`1px solid ${T.border}`, background:'transparent', color:T.text2,
          fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
          ↺ Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
        {[
          { label:'Total ETF', value:final.length, color:T.text0 },
          { label:'Éligibles (> BIL)', value:eligible.length, color:T.green, sub:`Battent ${(rfRate*100).toFixed(2)}%` },
          { label:'Sélectionnés', value:selected.length, color:T.blue },
          { label:'Safe harbor', value:selected.length === 0 ? 'ACTIF' : 'Inactif',
            color: selected.length === 0 ? T.amber : T.text2,
            sub: selected.length === 0 ? 'Repli sur BIL' : 'Marché haussier' },
        ].map(k => (
          <Card key={k.label} accent={k.color === T.green ? T.green : k.color === T.blue ? T.blue : undefined}>
            <div style={{ fontSize:9, color:T.text2, textTransform:'uppercase', letterSpacing:'.8px', marginBottom:5 }}>{k.label}</div>
            <div style={{ fontSize:20, fontFamily:T.mono, fontWeight:500, color:k.color }}>{k.value}</div>
            {k.sub && <div style={{ fontSize:10, color:T.text2, marginTop:3 }}>{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Bar chart */}
      <Card title={`Scores momentum vs taux sans risque BIL (${(rfRate*100).toFixed(2)}%)`}
            style={{ marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:90, marginBottom:6 }}>
          {final.map(s => {
            const mom  = s.momentum;
            const h    = Math.max(4, Math.abs(mom / maxMom) * 80);
            const st   = s.status;
            const barC = st === 'selected' ? (ALLOC_COLORS[s.symbol.replace('-USD','')] || T.green)
                       : st === 'eligible' ? '#1E3A5F' : '#3F1820';
            const lblC = mom >= rfRate ? T.text1 : T.red;
            return (
              <div key={s.symbol} style={{ flex:1, display:'flex', flexDirection:'column',
                                           alignItems:'center', gap:2 }}>
                <div style={{ fontFamily:T.mono, fontSize:8, color:lblC }}>
                  {mom >= 0 ? '+' : ''}{(mom*100).toFixed(0)}%
                </div>
                <div style={{ width:'100%', height:h, background:barC,
                              borderRadius:'3px 3px 0 0', opacity: st === 'below' ? 0.6 : 1 }} />
                <div style={{ fontFamily:T.mono, fontSize:8, color: st === 'below' ? T.text2 : T.text1 }}>
                  {s.symbol.replace('-USD','')}
                </div>
              </div>
            );
          })}
        </div>
        {/* RF line indicator */}
        <div style={{ borderTop:`1px dashed ${T.red}`, opacity:.5, marginBottom:6 }} />
        <div style={{ display:'flex', gap:14, fontSize:9 }}>
          <span style={{color:T.green}}>■ Sélectionné</span>
          <span style={{color:'#1E3A5F'}}>■ Éligible</span>
          <span style={{color:'#3F1820'}}>■ Sous BIL</span>
          <span style={{color:T.red}}>— Taux sans risque</span>
        </div>
      </Card>

      {/* Table */}
      <Card title="Tableau complet">
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ color:T.text2, borderBottom:`1px solid ${T.border}` }}>
              {['Symbole','Nom','Momentum','Vol 20j','Statut','Poids cible'].map((h,i) => (
                <th key={h} style={{ padding:'4px 8px', fontWeight:400,
                                     textAlign: i >= 2 ? 'right' : 'left',
                                     ...(i === 4 && { textAlign:'center' }) }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {final.map(s => {
              const sym  = s.symbol.replace('-USD','');
              const st   = s.status;
              const col  = COLORS_BY_STATUS[st];
              const symC = st === 'selected' ? (ALLOC_COLORS[sym] || T.green) : T.text2;
              return (
                <tr key={s.symbol}
                  style={{ borderBottom:`1px solid #0F1629`,
                           background: st === 'selected' ? '#0A0E14' : 'transparent' }}>
                  <td style={{ padding:'7px 8px', fontFamily:T.mono, fontWeight:500, color:symC }}>{sym}</td>
                  <td style={{ padding:'7px 8px', color:T.text1 }}>{s.name || sym}</td>
                  <td style={{ padding:'7px 8px', textAlign:'right', fontFamily:T.mono,
                               color: s.momentum >= rfRate ? T.green : T.red }}>
                    {s.momentum >= 0 ? '+' : ''}{(s.momentum*100).toFixed(1)}%
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'right', fontFamily:T.mono, color:T.text2 }}>
                    {s.vol ? `${(s.vol*100).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'center' }}>
                    <span style={{ background:col.bg, color:col.text, fontSize:9, fontWeight:500,
                                   padding:'2px 7px', borderRadius:4, textTransform:'uppercase',
                                   letterSpacing:'.4px' }}>
                      {col.label}
                    </span>
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'right', fontFamily:T.mono,
                               color: st === 'selected' ? T.text0 : T.text2 }}>
                    {st === 'selected' && s.targetWeight != null
                      ? `${(s.targetWeight*100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const ALLOC_COLORS = { GLD:'#F59E0B', GSG:'#3B82F6', XLE:'#10B981', IEF:'#A78BFA',
                       GS:'#F472B6',  EEM:'#FB923C', SPY:'#60A5FA' };
