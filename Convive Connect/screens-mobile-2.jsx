/* global React */
/* Mobile screens — batch 2: Votaciones, Feed, Social, Directorio, Servicios, Profile, Notifications, Onboarding, Auth */

const { PhoneFrame, Icon } = window;

/* ============================================================
   VOTACIONES — Poll detail with results
   ============================================================ */

function VotacionesScreen() {
  const options = [
    { l: 'Aprobar cambio', desc: 'Plantas nativas de bajo riego', votes: 88, pct: 74, sel: true },
    { l: 'Mantener actual', desc: 'Jardinería ornamental tropical', votes: 21, pct: 18, sel: false },
    { l: 'Abstención', desc: 'Sin opinión formada', votes: 10, pct: 8, sel: false },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Votación</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} />
          </button>
        </div>

        {/* Title block */}
        <div style={{ padding: '0 22px 24px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span className="tag" style={{ color: 'var(--copper)', borderColor: 'rgba(181,102,78,0.30)', padding: '3px 10px', fontSize: 10 }}>
              <span className="dot" /> Activa
            </span>
            <span className="tag" style={{ color: 'var(--ink-muted)', borderColor: 'var(--line)', padding: '3px 10px', fontSize: 10 }}>Asamblea</span>
            <span style={{ fontSize: 11, color: 'var(--ink-tertiary)', alignSelf: 'center' }}>· cierra en 3 días</span>
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿Aprobar el cambio de <span style={{ fontStyle: 'italic' }}>jardinería ornamental</span> por especies nativas?
          </h1>
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
            Propuesto por el comité de áreas verdes. Reducción de 38% en consumo de agua y 60% en mantención mensual. La inversión inicial se recupera en 14 meses.
          </p>
        </div>

        {/* Quorum bar */}
        <div style={{ margin: '0 22px 22px', padding: 18, borderRadius: 16, background: 'var(--paper-warm)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Quórum alcanzado</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>119</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-muted)' }}>/ 186</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>Quórum requerido</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, marginTop: 4, color: 'var(--ink)' }}>75% · 140</div>
            </div>
          </div>
          <div style={{ height: 6, background: 'var(--ivory-soft)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <div style={{ width: '64%', height: '100%', background: 'var(--ink)' }} />
            <div style={{ position: 'absolute', left: '75%', top: -2, width: 1, height: 10, background: 'var(--copper)' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 8 }}>
            64% actual · 11% por alcanzar para sesionar
          </div>
        </div>

        {/* Options */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 12 }}>Tu voto</div>
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((o, i) => (
            <div key={i} style={{
              padding: '16px 18px',
              borderRadius: 16,
              border: '1px solid',
              borderColor: o.sel ? 'var(--ink)' : 'var(--line)',
              background: o.sel ? 'var(--ink)' : 'var(--paper)',
              color: o.sel ? 'var(--paper)' : 'var(--ink)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Progress backdrop */}
              {!o.sel && (
                <div style={{ position: 'absolute', inset: 0, width: `${o.pct}%`, background: 'var(--paper-warm)', opacity: 0.6 }} />
              )}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, flex: 1 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 999,
                    border: '1.5px solid',
                    borderColor: o.sel ? 'var(--copper-soft)' : 'var(--line-strong)',
                    display: 'grid', placeItems: 'center',
                    background: o.sel ? 'var(--copper)' : 'transparent',
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    {o.sel && <Icon name="check" size={11} color="#fff" strokeWidth={2.5} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>{o.l}</div>
                    <div style={{ fontSize: 11, color: o.sel ? 'rgba(244,239,230,0.6)' : 'var(--ink-tertiary)' }}>{o.desc}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>{o.pct}<span style={{ fontSize: 12, opacity: 0.6 }}>%</span></div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: o.sel ? 'rgba(244,239,230,0.5)' : 'var(--ink-tertiary)', marginTop: 2 }}>{o.votes} votos</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '24px 22px 16px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={{ padding: '16px', borderRadius: 14, background: 'var(--copper)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Confirmar voto
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-tertiary)' }}>
            Tu voto es anónimo · puedes cambiarlo hasta el cierre
          </div>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   FEED — Anuncios / Comunicaciones (resident inbox)
   ============================================================ */

function FeedScreen() {
  const items = [
    {
      cat: 'Mantención', tone: 'var(--amber)', tint: 'var(--amber-tint)',
      title: 'Corte de agua programado',
      date: 'Mié 27 mayo · 09:00 – 13:00',
      body: 'Mantención del sistema de presurización. Recomendamos guardar agua la noche anterior.',
      age: 'hoy',
      pinned: true,
    },
    {
      cat: 'Asamblea', tone: 'var(--copper)', tint: 'var(--copper-tint)',
      title: 'Asamblea ordinaria de copropietarios',
      date: 'Sáb 30 mayo · 19:00',
      body: 'Salón comunitario. Tabla con propuesta de jardinería nativa, presupuesto 2026, designación comité.',
      age: '2h',
    },
    {
      cat: 'Seguridad', tone: 'var(--rose)', tint: 'var(--rose-tint)',
      title: 'Actualización de protocolo de visitas',
      date: 'Vigente desde 01 jun',
      body: 'Toda visita deberá registrarse en la app antes de su llegada. Más detalles en el reglamento adjunto.',
      age: 'ayer',
    },
    {
      cat: 'Comunidad', tone: 'var(--sage)', tint: 'var(--sage-tint)',
      title: 'Bicicletero recuperado',
      date: 'Inauguración 05 jun · 18:00',
      body: 'Capacidad para 24 bicicletas más estación de carga para eléctricas. Inscripciones desde el viernes.',
      age: 'hace 3d',
    },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Comunidad</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>Anuncios</h1>
          </div>
          <button style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="filter" size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 22px', marginTop: 18, marginBottom: 8, display: 'flex', gap: 18, borderBottom: '1px solid var(--line)' }}>
          {[
            { l: 'Todos', n: 12, sel: true },
            { l: 'Urgentes', n: 2 },
            { l: 'Mantención', n: 4 },
            { l: 'Comunidad', n: 6 },
          ].map((t, i) => (
            <div key={i} style={{
              padding: '10px 0',
              borderBottom: t.sel ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1,
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: t.sel ? 'var(--ink)' : 'var(--ink-tertiary)', fontWeight: t.sel ? 500 : 400 }}>{t.l}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>{t.n}</span>
            </div>
          ))}
        </div>

        {/* Pinned */}
        {items.filter(i => i.pinned).map((it, i) => (
          <div key={i} style={{ margin: '20px 22px 6px', padding: 20, borderRadius: 18, background: 'var(--ink)', color: 'var(--paper)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, rgba(201,154,74,0.3) 0%, transparent 65%)` }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(244,239,230,0.10)', fontSize: 10, fontWeight: 500, letterSpacing: '0.05em' }}>📌 Fijado</span>
                <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(201,154,74,0.25)', color: '#F1C97D', fontSize: 10, fontWeight: 500 }}>{it.cat}</span>
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.15, marginBottom: 6 }}>{it.title}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.65)', marginBottom: 12 }}>{it.date}</div>
              <div style={{ fontSize: 13, color: 'rgba(244,239,230,0.85)', lineHeight: 1.55 }}>{it.body}</div>
            </div>
          </div>
        ))}

        {/* List */}
        <div style={{ padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.filter(i => !i.pinned).map((it, i) => (
            <div key={i} style={{ padding: '18px 4px', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', display: 'flex', gap: 14 }}>
              <div style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: it.tone, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: it.tone, fontWeight: 500 }}>{it.cat}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>· {it.age}</span>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1.2, marginBottom: 4 }}>{it.title}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', marginBottom: 8 }}>{it.date}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{it.body}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   SOCIAL — Community photo feed
   ============================================================ */

function SocialScreen() {
  const posts = [
    {
      author: 'Camila R.', unit: '12A',
      time: 'hace 1h',
      body: 'El sunset de hoy desde la terraza estuvo de otro mundo 🌅',
      img: 'linear-gradient(135deg, #B5664E 0%, #C99A4A 50%, #5C4868 100%)',
      label: 'IMG · SUNSET TERRAZA',
      likes: 24, comments: 6,
    },
    {
      author: 'Daniela P.', unit: '8B',
      time: 'hace 4h',
      body: 'Alguien sabe quién pasea perros en el edificio? El mío necesita compañía mañana 🐕',
      likes: 12, comments: 18,
    },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Vecinos</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
              <span style={{ fontStyle: 'italic' }}>Plaza</span> social
            </h1>
          </div>
          <button style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--ink)', display: 'grid', placeItems: 'center', border: 'none' }}>
            <Icon name="plus" size={16} color="var(--paper)" strokeWidth={2} />
          </button>
        </div>

        {/* Stories row */}
        <div style={{ padding: '12px 22px 20px', display: 'flex', gap: 14, overflow: 'auto', borderBottom: '1px solid var(--line)' }} className="no-scrollbar">
          {[
            { name: 'Tu', initial: 'M', accent: true },
            { name: 'Camila', initial: 'C' },
            { name: 'Daniela', initial: 'D' },
            { name: 'Vicente', initial: 'V' },
            { name: 'Tomás', initial: 'T' },
            { name: 'Sofía', initial: 'S' },
          ].map((p, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 999,
                border: p.accent ? '2px dashed var(--copper)' : '2px solid var(--copper)',
                padding: 3,
                background: 'var(--paper)',
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 999, background: p.accent ? 'var(--paper-warm)' : 'var(--ink)', color: p.accent ? 'var(--ink-muted)' : 'var(--paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 500 }}>
                  {p.accent ? '+' : p.initial}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{p.name}</div>
            </div>
          ))}
        </div>

        {/* Posts */}
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column' }}>
          {posts.map((p, i) => (
            <div key={i} style={{ padding: '22px 0', borderBottom: i < posts.length - 1 ? '1px solid var(--line)' : 'none' }}>

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {p.author[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.author} <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', fontWeight: 400 }}>· {p.unit}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{p.time}</div>
                </div>
                <button style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  <Icon name="dots" size={16} color="var(--ink-tertiary)" />
                </button>
              </div>

              {/* Body */}
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 14 }}>{p.body}</div>

              {/* Image */}
              {p.img && (
                <div style={{ height: 220, borderRadius: 18, background: p.img, position: 'relative', overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 22px)' }} />
                  <div style={{ position: 'absolute', top: 14, left: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em' }}>{p.label}</div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-muted)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                  {p.likes}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-muted)' }}>
                  <Icon name="chat" size={14} /> {p.comments}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--copper)', fontWeight: 500 }}>
                  Ver conversación →
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   DIRECTORIO — People & service providers
   ============================================================ */

function DirectorioScreen() {
  const providers = [
    { name: 'Don Manuel Salazar', role: 'Plomería · Gasfitería', unit: 'Recomendado por 8 vecinos', rating: 4.9, copper: true },
    { name: 'Eléctrica Andes Sur', role: 'Instalaciones eléctricas', unit: 'Externo · 4 años', rating: 4.7 },
    { name: 'Pet Concierge', role: 'Paseo de mascotas', unit: 'Externo · Verificado', rating: 4.8 },
    { name: 'María Saavedra', role: 'Limpieza domiciliaria', unit: 'Recomendada por 12 vecinos', rating: 5.0 },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 18px' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Directorio</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
            La gente <span style={{ fontStyle: 'italic' }}>en quien confías</span>
          </h1>
        </div>

        {/* Search */}
        <div style={{ padding: '0 22px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, background: 'var(--paper-warm)', border: '1px solid var(--line)' }}>
            <Icon name="search" size={16} color="var(--ink-tertiary)" />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-tertiary)' }}>Plomero, electricista, paseador…</span>
          </div>
        </div>

        {/* Toggle */}
        <div style={{ padding: '0 22px', display: 'flex', gap: 8, marginBottom: 22 }}>
          {[
            { l: 'Servicios', n: 28, sel: true },
            { l: 'Vecinos', n: 186 },
          ].map((t, i) => (
            <div key={i} style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              background: t.sel ? 'var(--ink)' : 'transparent',
              color: t.sel ? 'var(--paper)' : 'var(--ink-muted)',
              border: t.sel ? 'none' : '1px solid var(--line)',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: t.sel ? 500 : 400,
              display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center',
            }}>
              {t.l} <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.6 }}>{t.n}</span>
            </div>
          ))}
        </div>

        {/* Categories */}
        <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 26 }}>
          {[
            { i: 'wrench', l: 'Plomería' },
            { i: 'bolt', l: 'Electricidad' },
            { i: 'leaf', l: 'Jardín' },
            { i: 'pin', l: 'Otros' },
          ].map((c, i) => (
            <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Icon name={c.i} size={18} color="var(--ink)" />
              <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{c.l}</div>
            </div>
          ))}
        </div>

        {/* Featured eyebrow */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 12 }}>Recomendados por tu edificio</div>

        {/* Providers list */}
        <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {providers.map((p, i) => (
            <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: p.copper ? 'var(--copper)' : 'var(--ink)',
                color: p.copper ? '#fff' : 'var(--paper)',
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--display)', fontSize: 22, fontStyle: 'italic',
                flexShrink: 0,
              }}>
                {p.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>★ {p.rating}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{p.role}</div>
                <div style={{ fontSize: 10, color: p.copper ? 'var(--copper)' : 'var(--ink-tertiary)', marginTop: 6, fontWeight: p.copper ? 500 : 400 }}>{p.unit}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   SERVICIOS — Service request flow
   ============================================================ */

function ServiciosScreen() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Nueva solicitud</div>
          <button style={{ width: 36, height: 36, opacity: 0 }}></button>
        </div>

        {/* Title */}
        <div style={{ padding: '0 22px 24px' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Paso 2 de 3</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿Qué <span style={{ fontStyle: 'italic' }}>necesita</span> arreglo?
          </h1>
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>
            Elige el tipo de incidencia para enviarlo al equipo correcto.
          </p>
        </div>

        {/* Step progress */}
        <div style={{ padding: '0 22px', display: 'flex', gap: 4, marginBottom: 26 }}>
          {[true, true, false].map((done, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 999, background: done ? 'var(--ink)' : 'var(--ivory-soft)' }} />
          ))}
        </div>

        {/* Options */}
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { i: 'droplet', l: 'Filtración o agua', desc: 'Goteras, baños, presión', sel: true, tone: '#3B82F6', tint: 'rgba(59,130,246,0.10)' },
            { i: 'bolt', l: 'Electricidad', desc: 'Cortes, enchufes, luces', tone: 'var(--amber)', tint: 'var(--amber-tint)' },
            { i: 'wrench', l: 'Cerrajería', desc: 'Puertas, chapas, llaves', tone: 'var(--copper)', tint: 'var(--copper-tint)' },
            { i: 'leaf', l: 'Áreas comunes', desc: 'Jardín, pasillos, lobby', tone: 'var(--sage)', tint: 'var(--sage-tint)' },
            { i: 'pin', l: 'Otro', desc: 'Lo describirás en texto', tone: 'var(--ink-muted)', tint: 'rgba(82,74,64,0.08)' },
          ].map((o, i) => (
            <div key={i} style={{
              padding: '16px',
              borderRadius: 14,
              border: o.sel ? '1.5px solid var(--ink)' : '1px solid var(--line)',
              background: o.sel ? 'var(--paper-warm)' : 'var(--paper)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: o.tint, color: o.tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={o.i} size={18} color={o.tone} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{o.l}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>{o.desc}</div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: 999,
                border: '1.5px solid', borderColor: o.sel ? 'var(--ink)' : 'var(--line-strong)',
                background: o.sel ? 'var(--ink)' : 'transparent',
                display: 'grid', placeItems: 'center',
              }}>
                {o.sel && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--paper)' }} />}
              </div>
            </div>
          ))}
        </div>

        {/* Photo prompt */}
        <div style={{ padding: '24px 22px 0' }}>
          <div style={{ padding: 18, borderRadius: 14, background: 'var(--ivory-soft)', border: '1px dashed var(--line-strong)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--paper)', display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" size={18} color="var(--ink-muted)" strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Adjuntar foto</div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>Opcional · ayuda a resolver más rápido</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Siguiente · describe el problema</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   PROFILE — User profile
   ============================================================ */

function ProfileScreen() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Mi perfil</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="settings" size={15} />
          </button>
        </div>

        {/* Hero */}
        <div style={{ padding: '32px 22px 22px', textAlign: 'center' }}>
          <div style={{
            width: 96, height: 96, borderRadius: 999,
            background: 'var(--ink)', color: 'var(--copper-soft)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--display)', fontSize: 42, fontStyle: 'italic',
            margin: '0 auto 16px',
            border: '4px solid var(--paper)',
            boxShadow: '0 1px 0 rgba(26,22,17,0.04), 0 24px 48px -20px rgba(26,22,17,0.20)',
          }}>
            M
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em' }}>Martina Aguilar</h1>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>Edificio Aurelia · Torre B · 12C</div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: 'var(--sage-tint)', color: 'var(--sage)', fontSize: 11, fontWeight: 500, marginTop: 12 }}>
            <span className="dot" /> Residente verificada
          </div>
        </div>

        {/* Stats */}
        <div style={{ margin: '0 22px 22px', padding: '20px 18px', borderRadius: 18, background: 'var(--paper-warm)', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>14</div>
            <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 4 }}>Reservas</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>100<span style={{ fontSize: 12 }}>%</span></div>
            <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 4 }}>Al día</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>3</div>
            <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 4 }}>Años aquí</div>
          </div>
        </div>

        {/* Menu */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 10 }}>Tu unidad</div>
        <div style={{ margin: '0 22px 18px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            { i: 'home', l: 'Datos de la unidad', sub: 'Torre B · 12C · 82 m²' },
            { i: 'users', l: 'Núcleo familiar', sub: '3 personas registradas' },
            { i: 'car', l: 'Estacionamientos', sub: '2 espacios · 1 enchufe EV' },
            { i: 'pin', l: 'Mascotas', sub: 'Coco · Border Collie' },
          ].map((row, i) => (
            <div key={i} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
              <Icon name={row.i} size={16} color="var(--ink-muted)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{row.l}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>{row.sub}</div>
              </div>
              <Icon name="chevron" size={14} color="var(--ink-faint)" />
            </div>
          ))}
        </div>

        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 10 }}>Cuenta</div>
        <div style={{ margin: '0 22px 28px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            { i: 'bell', l: 'Notificaciones' },
            { i: 'eye', l: 'Privacidad' },
            { i: 'coin', l: 'Medios de pago', extra: '3 tarjetas' },
            { i: 'settings', l: 'Preferencias' },
          ].map((row, i) => (
            <div key={i} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
              <Icon name={row.i} size={16} color="var(--ink-muted)" />
              <div style={{ flex: 1, fontSize: 13 }}>{row.l}</div>
              {row.extra && <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', fontFamily: 'var(--mono)' }}>{row.extra}</div>}
              <Icon name="chevron" size={14} color="var(--ink-faint)" />
            </div>
          ))}
        </div>

        <div style={{ padding: '0 22px 16px', fontSize: 11, color: 'var(--ink-tertiary)', textAlign: 'center' }}>
          Convive &amp; Connect v2.0 · cerrar sesión
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   NOTIFICATIONS — Activity feed
   ============================================================ */

function NotificationsScreen() {
  const items = [
    { i: 'check', tone: 'var(--sage)', tint: 'var(--sage-tint)', title: 'Pago confirmado · Webpay', sub: 'Gasto común mayo · $187.420', age: 'hace 4 min', fresh: true },
    { i: 'pool', tone: 'var(--copper)', tint: 'var(--copper-tint)', title: 'Reserva confirmada', sub: 'Piscina · Sáb 30 may, 11:00 – 12:30', age: 'hace 2h', fresh: true },
    { i: 'bell', tone: 'var(--amber)', tint: 'var(--amber-tint)', title: 'Nueva votación abierta', sub: 'Aprobar cambio de jardinería ornamental', age: 'hace 5h', fresh: true },
    { i: 'wrench', tone: 'var(--rose)', tint: 'var(--rose-tint)', title: 'Tu solicitud fue asignada', sub: '#REQ-0241 · Don Manuel responderá hoy', age: 'ayer 18:42' },
    { i: 'store', tone: 'var(--plum)', tint: 'var(--plum-tint)', title: 'Camila R. te envió un mensaje', sub: 'Sobre la bicicleta Trek — ¿sigue disponible?', age: 'ayer 14:10' },
    { i: 'coin', tone: 'var(--sage)', tint: 'var(--sage-tint)', title: 'Recordatorio · Gasto común', sub: 'Junio se publica el 28 de mayo', age: 'hace 2d' },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '0 22px 22px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Bandeja de entrada</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
              <span style={{ fontStyle: 'italic' }}>Hoy</span>
            </h1>
          </div>
          <button style={{ fontSize: 12, color: 'var(--copper)', background: 'transparent', border: 'none', fontWeight: 500 }}>Marcar todo</button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 22px 4px', display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'Todas', n: 12, sel: true },
            { l: 'Sin leer', n: 3 },
            { l: 'Importantes', n: 2 },
          ].map((t, i) => (
            <div key={i} style={{
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: 12,
              background: t.sel ? 'var(--ink)' : 'transparent',
              color: t.sel ? 'var(--paper)' : 'var(--ink-muted)',
              border: t.sel ? 'none' : '1px solid var(--line)',
            }}>
              {t.l} <span style={{ opacity: 0.5, marginLeft: 2 }}>{t.n}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div style={{ padding: '0 22px 22px' }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: '14px 0', display: 'flex', gap: 12, borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none', position: 'relative' }}>
              {it.fresh && (
                <div style={{ position: 'absolute', left: -10, top: 24, width: 6, height: 6, borderRadius: 999, background: 'var(--copper)' }} />
              )}
              <div style={{ width: 36, height: 36, borderRadius: 10, background: it.tint, color: it.tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={it.i} size={15} color={it.tone} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: it.fresh ? 500 : 400, color: 'var(--ink)' }}>{it.title}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>{it.age}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.4 }}>{it.sub}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   ONBOARDING — Welcome flow
   ============================================================ */

function OnboardingScreen() {
  return (
    <PhoneFrame>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* Hero block */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(155deg, #1A1611 0%, #2A241D 100%)',
          color: 'var(--paper)',
          padding: '60px 28px 36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative grain */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.55,
            backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(181,102,78,0.30) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(110,130,104,0.18) 0%, transparent 45%)'
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--paper)', color: 'var(--ink)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 17, fontStyle: 'italic' }}>c</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>
                Convive<span style={{ fontStyle: 'italic', color: 'var(--copper-soft)' }}> &amp; </span>Connect
              </div>
            </div>

            <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.5)', marginBottom: 22 }}>
              Bienvenida, Martina
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 48, lineHeight: 1.0, letterSpacing: '-0.025em', fontWeight: 400 }}>
              Tu edificio,<br />
              <span style={{ fontStyle: 'italic', color: 'var(--copper-soft)' }}>tu gente</span>,<br />
              en un solo lugar.
            </h1>
          </div>

          {/* Floating card */}
          <div style={{ position: 'relative', marginTop: 36 }}>
            <div style={{
              padding: 18,
              borderRadius: 18,
              background: 'rgba(244,239,230,0.06)',
              border: '1px solid rgba(244,239,230,0.12)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--copper)', display: 'grid', placeItems: 'center' }}>
                <Icon name="sparkles" size={16} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Coco AI te está esperando</div>
                <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.6)', marginTop: 2 }}>Resuelve dudas, pagos y reservas en segundos.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom sheet */}
        <div style={{ padding: '28px 22px 22px', background: 'var(--paper)', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, position: 'relative', zIndex: 2 }}>
          {/* dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 22 }}>
            {[true, false, false].map((sel, i) => (
              <div key={i} style={{ width: sel ? 24 : 6, height: 6, borderRadius: 999, background: sel ? 'var(--ink)' : 'var(--line-strong)' }} />
            ))}
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.5, marginBottom: 20 }}>
            En 3 pasos te dejamos al día con tu comunidad: ubicamos tu unidad, registramos tus pagos y conoces a tus vecinos.
          </div>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
            Comenzar onboarding <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
          <button style={{ width: '100%', padding: '14px', marginTop: 8, background: 'transparent', color: 'var(--ink-muted)', border: 'none', fontSize: 13 }}>
            Ya tengo cuenta — ingresar
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   LOGIN — Authentication
   ============================================================ */

function LoginScreen() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">

        {/* Brand block */}
        <div style={{ padding: '40px 28px 0', flex: 0.55, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--ink)', color: 'var(--copper-soft)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 28, fontStyle: 'italic', marginBottom: 22 }}>c</div>

          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1.0, letterSpacing: '-0.02em', fontWeight: 400 }}>
            Ingresa a tu<br />
            <span style={{ fontStyle: 'italic', color: 'var(--copper)' }}>comunidad</span>.
          </h1>
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
            Te enviaremos un código a tu mail o número de RUT registrado por tu administración.
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '28px 28px 28px', flex: 1 }}>

          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--paper-warm)', borderRadius: 12, padding: 4, marginBottom: 22 }}>
            {[
              { l: 'Mail', sel: true },
              { l: 'RUT' },
            ].map((t, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center', padding: '10px',
                borderRadius: 9,
                background: t.sel ? 'var(--paper)' : 'transparent',
                fontSize: 13,
                color: t.sel ? 'var(--ink)' : 'var(--ink-tertiary)',
                fontWeight: t.sel ? 500 : 400,
                boxShadow: t.sel ? '0 1px 2px rgba(26,22,17,0.06)' : 'none',
              }}>{t.l}</div>
            ))}
          </div>

          {/* Input */}
          <label style={{ fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Mail registrado</label>
          <div style={{ marginTop: 6, padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--ink)', background: 'var(--paper)', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink)' }}>martina.aguilar@</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-tertiary)' }}>mail.com</span>
            <span style={{ marginLeft: 4, width: 1.5, height: 14, background: 'var(--copper)', animation: 'blink 1s infinite' }} />
          </div>

          {/* CTA */}
          <button style={{ width: '100%', padding: '16px', marginTop: 18, borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
            Enviar código <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>o continúa con</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Sociales */}
          <div style={{ display: 'flex', gap: 8 }}>
            {['Google', 'Apple', 'Clave Única'].map((l, i) => (
              <button key={i} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 26, fontSize: 12, color: 'var(--ink-tertiary)', lineHeight: 1.5 }}>
            ¿Aún no tienes cuenta? <span style={{ color: 'var(--copper)', fontWeight: 500 }}>Habla con tu administración</span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

window.VotacionesScreen = VotacionesScreen;
window.FeedScreen = FeedScreen;
window.SocialScreen = SocialScreen;
window.DirectorioScreen = DirectorioScreen;
window.ServiciosScreen = ServiciosScreen;
window.ProfileScreen = ProfileScreen;
window.NotificationsScreen = NotificationsScreen;
window.OnboardingScreen = OnboardingScreen;
window.LoginScreen = LoginScreen;
