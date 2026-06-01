/* global React */
/* Dark variant of resident home — premium night mode */

const { PhoneFrame: _PhoneFrame, Icon } = window;

function ResidentHomeDark() {
  return (
    <div style={{
      width: 390, height: 844,
      background: '#0E0B08',
      borderRadius: 48,
      border: '1px solid rgba(244,239,230,0.10)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 40px 80px -32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      color: '#F4EFE6',
    }}>
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px 4px', fontSize: 13, fontWeight: 600, color: '#F4EFE6' }}>
        <span style={{ fontFamily: 'var(--mono)' }}>9:41</span>
        <div style={{ width: 90, height: 26, borderRadius: 999, background: '#F4EFE6' }} />
        <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
          <svg width="16" height="11" viewBox="0 0 16 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="0.5" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
          <svg width="22" height="11" viewBox="0 0 22 11" fill="none"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="14" height="7" rx="1.5" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 0' }} className="no-scrollbar">

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(244,239,230,0.06)', color: '#D9A691', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 18, fontStyle: 'italic', border: '1px solid rgba(244,239,230,0.10)' }}>c</div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.55)' }}>Edificio Aurelia</div>
              <div style={{ fontSize: 13, color: '#F4EFE6', fontFamily: 'var(--mono)' }}>Torre B · 12C</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(244,239,230,0.10)', background: 'transparent', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <Icon name="bell" size={16} color="#F4EFE6" />
              <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: 999, background: '#B5664E' }} />
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(244,239,230,0.10)', background: 'transparent', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#F4EFE6' }}>
              MA
            </button>
          </div>
        </div>

        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>Martes, 25 de mayo</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 46, fontWeight: 400, lineHeight: 1.02, letterSpacing: '-0.02em' }}>
            Buenas noches,<br />
            <span style={{ fontStyle: 'italic', color: '#D9A691' }}>Martina.</span>
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 14, color: 'rgba(244,239,230,0.7)', lineHeight: 1.5, maxWidth: 290 }}>
            Tu comunidad está al día. Tienes <span style={{ color: '#F4EFE6' }}>una reserva</span> esta semana y <span style={{ color: '#F4EFE6' }}>nada pendiente</span> por pagar.
          </p>
        </div>

        {/* Featured card — softer dark variant */}
        <div style={{
          background: 'linear-gradient(150deg, #1B1410 0%, #281E18 100%)',
          color: '#F4EFE6',
          borderRadius: 22,
          padding: 22,
          marginBottom: 14,
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(244,239,230,0.06)',
        }}>
          <div style={{ position: 'absolute', top: -20, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(181,102,78,0.45) 0%, transparent 60%)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, position: 'relative' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.55)', marginBottom: 10 }}>Gasto común</div>
              <div style={{ fontSize: 13, color: 'rgba(244,239,230,0.75)' }}>Mayo 2026 · vence en 8 días</div>
            </div>
            <span style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 999, background: 'rgba(244,239,230,0.10)', color: '#F4EFE6', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#D9A691' }} /> Por pagar
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20, position: 'relative' }}>
            <span style={{ fontSize: 14, color: 'rgba(244,239,230,0.6)' }}>$</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 54, lineHeight: 1, letterSpacing: '-0.02em' }}>187.420</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.5)', marginLeft: 6 }}>CLP</span>
          </div>
          <button style={{ width: '100%', padding: '14px', borderRadius: 14, background: '#B5664E', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative', cursor: 'pointer' }}>
            Pagar ahora <Icon name="arrowSm" size={16} color="#fff" />
          </button>
        </div>

        {/* For today */}
        <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 22, marginBottom: 12 }}>Para hoy</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{ background: 'rgba(244,239,230,0.04)', border: '1px solid rgba(244,239,230,0.08)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(110,130,104,0.20)', display: 'grid', placeItems: 'center' }}>
                <Icon name="pool" size={14} color="#B7C2B1" />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.55)' }}>Reserva</div>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.05, marginBottom: 4 }}>Piscina</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.65)' }}>Sáb · 11:00 – 12:30</div>
          </div>

          <div style={{ background: 'rgba(244,239,230,0.04)', border: '1px solid rgba(244,239,230,0.08)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(96,165,250,0.18)', display: 'grid', placeItems: 'center' }}>
                <Icon name="droplet" size={14} color="#60A5FA" />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.55)' }}>Consumo agua</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.05 }}>8.4</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.65)' }}>m³</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#B7C2B1', marginTop: 4 }}>−12% vs abril</div>
          </div>
        </div>

        {/* Announcement */}
        <div style={{ background: 'rgba(244,239,230,0.03)', border: '1px solid rgba(244,239,230,0.08)', borderRadius: 18, padding: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(181,102,78,0.18)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="bell" size={16} color="#D9A691" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ padding: '2px 8px', borderRadius: 999, color: '#D9A691', border: '1px solid rgba(181,102,78,0.30)', fontSize: 10 }}>Asamblea</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(244,239,230,0.5)' }}>hace 2h</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 500 }}>Asamblea ordinaria de copropietarios</div>
            <div style={{ fontSize: 12, color: 'rgba(244,239,230,0.65)', marginTop: 4, lineHeight: 1.4 }}>Sáb 30 de mayo, 19:00 — Salón comunitario.</div>
          </div>
          <Icon name="chevron" size={16} color="rgba(244,239,230,0.4)" />
        </div>

        {/* Coco prompt */}
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <button style={{
            width: '100%',
            background: 'rgba(244,239,230,0.05)',
            border: '1px solid rgba(244,239,230,0.10)',
            borderRadius: 999,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: '#B5664E', display: 'grid', placeItems: 'center' }}>
              <Icon name="sparkles" size={12} color="#fff" />
            </div>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'rgba(244,239,230,0.6)' }}>Pregúntale a Coco…</span>
            <Icon name="mic" size={16} color="rgba(244,239,230,0.5)" />
          </button>
        </div>
      </div>
    </div>
  );
}

window.ResidentHomeDark = ResidentHomeDark;
