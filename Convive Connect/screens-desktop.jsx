/* global React */
/* Admin dashboard + landing — desktop premium */

/* ============================================================
   ADMIN DASHBOARD — desktop, role: admin
   ============================================================ */

function AdminDashboard() {
  const { Icon, Brand } = window;

  return (
    <div style={{ width: 1280, height: 820, background: 'var(--ivory)', display: 'flex', borderRadius: 20, border: '1px solid var(--line-strong)', overflow: 'hidden', boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 40px 80px -32px rgba(26,22,17,0.20)' }}>

      {/* Sidebar */}
      <aside style={{ width: 240, background: 'var(--paper-warm)', borderRight: '1px solid var(--line)', padding: '24px 18px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--ink)', color: 'var(--copper-soft)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 18, fontStyle: 'italic' }}>c</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17, letterSpacing: '-0.01em', lineHeight: 1 }}>
            Convive<span style={{ fontStyle: 'italic', color: 'var(--copper)' }}> &amp; </span>Connect
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, padding: '0 8px' }}>Operación</div>
        {[
          { l: 'Resumen', i: 'home', active: true },
          { l: 'Residentes', i: 'users' },
          { l: 'Comunicaciones', i: 'bell', badge: 4 },
          { l: 'Solicitudes', i: 'wrench', badge: 12 },
          { l: 'Gastos comunes', i: 'receipt' },
          { l: 'Reservas', i: 'calendar' },
          { l: 'Votaciones', i: 'check' },
        ].map((nav, i) => (
          <div key={i} style={{
            padding: '9px 12px',
            borderRadius: 10,
            marginBottom: 2,
            background: nav.active ? 'var(--paper)' : 'transparent',
            border: nav.active ? '1px solid var(--line)' : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: nav.active ? 'var(--ink)' : 'var(--ink-muted)',
            fontWeight: nav.active ? 500 : 400,
            cursor: 'pointer',
          }}>
            <Icon name={nav.i} size={15} color={nav.active ? 'var(--copper)' : 'var(--ink-muted)'} />
            <span style={{ flex: 1 }}>{nav.l}</span>
            {nav.badge && <span style={{ padding: '1px 6px', borderRadius: 999, background: 'var(--copper)', color: '#fff', fontSize: 10, fontFamily: 'var(--mono)' }}>{nav.badge}</span>}
          </div>
        ))}

        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '24px 0 8px', padding: '0 8px' }}>Comunidad</div>
        {[
          { l: 'Marketplace', i: 'store' },
          { l: 'Directorio', i: 'pin' },
          { l: 'Social', i: 'chat' },
        ].map((nav, i) => (
          <div key={i} style={{ padding: '9px 12px', borderRadius: 10, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-muted)' }}>
            <Icon name={nav.i} size={15} color="var(--ink-muted)" />
            <span>{nav.l}</span>
          </div>
        ))}

        <div style={{ marginTop: 'auto', padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600 }}>JL</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Javier Lobos</div>
              <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>Administrador</div>
            </div>
            <Icon name="settings" size={14} color="var(--ink-tertiary)" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="tag" style={{ color: 'var(--copper)', borderColor: 'rgba(181,102,78,0.30)', background: 'var(--copper-tint)', padding: '4px 10px' }}>
              <span className="dot" style={{ background: 'var(--copper)' }} /> Edificio Aurelia · admin
            </span>
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>Lunes, 25 de mayo · 14:32</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', width: 320 }}>
              <Icon name="search" size={14} color="var(--ink-tertiary)" />
              <span style={{ fontSize: 12, color: 'var(--ink-tertiary)', flex: 1 }}>Buscar residentes, unidades, casos…</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 4 }}>⌘ K</span>
            </div>
            <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }}>
              <Icon name="plus" size={14} /> Anuncio
            </button>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }} className="no-scrollbar">

          {/* Page title */}
          <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div className="uppercase-eyebrow" style={{ marginBottom: 8 }}>Panel administrador</div>
              <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 400 }}>
                Tu edificio, <span style={{ fontStyle: 'italic' }}>de un vistazo</span>
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['7D', '30D', '90D', 'YTD'].map((p, i) => (
                <button key={i} style={{
                  padding: '8px 14px', borderRadius: 10,
                  fontSize: 12, fontFamily: 'var(--mono)',
                  background: i === 1 ? 'var(--ink)' : 'var(--paper)',
                  color: i === 1 ? 'var(--paper)' : 'var(--ink-muted)',
                  border: i === 1 ? 'none' : '1px solid var(--line)',
                  cursor: 'pointer',
                }}>{p}</button>
              ))}
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            {[
              { eyebrow: 'Residentes activos', big: '186', sub: '/ 192 unidades', trend: '+3', trendColor: 'var(--sage)', tint: 'var(--sage-tint)', icon: 'users', iconColor: 'var(--sage)' },
              { eyebrow: 'Cobranza mayo', big: '92%', sub: '$31.4M de $34.1M', trend: '+4 pp', trendColor: 'var(--sage)', tint: 'var(--copper-tint)', icon: 'coin', iconColor: 'var(--copper)' },
              { eyebrow: 'Solicitudes abiertas', big: '12', sub: '3 críticas', trend: '−2', trendColor: 'var(--sage)', tint: 'var(--amber-tint)', icon: 'wrench', iconColor: 'var(--amber)' },
              { eyebrow: 'Quórum próxima asamblea', big: '64%', sub: 'Falta 11% para sesionar', trend: 'Sáb 30', trendColor: 'var(--ink-muted)', tint: 'var(--plum-tint)', icon: 'check', iconColor: 'var(--plum)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: k.tint, display: 'grid', placeItems: 'center', color: k.iconColor }}>
                    <Icon name={k.icon} size={15} color={k.iconColor} />
                  </div>
                  <div style={{ fontSize: 11, color: k.trendColor, fontFamily: 'var(--mono)' }}>{k.trend}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 6 }}>{k.eyebrow}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1 }}>{k.big}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{k.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Two-column row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>

            {/* Revenue chart */}
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div className="uppercase-eyebrow" style={{ marginBottom: 8 }}>Recaudación mensual</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1 }}>$31.4M</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--sage)' }}>↑ 6.2% YoY</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--copper)', borderRadius: 2 }} /> Cobrado</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--copper)', opacity: 0.5, borderRadius: 2 }} /> Pendiente</span>
                </div>
              </div>

              {/* Bars — Cotton-style folded ribbons, warm color ramp */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 200, padding: '0 4px', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                {[
                  { m: 'Dic', paid: 78, pend: 12, c: '#E0B23C' },
                  { m: 'Ene', paid: 82, pend: 10, c: '#D9A04A' },
                  { m: 'Feb', paid: 76, pend: 14, c: '#D27A38' },
                  { m: 'Mar', paid: 85, pend: 8,  c: '#CB7146' },
                  { m: 'Abr', paid: 88, pend: 8,  c: '#BE6A4B' },
                  { m: 'May', paid: 92, pend: 5,  c: '#B5664E' },
                ].map((row, i) => {
                  const fold = (hex, f) => {
                    const n = parseInt(hex.slice(1), 16);
                    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
                    return `rgb(${r},${g},${b})`;
                  };
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '60%', gap: 3, height: 170 }}>
                        {/* paid — folded ribbon */}
                        <div style={{ width: '100%', height: `${row.paid}%`, display: 'flex', borderRadius: '3px 3px 0 0', overflow: 'hidden', boxShadow: '0 2px 6px -2px rgba(26,22,17,0.18)' }}>
                          <div style={{ width: '50%', height: '100%', background: row.c }} />
                          <div style={{ width: '50%', height: '100%', background: fold(row.c, 0.66) }} />
                        </div>
                        {/* pending — light fold on top */}
                        <div style={{ width: '100%', height: `${row.pend}%`, display: 'flex', borderRadius: '3px 3px 0 0', overflow: 'hidden', opacity: 0.5 }}>
                          <div style={{ width: '50%', height: '100%', background: row.c }} />
                          <div style={{ width: '50%', height: '100%', background: fold(row.c, 0.66) }} />
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)' }}>{row.m}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Critical / requests */}
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="uppercase-eyebrow">Solicitudes activas</div>
                <span style={{ fontSize: 11, color: 'var(--copper)', cursor: 'pointer' }}>Ver todas →</span>
              </div>

              {[
                { tone: 'var(--rose)', tint: 'var(--rose-tint)', sev: 'Crítico', unit: '14B', txt: 'Filtración en losa de baño', age: '2h' },
                { tone: 'var(--amber)', tint: 'var(--amber-tint)', sev: 'Alto', unit: '21D', txt: 'Ascensor 2 sin respuesta', age: '5h' },
                { tone: 'var(--copper)', tint: 'var(--copper-tint)', sev: 'Medio', unit: '07A', txt: 'Cambio chapa departamento', age: '1d' },
                { tone: 'var(--ink-tertiary)', tint: 'rgba(139,130,120,0.10)', sev: 'Bajo', unit: '03C', txt: 'Bombillo escala 4', age: '2d' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ padding: '2px 8px', borderRadius: 999, background: r.tint, color: r.tone, fontSize: 10, fontWeight: 500, width: 60, textAlign: 'center' }}>{r.sev}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.3, fontWeight: 500 }}>{r.txt}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2, fontFamily: 'var(--mono)' }}>Unidad {r.unit} · hace {r.age}</div>
                  </div>
                  <Icon name="chevron" size={14} color="var(--ink-faint)" />
                </div>
              ))}
            </div>

          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>

            {/* Categories pie */}
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
              <div className="uppercase-eyebrow" style={{ marginBottom: 18 }}>Gastos por categoría</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <svg width="92" height="92" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
                  <circle cx="46" cy="46" r="36" fill="none" stroke="#2F6CB0" strokeWidth="16" strokeDasharray="78 226" transform="rotate(-90 46 46)" />
                  <circle cx="46" cy="46" r="36" fill="none" stroke="#D27A38" strokeWidth="16" strokeDasharray="56 226" strokeDashoffset="-78" transform="rotate(-90 46 46)" />
                  <circle cx="46" cy="46" r="36" fill="none" stroke="#3E8E57" strokeWidth="16" strokeDasharray="42 226" strokeDashoffset="-134" transform="rotate(-90 46 46)" />
                  <circle cx="46" cy="46" r="36" fill="none" stroke="#E0B23C" strokeWidth="16" strokeDasharray="50 226" strokeDashoffset="-176" transform="rotate(-90 46 46)" />
                </svg>
                <div style={{ flex: 1 }}>
                  {[
                    { l: 'Servicios', v: '34%', c: '#2F6CB0' },
                    { l: 'Mantención', v: '25%', c: '#D27A38' },
                    { l: 'Personal', v: '19%', c: '#3E8E57' },
                    { l: 'Otros', v: '22%', c: '#E0B23C' },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, background: r.c, borderRadius: 2 }} />
                      <span style={{ flex: 1, color: 'var(--ink-muted)' }}>{r.l}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Amenity usage */}
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
              <div className="uppercase-eyebrow" style={{ marginBottom: 18 }}>Uso de amenidades</div>
              {[
                { l: 'Piscina', pct: 86, c: '#B5664E' },
                { l: 'Quincho', pct: 72, c: '#6E8268' },
                { l: 'Gimnasio', pct: 58, c: '#7A5876' },
                { l: 'Sala multiuso', pct: 41, c: '#C99A4A' },
                { l: 'Cowork', pct: 35, c: '#3E8E8E' },
              ].map((r, i) => {
                const fold = (hex, f) => {
                  const n = parseInt(hex.slice(1), 16);
                  const rr = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
                  return `rgb(${rr},${g},${b})`;
                };
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{r.l}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>{r.pct}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--paper-warm)', borderRadius: '0 3px 3px 0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${r.pct}%`, display: 'flex', borderRadius: '0 3px 3px 0', overflow: 'hidden' }}>
                        <div style={{ width: '50%', height: '100%', background: r.c }} />
                        <div style={{ width: '50%', height: '100%', background: fold(r.c, 0.66) }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Voting */}
            <div style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -50, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(181,102,78,0.25) 0%, transparent 65%)' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.55)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>Votación activa</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.1, marginBottom: 18 }}>
                  Aprobar cambio de jardinería ornamental
                </h3>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                    <span style={{ color: 'rgba(244,239,230,0.7)' }}>Quórum</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>64% · 119 de 186</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(244,239,230,0.10)', borderRadius: 999 }}>
                    <div style={{ width: '64%', height: '100%', background: 'var(--copper)', borderRadius: 999 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 18 }}>
                  <div>
                    <div style={{ color: 'rgba(244,239,230,0.55)', fontSize: 10, marginBottom: 4 }}>A favor</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>74<span style={{ fontSize: 12, color: 'rgba(244,239,230,0.5)' }}>%</span></div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(244,239,230,0.55)', fontSize: 10, marginBottom: 4 }}>En contra</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>18<span style={{ fontSize: 12, color: 'rgba(244,239,230,0.5)' }}>%</span></div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(244,239,230,0.55)', fontSize: 10, marginBottom: 4 }}>Abst.</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>8<span style={{ fontSize: 12, color: 'rgba(244,239,230,0.5)' }}>%</span></div>
                  </div>
                </div>
                <button style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'rgba(244,239,230,0.10)', color: 'var(--paper)', border: '1px solid rgba(244,239,230,0.18)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  Ver detalle de la votación
                </button>
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}

/* ============================================================
   LANDING — premium hero
   ============================================================ */

function LandingScreen() {
  const { Icon } = window;

  return (
    <div style={{ width: 1280, height: 820, background: 'var(--ivory)', borderRadius: 20, border: '1px solid var(--line-strong)', overflow: 'hidden', position: 'relative', boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 40px 80px -32px rgba(26,22,17,0.20)' }}>

      {/* Subtle grid bg */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(181,102,78,0.07) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(110,130,104,0.05) 0%, transparent 45%)',
        pointerEvents: 'none'
      }} />

      {/* Nav */}
      <nav style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--ink)', color: 'var(--copper-soft)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 19, fontStyle: 'italic' }}>c</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 19, letterSpacing: '-0.01em' }}>
            Convive<span style={{ fontStyle: 'italic', color: 'var(--copper)' }}> &amp; </span>Connect
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, fontSize: 13, color: 'var(--ink-muted)' }}>
          <span>Plataforma</span>
          <span>Para administradores</span>
          <span>Para residentes</span>
          <span>Precios</span>
          <span>Demo</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>Ingresar</button>
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>Probar 30 días</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 60, padding: '50px 48px 0', height: 'calc(100% - 81px)' }}>

        {/* Left: copy */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 24 }}>

          {/* Eyebrow with arrow */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px 6px 8px', borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', width: 'fit-content', marginBottom: 32 }}>
            <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--copper)', color: '#fff', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>v 2.0</span>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Coco AI ahora resuelve pagos, reservas y solicitudes →</span>
          </div>

          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 78, lineHeight: 0.98, letterSpacing: '-0.025em', fontWeight: 400, color: 'var(--ink)' }}>
            La <span style={{ fontStyle: 'italic', color: 'var(--copper)' }}>buena vida</span><br />
            en comunidad,<br />
            sin papeleo.
          </h1>

          <p style={{ marginTop: 28, marginBottom: 40, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-muted)', maxWidth: 480 }}>
            Convive Connect es la plataforma chilena que une administración, conserjería y residentes
            en una sola conversación. Pagos al día, reservas en segundos, decisiones transparentes.
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 36 }}>
            <button style={{ padding: '14px 24px', borderRadius: 12, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              Probar 30 días gratis <Icon name="arrowSm" size={14} color="var(--paper)" />
            </button>
            <button style={{ padding: '14px 24px', borderRadius: 12, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-strong)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Ver demo en vivo
            </button>
          </div>

          {/* Trust strip */}
          <div style={{ display: 'flex', gap: 28, paddingTop: 28, borderTop: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>240+</div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4 }}>Edificios en Chile</div>
            </div>
            <div style={{ width: 1, background: 'var(--line)' }} />
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>92<span style={{ fontSize: 16, color: 'var(--ink-muted)' }}>%</span></div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4 }}>Cobranza promedio</div>
            </div>
            <div style={{ width: 1, background: 'var(--line)' }} />
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>48<span style={{ fontSize: 16, color: 'var(--ink-muted)' }}>h</span></div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4 }}>Onboarding completo</div>
            </div>
          </div>
        </div>

        {/* Right: layered visual */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          {/* Big card behind */}
          <div style={{
            position: 'absolute',
            top: 30,
            right: -10,
            width: 320,
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 22,
            padding: 22,
            transform: 'rotate(3deg)',
            boxShadow: '0 30px 60px -20px rgba(26,22,17,0.40)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Coco AI</div>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--sage)' }} />
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.2, fontStyle: 'italic', marginBottom: 14 }}>
              "Listo, Martina. Reservé el quincho para el sábado a las 19:00."
            </div>
            <div style={{ fontSize: 12, color: 'rgba(244,239,230,0.55)', lineHeight: 1.4 }}>
              Te aviso cuando confirmes con tus invitados. ¿Algo más?
            </div>
          </div>

          {/* Front card — payment */}
          <div style={{
            position: 'relative',
            zIndex: 2,
            width: 320,
            background: 'var(--paper)',
            border: '1px solid var(--line-strong)',
            borderRadius: 22,
            padding: 24,
            transform: 'rotate(-2deg) translateY(60px)',
            boxShadow: '0 30px 60px -20px rgba(26,22,17,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="uppercase-eyebrow" style={{ marginBottom: 6 }}>Gasto común</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Mayo 2026</div>
              </div>
              <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--sage-tint)', color: 'var(--sage)', fontSize: 10, fontWeight: 500 }}>
                <span className="dot" /> Pagado
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>$</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' }}>187.420</span>
            </div>
            <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-muted)' }}>
              <span>Webpay · ✓ Confirmado</span>
              <span style={{ fontFamily: 'var(--mono)' }}>14:32</span>
            </div>
          </div>

          {/* Floating chip */}
          <div style={{
            position: 'absolute', bottom: 60, left: -10, zIndex: 3,
            background: 'var(--paper)',
            border: '1px solid var(--line-strong)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transform: 'rotate(-4deg)',
            boxShadow: '0 20px 40px -12px rgba(26,22,17,0.20)',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--copper-tint)', display: 'grid', placeItems: 'center' }}>
              <Icon name="pool" size={14} color="var(--copper)" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Reserva confirmada</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Quincho · Sáb 19:00</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

window.AdminDashboard = AdminDashboard;
window.LandingScreen = LandingScreen;
