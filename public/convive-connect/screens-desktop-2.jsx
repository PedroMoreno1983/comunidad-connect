/* global React */
/* Desktop screens — batch 2: Concierge, Residentes admin, Comunicaciones admin */

const { Icon } = window;

/* Shared admin shell - sidebar + topbar */
function AdminShell({ activeNav, role = 'admin', accent = 'copper', children, sectionLabel, pageTitle }) {
  const roleConfig = {
    admin:     { accent: 'var(--copper)',  bg: 'var(--copper-tint)', label: 'Administrador' },
    conserje:  { accent: 'var(--amber)',   bg: 'var(--amber-tint)',  label: 'Conserje · turno' },
  }[role] || { accent: 'var(--copper)', bg: 'var(--copper-tint)' };

  const adminNav = [
    { l: 'Resumen', i: 'home', key: 'home' },
    { l: 'Residentes', i: 'users', key: 'residentes' },
    { l: 'Comunicaciones', i: 'bell', key: 'comunicaciones', badge: 4 },
    { l: 'Solicitudes', i: 'wrench', key: 'solicitudes', badge: 12 },
    { l: 'Gastos comunes', i: 'receipt', key: 'gastos' },
    { l: 'Reservas', i: 'calendar', key: 'reservas' },
    { l: 'Votaciones', i: 'check', key: 'votaciones' },
  ];

  const conciergeNav = [
    { l: 'Recepción', i: 'home', key: 'recepcion' },
    { l: 'Visitas', i: 'users', key: 'visitas', badge: 3 },
    { l: 'Encomiendas', i: 'store', key: 'encomiendas', badge: 7 },
    { l: 'Estacionamientos', i: 'car', key: 'estacionamientos' },
    { l: 'Incidencias', i: 'wrench', key: 'incidencias' },
    { l: 'Bitácora', i: 'receipt', key: 'bitacora' },
  ];

  const nav = role === 'conserje' ? conciergeNav : adminNav;

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

        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, padding: '0 8px' }}>{role === 'conserje' ? 'Conserjería' : 'Operación'}</div>
        {nav.map((n, i) => {
          const isActive = n.key === activeNav;
          return (
            <div key={i} style={{
              padding: '9px 12px',
              borderRadius: 10,
              marginBottom: 2,
              background: isActive ? 'var(--paper)' : 'transparent',
              border: isActive ? '1px solid var(--line)' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: isActive ? 'var(--ink)' : 'var(--ink-muted)',
              fontWeight: isActive ? 500 : 400,
              cursor: 'pointer',
            }}>
              <Icon name={n.i} size={15} color={isActive ? roleConfig.accent : 'var(--ink-muted)'} />
              <span style={{ flex: 1 }}>{n.l}</span>
              {n.badge && <span style={{ padding: '1px 6px', borderRadius: 999, background: roleConfig.accent, color: '#fff', fontSize: 10, fontFamily: 'var(--mono)' }}>{n.badge}</span>}
            </div>
          );
        })}

        <div style={{ marginTop: 'auto', padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: roleConfig.accent, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600 }}>
              {role === 'conserje' ? 'RP' : 'JL'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{role === 'conserje' ? 'Ricardo P.' : 'Javier Lobos'}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{roleConfig.label}</div>
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
            <span className="tag" style={{ color: roleConfig.accent, borderColor: 'transparent', background: roleConfig.bg, padding: '4px 10px' }}>
              <span className="dot" style={{ background: roleConfig.accent }} /> Edificio Aurelia · {roleConfig.label.toLowerCase()}
            </span>
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>Lunes, 25 de mayo · 14:32</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', width: 320 }}>
              <Icon name="search" size={14} color="var(--ink-tertiary)" />
              <span style={{ fontSize: 12, color: 'var(--ink-tertiary)', flex: 1 }}>Buscar residentes, unidades, casos…</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 4 }}>⌘ K</span>
            </div>
            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 12 }}>
              <Icon name="plus" size={13} color="var(--paper)" /> Nuevo
            </button>
          </div>
        </header>

        {/* Page header */}
        {(sectionLabel || pageTitle) && (
          <div style={{ padding: '28px 32px 0' }}>
            {sectionLabel && <div className="uppercase-eyebrow" style={{ marginBottom: 8 }}>{sectionLabel}</div>}
            {pageTitle && (
              <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 400 }}>
                {pageTitle}
              </h1>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 32px 32px', overflow: 'auto' }} className="no-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
}

/* ============================================================
   CONCIERGE — reception desk
   ============================================================ */

function ConciergeDashboard() {
  const visits = [
    { hh: '14:18', name: 'Tomás Vergara', unit: '14B', kind: 'Visita', host: 'Daniela P.', status: 'En lobby', tone: 'var(--amber)' },
    { hh: '13:52', name: 'María Saavedra', unit: '08B', kind: 'Servicio', host: 'Camila R.', status: 'Subiendo', tone: 'var(--sage)' },
    { hh: '13:30', name: 'Andes Express', unit: '21D', kind: 'Encomienda', host: 'Tomás S.', status: 'Por entregar', tone: 'var(--copper)' },
    { hh: '12:14', name: 'Hugo Ramos', unit: '03C', kind: 'Visita', host: 'Sofía B.', status: 'Salió', tone: 'var(--ink-tertiary)' },
    { hh: '11:42', name: 'Plomería Salazar', unit: '14B', kind: 'Servicio', host: 'Daniela P.', status: 'Salió', tone: 'var(--ink-tertiary)' },
  ];

  return (
    <AdminShell role="conserje" activeNav="recepcion" sectionLabel="Panel conserjería" pageTitle={<>Buenas tardes, <span style={{ fontStyle: 'italic' }}>Ricardo.</span></>}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 20, marginBottom: 18 }}>
        {[
          { k: 'En el edificio', big: '7', sub: 'visitas activas', tint: 'var(--amber-tint)', i: 'users', c: 'var(--amber)' },
          { k: 'Encomiendas', big: '12', sub: '5 por entregar', tint: 'var(--copper-tint)', i: 'store', c: 'var(--copper)' },
          { k: 'Incidencias turno', big: '2', sub: '0 críticas', tint: 'var(--sage-tint)', i: 'wrench', c: 'var(--sage)' },
          { k: 'Próximos retiros', big: '4', sub: 'antes de 18:00', tint: 'var(--plum-tint)', i: 'car', c: 'var(--plum)' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: kpi.tint, display: 'grid', placeItems: 'center' }}>
                <Icon name={kpi.i} size={15} color={kpi.c} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>{kpi.k}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1 }}>{kpi.big}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>

        {/* Movements log */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div className="uppercase-eyebrow" style={{ marginBottom: 6 }}>Bitácora del turno</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>Movimientos hoy</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Todos', 'Visitas', 'Servicios', 'Encomiendas'].map((t, i) => (
                <span key={i} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 11,
                  background: i === 0 ? 'var(--ink)' : 'transparent',
                  color: i === 0 ? 'var(--paper)' : 'var(--ink-muted)',
                  border: i === 0 ? 'none' : '1px solid var(--line)',
                }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1.4fr 0.8fr 1fr 1fr 0.7fr', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <div>Hora</div>
            <div>Persona</div>
            <div>Tipo</div>
            <div>Unidad</div>
            <div>Anfitrión</div>
            <div style={{ textAlign: 'right' }}>Estado</div>
          </div>

          {visits.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1.4fr 0.8fr 1fr 1fr 0.7fr', gap: 12, padding: '14px 0', borderBottom: i < visits.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', fontSize: 13 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-muted)' }}>{v.hh}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--paper-warm)', color: 'var(--ink-muted)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {v.name[0]}
                </div>
                <span>{v.name}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{v.kind}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v.unit}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{v.host}</div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: v.tone, fontWeight: 500 }}>
                  <span className="dot" style={{ background: v.tone }} />
                  {v.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right column — quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Allow visit */}
          <div style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 16, padding: 22, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,154,74,0.25) 0%, transparent 65%)' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.55)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>Acceso rápido</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.1, marginBottom: 14 }}>
                Registrar nueva <span style={{ fontStyle: 'italic' }}>visita</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--copper)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  Manual
                </button>
                <button style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(244,239,230,0.10)', color: 'var(--paper)', border: '1px solid rgba(244,239,230,0.18)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  QR pre-autorizado
                </button>
              </div>
            </div>
          </div>

          {/* Pending packages */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="uppercase-eyebrow">Encomiendas por avisar</div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--copper)' }}>5</span>
            </div>
            {[
              { unit: '14B', courier: 'Andes Express', wait: '2h' },
              { unit: '21D', courier: 'Chilexpress', wait: '4h' },
              { unit: '03C', courier: 'Starken', wait: '1d' },
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--copper-tint)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="store" size={14} color="var(--copper)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>Unidad {p.unit}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{p.courier} · espera {p.wait}</div>
                </div>
                <button style={{ padding: '6px 10px', fontSize: 11, borderRadius: 8, background: 'var(--paper-warm)', border: '1px solid var(--line)', cursor: 'pointer' }}>
                  Avisar
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>

    </AdminShell>
  );
}

/* ============================================================
   RESIDENTES ADMIN — directory table
   ============================================================ */

function ResidentesAdminScreen() {
  const residents = [
    { name: 'Camila Rodríguez', unit: '12A', tower: 'A', rol: 'Propietaria', status: 'Activo', payment: 'Al día', payColor: 'var(--sage)', members: 2, joined: 'Ene 2024' },
    { name: 'Daniela Pérez', unit: '08B', tower: 'B', rol: 'Arrendataria', status: 'Activo', payment: 'Al día', payColor: 'var(--sage)', members: 3, joined: 'Mar 2023' },
    { name: 'Vicente Aguilar', unit: '14C', tower: 'A', rol: 'Propietario', status: 'Activo', payment: 'Pendiente', payColor: 'var(--amber)', members: 4, joined: 'Jun 2022' },
    { name: 'Tomás Soto', unit: '21D', tower: 'B', rol: 'Propietario', status: 'Activo', payment: 'Vencido', payColor: 'var(--rose)', members: 1, joined: 'Oct 2024' },
    { name: 'Sofía Bustamante', unit: '03C', tower: 'A', rol: 'Arrendataria', status: 'Activo', payment: 'Al día', payColor: 'var(--sage)', members: 2, joined: 'Feb 2025' },
    { name: 'Martina Aguilar', unit: '12C', tower: 'B', rol: 'Propietaria', status: 'Activo', payment: 'Al día', payColor: 'var(--sage)', members: 3, joined: 'Abr 2023' },
    { name: 'Hugo Ramírez', unit: '17A', tower: 'A', rol: 'Propietario', status: 'Inactivo', payment: '—', payColor: 'var(--ink-tertiary)', members: 0, joined: 'Sep 2021' },
  ];

  return (
    <AdminShell activeNav="residentes" sectionLabel="Comunidad" pageTitle={<>Residentes <span style={{ fontStyle: 'italic' }}>del edificio</span></>}>

      {/* Summary strip */}
      <div style={{ marginTop: 20, marginBottom: 18, display: 'flex', gap: 24, padding: '14px 20px', borderRadius: 14, background: 'var(--paper-warm)', border: '1px solid var(--line)' }}>
        {[
          { l: 'Unidades', v: '192' },
          { l: 'Activos', v: '186', tone: 'var(--sage)' },
          { l: 'Al día', v: '171', tone: 'var(--sage)' },
          { l: 'Pendientes', v: '12', tone: 'var(--amber)' },
          { l: 'Vencidos', v: '3', tone: 'var(--rose)' },
          { l: 'Sin app', v: '6', tone: 'var(--ink-tertiary)' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{s.l}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: s.tone || 'var(--ink)' }}>{s.v}</span>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 12, alignSelf: 'center' }}>
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', flex: 1, maxWidth: 340 }}>
          <Icon name="search" size={14} color="var(--ink-tertiary)" />
          <span style={{ fontSize: 12, color: 'var(--ink-tertiary)', flex: 1 }}>Nombre, unidad o RUT…</span>
        </div>
        {['Todos', 'Propietarios', 'Arrendatarios', 'Inactivos'].map((f, i) => (
          <button key={i} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12,
            background: i === 0 ? 'var(--ink)' : 'var(--paper)',
            color: i === 0 ? 'var(--paper)' : 'var(--ink-muted)',
            border: i === 0 ? 'none' : '1px solid var(--line)',
            cursor: 'pointer',
          }}>{f}</button>
        ))}
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 12 }}>
          <Icon name="filter" size={13} /> Más filtros
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 2fr 1fr 1fr 1fr 1fr 0.8fr 0.6fr', gap: 14, padding: '12px 22px', background: 'var(--paper-warm)', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', alignItems: 'center' }}>
          <div><input type="checkbox" /></div>
          <div>Residente</div>
          <div>Unidad</div>
          <div>Rol</div>
          <div>Pagos</div>
          <div>Núcleo</div>
          <div>Desde</div>
          <div></div>
        </div>

        {residents.map((r, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '0.5fr 2fr 1fr 1fr 1fr 1fr 0.8fr 0.6fr',
            gap: 14, padding: '16px 22px',
            borderBottom: i < residents.length - 1 ? '1px solid var(--line)' : 'none',
            alignItems: 'center', fontSize: 13,
            opacity: r.status === 'Inactivo' ? 0.55 : 1,
          }}>
            <input type="checkbox" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--paper-warm)', color: 'var(--ink-muted)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>
                {r.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{r.name.split(' ')[0].toLowerCase()}@mail.com</div>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)' }}>{r.unit} <span style={{ color: 'var(--ink-tertiary)' }}>· T{r.tower}</span></div>
            <div style={{ color: 'var(--ink-muted)' }}>{r.rol}</div>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: r.payColor, fontWeight: 500 }}>
                <span className="dot" /> {r.payment}
              </span>
            </div>
            <div style={{ color: 'var(--ink-muted)', fontFamily: 'var(--mono)' }}>{r.members}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-muted)' }}>{r.joined}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Icon name="dots" size={16} color="var(--ink-tertiary)" />
            </div>
          </div>
        ))}

        {/* Pagination */}
        <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper-warm)', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Mostrando 7 de 186</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, '…', 27].map((p, i) => (
              <span key={i} style={{ padding: '4px 10px', fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 6, background: p === 1 ? 'var(--ink)' : 'transparent', color: p === 1 ? 'var(--paper)' : 'var(--ink-muted)' }}>{p}</span>
            ))}
          </div>
        </div>
      </div>

    </AdminShell>
  );
}

/* ============================================================
   COMUNICACIONES ADMIN — publisher
   ============================================================ */

function ComunicacionesAdminScreen() {
  return (
    <AdminShell activeNav="comunicaciones" sectionLabel="Publicar" pageTitle={<>Nueva <span style={{ fontStyle: 'italic' }}>comunicación</span></>}>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 22 }}>

        {/* Form */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 28 }}>

          {/* Category chips */}
          <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Categoría</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {[
              { l: 'Mantención', sel: true, tone: 'var(--amber)', tint: 'var(--amber-tint)' },
              { l: 'Asamblea', tone: 'var(--copper)', tint: 'var(--copper-tint)' },
              { l: 'Seguridad', tone: 'var(--rose)', tint: 'var(--rose-tint)' },
              { l: 'Comunidad', tone: 'var(--sage)', tint: 'var(--sage-tint)' },
              { l: 'Información', tone: 'var(--plum)', tint: 'var(--plum-tint)' },
            ].map((c, i) => (
              <span key={i} style={{
                padding: '6px 12px', borderRadius: 999,
                fontSize: 12,
                background: c.sel ? c.tint : 'transparent',
                color: c.sel ? c.tone : 'var(--ink-muted)',
                border: '1px solid',
                borderColor: c.sel ? 'transparent' : 'var(--line)',
                fontWeight: c.sel ? 500 : 400,
              }}>{c.l}</span>
            ))}
          </div>

          {/* Title */}
          <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Título</label>
          <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--ink)', background: 'var(--paper)', marginBottom: 18 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--ink)' }}>Corte de agua programado</span>
            <span style={{ marginLeft: 4, width: 1.5, height: 18, background: 'var(--copper)', display: 'inline-block', verticalAlign: 'middle' }} />
          </div>

          {/* Body */}
          <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Cuerpo</label>
          <div style={{ marginTop: 8, padding: 16, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper-warm)', minHeight: 130, marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
              Estimadas y estimados, les informamos que el <strong>miércoles 27 de mayo, entre las 09:00 y 13:00</strong>, se realizará mantención del sistema de presurización.
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55, marginTop: 10 }}>
              Recomendamos guardar agua la noche anterior para usos esenciales. Cualquier emergencia, por favor avisar en conserjería.
            </div>
          </div>

          {/* Settings row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Audiencia</label>
              <div style={{ marginTop: 8, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Todos los residentes</span>
                <Icon name="chevron" size={14} color="var(--ink-tertiary)" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Canales</label>
              <div style={{ marginTop: 8, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--paper-warm)', fontSize: 11 }}>App</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--paper-warm)', fontSize: 11 }}>Mail</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--paper-warm)', fontSize: 11 }}>WhatsApp</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--line)' }}>
            <button className="btn btn-ghost" style={{ padding: '10px 18px', fontSize: 13 }}>Guardar borrador</button>
            <button className="btn btn-ghost" style={{ padding: '10px 18px', fontSize: 13 }}>Programar</button>
            <button className="btn btn-primary" style={{ marginLeft: 'auto', padding: '12px 22px', fontSize: 13 }}>
              Enviar ahora <Icon name="arrowSm" size={13} color="var(--paper)" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Audience summary */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
            <div className="uppercase-eyebrow" style={{ marginBottom: 14 }}>Alcance estimado</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 36, lineHeight: 1 }}>186</span>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>residentes</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { l: 'App push', v: 174 },
                { l: 'Mail', v: 186 },
                { l: 'WhatsApp', v: 162 },
              ].map((c, i) => (
                <div key={i} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'var(--paper-warm)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{c.l}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, marginTop: 2 }}>{c.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile preview */}
          <div style={{ background: 'var(--paper-warm)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
            <div className="uppercase-eyebrow" style={{ marginBottom: 14 }}>Vista previa · push</div>

            <div style={{ padding: 14, borderRadius: 14, background: 'var(--paper)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 20px 40px -22px rgba(26,22,17,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--ink)', color: 'var(--copper-soft)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 12, fontStyle: 'italic' }}>c</div>
                <span style={{ fontSize: 11, fontWeight: 500 }}>Convive &amp; Connect</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>ahora</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Corte de agua programado</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.4 }}>Miércoles 27 de mayo, 09:00 – 13:00. Recomendamos guardar agua…</div>
            </div>
          </div>

          {/* Recent */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 22, flex: 1 }}>
            <div className="uppercase-eyebrow" style={{ marginBottom: 14 }}>Enviadas esta semana</div>
            {[
              { d: '24 may', t: 'Cambio de turno conserjería', read: '92%' },
              { d: '21 may', t: 'Recordatorio gasto común', read: '88%' },
              { d: '18 may', t: 'Nuevas plantas en lobby', read: '76%' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.t}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{r.d}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sage)' }}>{r.read} leído</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </AdminShell>
  );
}

window.ConciergeDashboard = ConciergeDashboard;
window.ResidentesAdminScreen = ResidentesAdminScreen;
window.ComunicacionesAdminScreen = ComunicacionesAdminScreen;
