/* global React */
const { useState, useEffect } = React;

/* ============================================================
   Shared primitives
   ============================================================ */

const Brand = ({ size = 22, ink = "#1A1611", accent = "#B5664E" }) => (
  <div style={{ fontFamily: 'var(--display)', fontSize: size, lineHeight: 1, letterSpacing: '-0.01em', color: ink }}>
    Convive<span style={{ fontStyle: 'italic', color: accent }}> &amp; </span>Connect
  </div>
);

const StatusBar = ({ time = "9:41", dark = false }) => (
  <div className="status-bar" style={{ color: dark ? '#F4EFE6' : '#1A1611' }}>
    <span style={{ fontFamily: 'var(--mono)' }}>{time}</span>
    <div className="notch" style={{ background: dark ? '#F4EFE6' : '#1A1611' }} />
    <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="0.5" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
      <svg width="22" height="11" viewBox="0 0 22 11" fill="none"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="14" height="7" rx="1.5" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
    </span>
  </div>
);

const PhoneFrame = ({ children, dark = false, width = 390, height = 844 }) => (
  <div style={{
    width, height,
    background: dark ? '#1A1611' : '#FAF7F1',
    borderRadius: 48,
    border: '1px solid rgba(26,22,17,0.18)',
    boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 40px 80px -32px rgba(26,22,17,0.30)',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  }}>
    <StatusBar dark={dark} />
    <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
  </div>
);

/* Icons (line icons, refined) */
const Icon = ({ name, size = 18, color = "currentColor", strokeWidth = 1.5 }) => {
  const paths = {
    home: "M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5",
    bell: "M6 8a6 6 0 1112 0c0 5 2 7 2 7H4s2-2 2-7M9 19a3 3 0 006 0",
    arrow: "M5 12h14M13 5l7 7-7 7",
    arrowSm: "M5 12h12M11 6l6 6-6 6",
    plus: "M12 5v14M5 12h14",
    chevron: "M9 6l6 6-6 6",
    spark: "M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24",
    coin: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    calendar: "M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 2v4M16 2v4",
    chat: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
    store: "M3 7l1.5-4h15L21 7M3 7v13a1 1 0 001 1h16a1 1 0 001-1V7M3 7h18M8 11a2 2 0 104 0 2 2 0 104 0",
    droplet: "M12 2.5l5.5 7.5a6.5 6.5 0 11-11 0L12 2.5z",
    bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
    car: "M5 17a2 2 0 100 4 2 2 0 000-4zM19 17a2 2 0 100 4 2 2 0 000-4zM3 17V11l2-5h14l2 5v6M3 11h18",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    pool: "M2 18s1.5-2 4-2 4 2 6 2 4-2 6-2 4 2 4 2M2 14s1.5-2 4-2 4 2 6 2 4-2 6-2 4 2 4 2M6 7l4-4 8 8",
    wrench: "M14.7 6.3a4 4 0 11-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 015.4-5.4l-2.7 2.7-1.5-1.5 2.4-2.5z",
    receipt: "M5 2h14v20l-3-2-3 2-3-2-3 2-2-2V2zM9 7h6M9 11h6M9 15h4",
    check: "M5 12l5 5 9-11",
    pin: "M12 22s8-7.58 8-13a8 8 0 10-16 0c0 5.42 8 13 8 13zM12 11a2 2 0 100-4 2 2 0 000 4z",
    mic: "M12 2a3 3 0 013 3v7a3 3 0 11-6 0V5a3 3 0 013-3zM19 10v2a7 7 0 11-14 0v-2M12 19v3",
    send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
    search: "M11 2a9 9 0 100 18 9 9 0 000-18zM21 21l-5.6-5.6",
    filter: "M3 4h18l-7 9v6l-4 2v-8L3 4z",
    leaf: "M3 21c0-9 6-15 18-18-1 12-7 17-15 18-2 0-3-1-3-3M3 21l9-9",
    menu: "M3 6h18M3 12h18M3 18h18",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    sparkles: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14zM5 5l.5 1.5L7 7l-1.5.5L5 9l-.5-1.5L3 7l1.5-.5L5 5z",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
};

/* ============================================================
   1. RESIDENT HOME — premium dashboard
   ============================================================ */

function ResidentHome({ tweaks }) {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 22px 0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }} className="no-scrollbar">

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--ink)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 18, fontStyle: 'italic' }}>c</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', fontWeight: 500 }}>Edificio Aurelia</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>Torre B · 12C</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <Icon name="bell" size={16} />
              <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: 999, background: 'var(--copper)' }} />
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
              MA
            </button>
          </div>
        </div>

        {/* Greeting — editorial */}
        <div style={{ marginBottom: 28 }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 12 }}>Martes, 25 de mayo</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 46, fontWeight: 400, lineHeight: 1.02, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Buenos días,<br />
            <span style={{ fontStyle: 'italic', color: 'var(--copper)' }}>Martina.</span>
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5, maxWidth: 290 }}>
            Tu comunidad está al día. Tienes <span style={{ color: 'var(--ink)' }}>una reserva</span> esta semana y <span style={{ color: 'var(--ink)' }}>nada pendiente</span> por pagar.
          </p>
        </div>

        {/* Featured card — pending common expense */}
        <div style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          borderRadius: 22,
          padding: 22,
          marginBottom: 14,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -20, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(181,102,78,0.35) 0%, transparent 60%)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, position: 'relative' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.55)', marginBottom: 10 }}>Gasto común</div>
              <div style={{ fontSize: 13, color: 'rgba(244,239,230,0.75)' }}>Mayo 2026 · vence en 8 días</div>
            </div>
            <span className="tag tag-filled" style={{ background: 'rgba(244,239,230,0.10)', color: 'var(--paper)', borderColor: 'transparent' }}>
              <span className="dot" style={{ background: 'var(--copper-soft)' }} /> Por pagar
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20, position: 'relative' }}>
            <span style={{ fontSize: 14, color: 'rgba(244,239,230,0.6)' }}>$</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 54, lineHeight: 1, letterSpacing: '-0.02em' }}>187.420</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.5)', marginLeft: 6 }}>CLP</span>
          </div>
          <button style={{ width: '100%', padding: '14px', borderRadius: 14, background: 'var(--copper)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative', cursor: 'pointer' }}>
            Pagar ahora <Icon name="arrowSm" size={16} color="#fff" />
          </button>
        </div>

        {/* Quick access grid */}
        <div className="uppercase-eyebrow" style={{ marginTop: 22, marginBottom: 12 }}>Para hoy</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {/* Reservation */}
          <div style={{ background: 'var(--paper-warm)', border: '1px solid var(--line)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--sage-tint)', display: 'grid', placeItems: 'center', color: 'var(--sage)' }}>
                <Icon name="pool" size={14} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Reserva</div>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.05, marginBottom: 4 }}>Piscina</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-muted)' }}>Sáb · 11:00 – 12:30</div>
          </div>

          {/* Water */}
          <div style={{ background: 'var(--paper-warm)', border: '1px solid var(--line)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(96,165,250,0.12)', display: 'grid', placeItems: 'center', color: '#3B82F6' }}>
                <Icon name="droplet" size={14} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Consumo agua</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.05 }}>8.4</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-muted)' }}>m³</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--sage)', marginTop: 4 }}>−12% vs abril</div>
          </div>
        </div>

        {/* Announcement */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--copper-tint)', display: 'grid', placeItems: 'center', color: 'var(--copper)', flexShrink: 0 }}>
            <Icon name="bell" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="tag" style={{ color: 'var(--copper)', borderColor: 'rgba(181,102,78,0.30)', padding: '2px 8px', fontSize: 10 }}>Asamblea</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>hace 2h</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.35, fontWeight: 500 }}>Asamblea ordinaria de copropietarios</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4, lineHeight: 1.4 }}>Sáb 30 de mayo, 19:00 — Salón comunitario.</div>
          </div>
          <Icon name="chevron" size={16} color="var(--ink-faint)" />
        </div>

        {/* Bottom CoCo prompt */}
        <div style={{ marginTop: 'auto', marginBottom: 16, position: 'sticky', bottom: 0 }}>
          <button style={{
            width: '100%',
            background: 'var(--paper)',
            border: '1px solid var(--line-strong)',
            borderRadius: 999,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 24px 48px -28px rgba(26,22,17,0.18)',
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--ink)', display: 'grid', placeItems: 'center', color: 'var(--copper-soft)' }}>
              <Icon name="sparkles" size={12} color="var(--copper-soft)" />
            </div>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--ink-muted)' }}>Pregúntale a Coco…</span>
            <Icon name="mic" size={16} color="var(--ink-tertiary)" />
          </button>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   2. EXPENSES — Gasto común detail
   ============================================================ */

function ExpensesScreen() {
  const months = [
    { m: 'Ene', v: 142, paid: true },
    { m: 'Feb', v: 168, paid: true },
    { m: 'Mar', v: 155, paid: true },
    { m: 'Abr', v: 178, paid: true },
    { m: 'May', v: 187, paid: false },
  ];
  const max = 200;

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 22px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingTop: 6 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} color="var(--ink)" strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gastos comunes</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} />
          </button>
        </div>

        {/* Period */}
        <div className="uppercase-eyebrow" style={{ marginBottom: 8 }}>Mayo 2026</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 42, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em' }}>
          Tu cuenta <span style={{ fontStyle: 'italic' }}>del mes</span>
        </h1>

        {/* Amount */}
        <div style={{ marginTop: 24, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginBottom: 8 }}>Total a pagar antes del 02 jun</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 18, color: 'var(--ink-muted)' }}>$</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>187.420</span>
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ marginTop: 20, marginBottom: 24 }}>
          {[
            { label: 'Administración', amount: 42500 },
            { label: 'Agua caliente comunitaria', amount: 38900 },
            { label: 'Electricidad espacios comunes', amount: 28200 },
            { label: 'Ascensores y mantención', amount: 31700 },
            { label: 'Conserjería 24/7', amount: 38900 },
            { label: 'Fondo de reserva', amount: 7220 },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < 5 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{row.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink)' }}>${row.amount.toLocaleString('es-CL')}</div>
            </div>
          ))}
        </div>

        {/* 6-month chart */}
        <div className="uppercase-eyebrow" style={{ marginBottom: 12 }}>Histórico · últimos 5 meses</div>
        <div style={{ background: 'var(--paper-warm)', borderRadius: 18, padding: '20px 18px 14px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 100, marginBottom: 10 }}>
            {months.map((m, i) => {
              const c = m.paid ? '#B5664E' : '#E0B23C';
              const fold = (hex, f) => {
                const n = parseInt(hex.slice(1), 16);
                const rr = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
                return `rgb(${rr},${g},${b})`;
              };
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '72%',
                    height: `${(m.v / max) * 100}%`,
                    display: 'flex',
                    borderRadius: '3px 3px 0 0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 5px -2px rgba(26,22,17,0.18)',
                  }}>
                    <div style={{ width: '50%', height: '100%', background: c }} />
                    <div style={{ width: '50%', height: '100%', background: fold(c, 0.66) }} />
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>{m.m}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Promedio</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>$166.000</div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div style={{ marginTop: 'auto', paddingTop: 24, paddingBottom: 12 }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Pagar $187.420</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--ink-tertiary)' }}>
            Webpay · transferencia · cuotas con Klap
          </div>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   3. AMENITIES — premium booking
   ============================================================ */

function AmenitiesScreen() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const dates = [26, 27, 28, 29, 30, 31, 1];
  const slots = [
    { time: '09:00 – 10:30', status: 'taken' },
    { time: '11:00 – 12:30', status: 'open' },
    { time: '13:00 – 14:30', status: 'open' },
    { time: '15:00 – 16:30', status: 'selected' },
    { time: '17:00 – 18:30', status: 'taken' },
    { time: '19:00 – 20:30', status: 'open' },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingTop: 6 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Espacios comunes</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="calendar" size={16} />
          </button>
        </div>

        {/* Hero image — striped placeholder */}
        <div style={{ margin: '0 22px 18px', height: 200, borderRadius: 20, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #B5664E 0%, #8E4A35 100%)',
        }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 18px, rgba(0,0,0,0.06) 18px, rgba(0,0,0,0.06) 20px)' }} />
          <div style={{ position: 'absolute', top: 14, left: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em' }}>IMG · ROOFTOP POOL</div>
          <div style={{ position: 'absolute', bottom: 16, left: 18 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Aforo 12 · Piscina</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: '#fff', lineHeight: 1.05, marginTop: 4 }}>Terraza Aurelia</div>
          </div>
          <div style={{ position: 'absolute', bottom: 16, right: 16, padding: '6px 10px', background: 'rgba(255,255,255,0.92)', borderRadius: 999, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
            Piso 18
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '0 22px', display: 'flex', gap: 24, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>Disponibilidad</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>87<span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>%</span></div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>Tarifa</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>Gratis</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>Mín · máx</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1.4, marginTop: 4 }}>1h – 3h</div>
          </div>
        </div>

        {/* Date strip */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 12 }}>Selecciona día</div>
        <div style={{ padding: '0 22px', display: 'flex', gap: 6, marginBottom: 22 }}>
          {days.map((d, i) => (
            <div key={i} style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 14,
              textAlign: 'center',
              background: i === 4 ? 'var(--ink)' : 'transparent',
              color: i === 4 ? 'var(--paper)' : 'var(--ink)',
              border: i === 4 ? 'none' : '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 10, opacity: i === 4 ? 0.6 : 1, color: i === 4 ? 'var(--paper)' : 'var(--ink-tertiary)' }}>{d}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 15, marginTop: 4 }}>{dates[i]}</div>
            </div>
          ))}
        </div>

        {/* Slots */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 12 }}>Bloques disponibles</div>
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map((s, i) => {
            const isSel = s.status === 'selected';
            const isTaken = s.status === 'taken';
            return (
              <div key={i} style={{
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid',
                borderColor: isSel ? 'var(--copper)' : 'var(--line)',
                background: isSel ? 'var(--copper-tint)' : (isTaken ? 'transparent' : 'var(--paper-warm)'),
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: isTaken ? 0.45 : 1,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink)' }}>{s.time}</div>
                <div style={{ fontSize: 11, color: isSel ? 'var(--copper-deep)' : (isTaken ? 'var(--ink-tertiary)' : 'var(--sage)'), fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isSel ? 'Seleccionado' : (isTaken ? 'Reservado' : (<><span className="dot" /> Libre</>))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div style={{ padding: '24px 22px 16px' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Confirmar viernes 30, 15:00</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   4. COCO CHAT — premium AI assistant
   ============================================================ */

function CocoChatScreen() {
  return (
    <PhoneFrame dark>
      <div style={{ padding: '14px 0 0', height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--paper)' }}>

        {/* Header */}
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, paddingTop: 6 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(244,239,230,0.12)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} color="var(--paper)" strokeWidth={2} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--sage)' }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>Coco</div>
            <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.5)' }}>· en línea</div>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(244,239,230,0.12)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} color="var(--paper)" />
          </button>
        </div>

        {/* Editorial intro */}
        <div style={{ padding: '0 22px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>Asistente comunitario</div>
          <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1.05, fontWeight: 400, letterSpacing: '-0.02em' }}>
            ¿En qué te <span style={{ fontStyle: 'italic', color: 'var(--copper-soft)' }}>ayudo</span> hoy, Martina?
          </h2>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, padding: '0 22px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }} className="no-scrollbar">

          {/* User message */}
          <div style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '12px 16px', background: 'rgba(244,239,230,0.10)', borderRadius: 18, borderTopRightRadius: 6, fontSize: 14, lineHeight: 1.45 }}>
            ¿Cuánto gasté en agua los últimos tres meses?
          </div>

          {/* Coco response */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--copper)', display: 'grid', placeItems: 'center' }}>
                <Icon name="sparkles" size={11} color="#fff" />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(244,239,230,0.55)', fontFamily: 'var(--mono)' }}>Coco</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(244,239,230,0.95)', marginBottom: 14 }}>
              Tu consumo ha bajado de forma constante. Aquí lo veo desde marzo:
            </div>

            {/* Embedded card — chart */}
            <div style={{ background: 'rgba(244,239,230,0.05)', border: '1px solid rgba(244,239,230,0.10)', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Agua · 3 meses</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>27.8 m³</div>
                </div>
                <div style={{ padding: '4px 10px', background: 'rgba(110,130,104,0.18)', borderRadius: 999, fontSize: 11, color: 'var(--sage-soft)' }}>↓ 22%</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 56 }}>
                {[10.8, 8.6, 8.4].map((v, i) => {
                  const c = '#5B97D6';
                  const fold = (hex, f) => {
                    const n = parseInt(hex.slice(1), 16);
                    const rr = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
                    return `rgb(${rr},${g},${b})`;
                  };
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: '64%', height: `${(v / 12) * 100}%`, display: 'flex', borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                        <div style={{ width: '50%', height: '100%', background: c }} />
                        <div style={{ width: '50%', height: '100%', background: fold(c, 0.72) }} />
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(244,239,230,0.5)' }}>{['Mar', 'Abr', 'May'][i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(244,239,230,0.75)', marginTop: 14 }}>
              Tu hogar está <span style={{ fontStyle: 'italic', fontFamily: 'var(--display)', color: 'var(--paper)' }}>30% bajo</span> el promedio del edificio.
            </div>
          </div>

          {/* Suggestion chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {['Comparar con vecinos', 'Programar lectura', 'Tips de ahorro'].map((c, i) => (
              <div key={i} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(244,239,230,0.12)', fontSize: 12, color: 'rgba(244,239,230,0.85)' }}>{c}</div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: '14px 22px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 18px', borderRadius: 999, background: 'rgba(244,239,230,0.06)', border: '1px solid rgba(244,239,230,0.12)' }}>
            <span style={{ flex: 1, fontSize: 13, color: 'rgba(244,239,230,0.5)' }}>Pregunta lo que necesites…</span>
            <button style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--copper)', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon name="send" size={14} color="#fff" />
            </button>
          </div>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   5. MARKETPLACE — neighborhood listings
   ============================================================ */

function MarketplaceScreen() {
  const items = [
    { title: 'Bicicleta urbana Trek', price: 280000, neigh: '12A · Camila R.', cat: 'Movilidad', tone: '#6E8268' },
    { title: 'Set comedor roble macizo', price: 450000, neigh: '8B · Daniela P.', cat: 'Mobiliario', tone: '#B5664E' },
    { title: 'Plantas suculentas (3)', price: 18000, neigh: '14C · Vicente A.', cat: 'Hogar', tone: '#5C4868' },
    { title: 'Monitor LG 27" UHD', price: 220000, neigh: '21D · Tomás S.', cat: 'Tecnología', tone: '#C99A4A' },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingTop: 6 }}>
          <div>
            <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Vecinos</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
              Mercado
            </h1>
          </div>
          <button style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--ink)', display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={16} color="var(--paper)" strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, background: 'var(--paper-warm)', border: '1px solid var(--line)' }}>
            <Icon name="search" size={16} color="var(--ink-tertiary)" />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-tertiary)' }}>Busca en tu edificio…</span>
            <Icon name="filter" size={16} color="var(--ink-muted)" />
          </div>
        </div>

        {/* Categories scroll */}
        <div style={{ padding: '0 22px', display: 'flex', gap: 8, marginBottom: 20, overflow: 'auto' }} className="no-scrollbar">
          {[{ l: 'Todo', sel: true }, { l: 'Movilidad' }, { l: 'Mobiliario' }, { l: 'Hogar' }, { l: 'Tecnología' }, { l: 'Niños' }].map((c, i) => (
            <div key={i} style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: c.sel ? 'var(--ink)' : 'transparent',
              color: c.sel ? 'var(--paper)' : 'var(--ink-muted)',
              border: c.sel ? 'none' : '1px solid var(--line)',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}>{c.l}</div>
          ))}
        </div>

        {/* Featured large card */}
        <div style={{ padding: '0 22px', marginBottom: 12 }}>
          <div style={{ borderRadius: 22, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <div style={{ height: 170, background: 'linear-gradient(135deg, #2A241D 0%, #1A1611 100%)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg, transparent 0, transparent 24px, rgba(255,255,255,0.04) 24px, rgba(255,255,255,0.04) 26px)' }} />
              <div style={{ position: 'absolute', top: 14, left: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em' }}>IMG · BICICLETA</div>
              <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', background: 'rgba(255,255,255,0.95)', borderRadius: 999, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                Verificado
              </div>
            </div>
            <div style={{ padding: 18, background: 'var(--paper)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>Movilidad · 12A</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.1 }}>Bicicleta urbana Trek</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>$280K</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>CLP</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Cuadro 54cm. Cambios Shimano. Apenas usada — mi vecina del 12A se cambia a depto.
              </div>
            </div>
          </div>
        </div>

        {/* Grid list */}
        <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 16 }}>
          {items.slice(1).map((it, i) => (
            <div key={i} style={{ background: 'var(--paper)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden' }}>
              <div style={{ height: 100, background: it.tone, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 14px, rgba(255,255,255,0.08) 14px, rgba(255,255,255,0.08) 16px)' }} />
                <div style={{ position: 'absolute', bottom: 6, left: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.08em' }}>{it.cat.toUpperCase()}</div>
              </div>
              <div style={{ padding: '12px 12px 14px' }}>
                <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.3, fontWeight: 500, marginBottom: 8 }}>{it.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>${(it.price/1000).toFixed(0)}K</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{it.neigh.split(' · ')[0]}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PhoneFrame>
  );
}

window.ResidentHome = ResidentHome;
window.ExpensesScreen = ExpensesScreen;
window.AmenitiesScreen = AmenitiesScreen;
window.CocoChatScreen = CocoChatScreen;
window.MarketplaceScreen = MarketplaceScreen;
window.PhoneFrame = PhoneFrame;
window.StatusBar = StatusBar;
window.Brand = Brand;
window.Icon = Icon;
