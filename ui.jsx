// src/components/Card.jsx
export function Card({ title, children, style }) {
  return (
    <div style={{ background:'var(--color-background-primary)', borderRadius:12,
                  border:'1px solid var(--color-border-tertiary)', padding:20,
                  ...style }}>
      {title && <h3 style={{ margin:'0 0 16px', fontWeight:500, fontSize:15 }}>{title}</h3>}
      {children}
    </div>
  );
}

// Stat block — large number + label
export function Stat({ label, value, sub, color }) {
  return (
    <div style={{ padding:'4px 0' }}>
      <div style={{ fontSize:22, fontWeight:500, color: color || 'var(--color-text-primary)',
                    lineHeight:1.2 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:1 }}>{sub}</div>}
    </div>
  );
}

// Inline badge
export function Badge({ children, type = 'neutral' }) {
  const colors = {
    neutral  : { bg:'var(--color-background-secondary)',   text:'var(--color-text-secondary)'  },
    success  : { bg:'var(--color-background-success)',     text:'var(--color-text-success)'    },
    danger   : { bg:'var(--color-background-danger)',      text:'var(--color-text-danger)'     },
    warning  : { bg:'var(--color-background-warning)',     text:'var(--color-text-warning)'    },
    info     : { bg:'var(--color-background-info)',        text:'var(--color-text-info)'       },
  };
  const c = colors[type] || colors.neutral;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:99,
                   fontSize:11, fontWeight:500, background:c.bg, color:c.text }}>
      {children}
    </span>
  );
}

// Loading spinner
export function Spinner({ size = 20 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
      <div style={{ width:size, height:size, border:'2px solid var(--color-border-tertiary)',
                    borderTopColor:'var(--color-text-secondary)', borderRadius:'50%',
                    animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Error block
export function ErrorMsg({ msg }) {
  return (
    <div style={{ padding:16, borderRadius:8, background:'var(--color-background-danger)',
                  color:'var(--color-text-danger)', fontSize:13 }}>
      ⚠️ {msg}
    </div>
  );
}

// Formatted number helpers
export function pct(v, digits = 1)  { return v == null ? '—' : `${(v * 100).toFixed(digits)}%`; }
export function usd(v, digits = 0)  { return v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`; }
export function sign(v)             { return v >= 0 ? '+' : ''; }
export function colorPN(v)          { return v == null ? undefined : v >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)'; }
