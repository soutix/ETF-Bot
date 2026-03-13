// ─── Design tokens (dark theme) ─────────────────────────────────────────────
export const T = {
  bg0   : '#080C14',
  bg1   : '#0D1220',
  bg2   : '#1A2540',
  border: '#1E2940',
  text0 : '#E2E8F0',
  text1 : '#94A3B8',
  text2 : '#475569',
  green : '#10B981',
  red   : '#EF4444',
  blue  : '#3B82F6',
  amber : '#F59E0B',
  mono  : "'IBM Plex Mono', monospace",
};

const SPIN = `@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`;

export function Card({ title, children, style, accent }) {
  const borderTop = accent ? `2px solid ${accent}` : undefined;
  return (
    <div style={{ background: T.bg1, borderRadius: 10, border: `1px solid ${T.border}`,
                  borderTop, padding: 16, ...style }}>
      {title && (
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.8px',
                      color: T.text2, marginBottom: 12, fontWeight: 500 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 500, fontFamily: T.mono,
                    color: color || T.text0, lineHeight: 1.1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 10, color: T.text2, marginTop: 4, textTransform: 'uppercase',
                    letterSpacing: '.6px' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: T.text2, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Badge({ children, type = 'neutral' }) {
  const map = {
    neutral : { bg: '#1E2940',  text: '#64748B'  },
    success : { bg: '#064E3B',  text: '#34D399'  },
    danger  : { bg: '#450A0A',  text: '#FCA5A5'  },
    warning : { bg: '#451A03',  text: '#FCD34D'  },
    info    : { bg: '#1E3A5F',  text: '#60A5FA'  },
  };
  const c = map[type] || map.neutral;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                   fontSize: 9, fontWeight: 500, background: c.bg, color: c.text,
                   textTransform: 'uppercase', letterSpacing: '.5px' }}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 20, height: 20, border: `2px solid ${T.border}`,
                    borderTopColor: T.blue, borderRadius: '50%',
                    animation: 'spin .8s linear infinite' }} />
      <style>{SPIN}</style>
    </div>
  );
}

export function ErrorMsg({ msg }) {
  return (
    <div style={{ padding: 14, borderRadius: 8, background: '#1A0A0A',
                  border: `1px solid #3F1820`, color: '#FCA5A5', fontSize: 12 }}>
      ⚠ {msg}
    </div>
  );
}

// ─── Sparkline (SVG path from array of values) ───────────────────────────────
export function Sparkline({ values = [], color = T.blue, height = 40, fill = true }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300; const h = height;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const path = `M${pts.join(' L')}`;
  const area = `${path} L${w},${h} L0,${h}Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {fill && <path d={area} fill={color} fillOpacity=".12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

// ─── Alloc bar ────────────────────────────────────────────────────────────────
export function AllocBar({ symbol, pct: p, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontFamily: T.mono, fontSize: 11, color, width: 36 }}>{symbol}</span>
      <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(p * 100, 100)}%`, height: '100%',
                      background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text2, width: 38, textAlign: 'right' }}>
        {(p * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────
export function HeatCell({ symbol, change }) {
  const v = change ?? 0;
  const bg = v > 1.5 ? '#064E3B' : v > 0.3 ? '#065F46' : v > 0 ? '#052E16'
           : v > -0.3 ? '#1E2940' : v > -1 ? '#3F1820' : '#5C0B0B';
  const tc = v > 0 ? '#86EFAC' : v < -0.3 ? '#FCA5A5' : T.text2;
  return (
    <div style={{ background: bg, borderRadius: 5, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,.85)', marginBottom: 1 }}>{symbol}</div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: tc }}>
        {v >= 0 ? '+' : ''}{v.toFixed(1)}%
      </div>
    </div>
  );
}

// ─── Rebalance alert banner ───────────────────────────────────────────────────
export function RebalanceAlert({ nextDate, daysUntil }) {
  if (daysUntil > 2) return null;
  return (
    <div style={{ background: '#1C1400', border: `1px solid #78350F`, borderRadius: 8,
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 12, fontSize: 12 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B',
                    animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
      <style>{SPIN}</style>
      <span style={{ color: '#FCD34D', fontWeight: 500 }}>
        Rééquilibrage {daysUntil === 0 ? "aujourd'hui" : `dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`}
      </span>
      <span style={{ color: '#92400E' }}>{nextDate}</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const pct     = (v, d = 1)  => v == null ? '—' : `${(v * 100).toFixed(d)}%`;
export const usd     = (v, d = 0)  => v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const sign    = (v)         => v >= 0 ? '+' : '';
export const colorPN = (v)         => v == null ? undefined : v >= 0 ? T.green : T.red;
export const monoNum = (v)         => ({ fontFamily: T.mono, color: v == null ? T.text2 : v >= 0 ? T.green : T.red });
