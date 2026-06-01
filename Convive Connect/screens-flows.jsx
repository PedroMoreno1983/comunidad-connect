/* global React */
/* Step-by-step flows — Pago, Visita, Votación */

const { PhoneFrame, Icon } = window;

/* Step progress component */
function StepDots({ total, current, accent = 'var(--ink)' }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 999,
          background: i <= current ? accent : 'var(--ivory-soft)',
        }} />
      ))}
    </div>
  );
}

/* ============================================================
   PAGO · Flujo de 3 pasos
   ============================================================ */

function PayStep1Review() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pago · paso 1 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={0} />
        </div>

        <div style={{ padding: '8px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Resumen</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Revisemos lo que <span style={{ fontStyle: 'italic' }}>vas a pagar</span>
          </h1>
        </div>

        {/* Amount card */}
        <div style={{ margin: '24px 22px 16px', padding: 22, borderRadius: 20, background: 'var(--ink)', color: 'var(--paper)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(181,102,78,0.30) 0%, transparent 60%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.55)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>Gasto común · Mayo 2026</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'rgba(244,239,230,0.6)' }}>$</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 52, lineHeight: 1, letterSpacing: '-0.02em' }}>187.420</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(244,239,230,0.5)', marginLeft: 6 }}>CLP</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(244,239,230,0.65)' }}>Vence el 02 de junio · sin intereses hasta esa fecha</div>
          </div>
        </div>

        {/* Breakdown collapsed */}
        <div style={{ padding: '0 22px', marginBottom: 16 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
            {[
              { l: 'Cuota base', v: '142.500' },
              { l: 'Multas y recargos', v: '0', muted: true },
              { l: 'Servicios extra (lavandería)', v: '4.200' },
              { l: 'Saldo arrastre abril', v: '−2.500', muted: true },
              { l: 'Reajuste UF', v: '+43.220', muted: true },
            ].map((r, i, arr) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontSize: 12, color: r.muted ? 'var(--ink-tertiary)' : 'var(--ink-muted)' }}>{r.l}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: r.muted ? 'var(--ink-tertiary)' : 'var(--ink)' }}>${r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quotas toggle */}
        <div style={{ padding: '0 22px', marginBottom: 18 }}>
          <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--paper-warm)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--paper)', display: 'grid', placeItems: 'center' }}>
              <Icon name="coin" size={16} color="var(--copper)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Pagar en 3 cuotas sin interés</div>
              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>3 × $62.474 con tarjeta de crédito</div>
            </div>
            <div style={{ width: 36, height: 22, borderRadius: 999, background: 'var(--line)', padding: 2 }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--paper)' }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Continuar al método de pago</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function PayStep2Method() {
  const methods = [
    { i: 'coin', l: 'Webpay Oneclick', sub: 'Visa débito ****4521', sel: true, fee: 'Sin recargo' },
    { i: 'coin', l: 'Tarjeta crédito', sub: 'Banco de Chile ****7782', fee: '3 cuotas sin interés' },
    { i: 'receipt', l: 'Transferencia bancaria', sub: 'Acreditación 24 hrs', fee: 'Sin recargo' },
    { i: 'store', l: 'Klap en efectivo', sub: 'Pagas en cualquier sucursal', fee: '$300 comisión' },
  ];

  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pago · paso 2 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={1} />
        </div>

        <div style={{ padding: '8px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Método</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿Cómo prefieres <span style={{ fontStyle: 'italic' }}>pagar</span> hoy?
          </h1>
        </div>

        {/* Methods */}
        <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {methods.map((m, i) => (
            <div key={i} style={{
              padding: '16px',
              borderRadius: 14,
              border: m.sel ? '1.5px solid var(--ink)' : '1px solid var(--line)',
              background: m.sel ? 'var(--paper-warm)' : 'var(--paper)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.sel ? 'var(--ink)' : 'var(--paper-warm)', display: 'grid', placeItems: 'center' }}>
                <Icon name={m.i} size={16} color={m.sel ? 'var(--copper-soft)' : 'var(--ink-muted)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.l}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>{m.sub}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: m.fee === 'Sin recargo' ? 'var(--sage)' : 'var(--ink-tertiary)', fontWeight: 500 }}>{m.fee}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary mini */}
        <div style={{ margin: '22px 22px 0', padding: 16, borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total a cargar</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, marginTop: 2 }}>$187.420</div>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.55)', textAlign: 'right' }}>
            Webpay Oneclick<br />****4521
          </div>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--copper)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Confirmar pago de $187.420</span>
            <Icon name="arrowSm" size={16} color="#fff" />
          </button>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--ink-tertiary)' }}>
            Cobro inmediato · recibirás boleta SII
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function PayStep3Confirm() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, opacity: 0 }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pago · paso 3 de 3</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} />
          </button>
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={2} accent="var(--sage)" />
        </div>

        {/* Big confirmation */}
        <div style={{ padding: '36px 28px 24px', textAlign: 'center' }}>
          <div style={{
            width: 90, height: 90, borderRadius: 999,
            background: 'var(--sage-tint)', color: 'var(--sage)',
            display: 'grid', placeItems: 'center',
            margin: '0 auto 24px',
            border: '4px solid var(--paper)',
            boxShadow: '0 24px 48px -20px rgba(110,130,104,0.40)',
          }}>
            <Icon name="check" size={36} color="var(--sage)" strokeWidth={2.2} />
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Pago <span style={{ fontStyle: 'italic', color: 'var(--sage)' }}>realizado</span>.
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Tu gasto común de mayo quedó al día. Te enviamos la boleta a martina@mail.com.
          </p>
        </div>

        {/* Receipt card */}
        <div style={{ margin: '0 22px 16px', padding: 20, borderRadius: 18, background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed var(--line-strong)' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', letterSpacing: '0.1em' }}>COMPROBANTE</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 4 }}>#TX-20260525-1432</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)', letterSpacing: '0.1em' }}>FECHA</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 4 }}>25.05 · 14:32</div>
            </div>
          </div>

          {[
            { l: 'Concepto', v: 'Gasto común mayo' },
            { l: 'Unidad', v: 'Torre B · 12C' },
            { l: 'Método', v: 'Webpay ****4521' },
            { l: 'Boleta SII', v: '#0089421' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>{r.l}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>{r.v}</span>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', borderTop: '1px solid var(--line)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Total cargado</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>$187.420</span>
          </div>
        </div>

        <div style={{ padding: '14px 22px 16px', marginTop: 'auto', display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '14px', borderRadius: 14, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-strong)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Descargar PDF
          </button>
          <button style={{ flex: 1.4, padding: '14px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Volver al home
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   VISITA · Flujo de 3 pasos (residente registra visita)
   ============================================================ */

function VisitStep1Identify() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Visita · paso 1 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={0} />
        </div>

        <div style={{ padding: '8px 22px 24px' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Anuncia una visita</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿A quién <span style={{ fontStyle: 'italic' }}>estás esperando</span>?
          </h1>
        </div>

        {/* Frequent */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 10 }}>Visitas frecuentes</div>
        <div style={{ padding: '0 22px', display: 'flex', gap: 8, overflow: 'auto', marginBottom: 22 }} className="no-scrollbar">
          {[
            { n: 'María Saavedra', sub: 'Limpieza · cada lunes', sel: true },
            { n: 'Don Manuel', sub: 'Plomería' },
            { n: 'Pet Concierge', sub: 'Paseador' },
            { n: 'Hugo Ramos', sub: 'Hermano' },
          ].map((c, i) => (
            <div key={i} style={{
              flexShrink: 0,
              padding: 14,
              borderRadius: 14,
              background: c.sel ? 'var(--ink)' : 'var(--paper)',
              color: c.sel ? 'var(--paper)' : 'var(--ink)',
              border: c.sel ? 'none' : '1px solid var(--line)',
              width: 160,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: c.sel ? 'var(--copper)' : 'var(--paper-warm)', color: c.sel ? '#fff' : 'var(--ink-muted)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, marginBottom: 10 }}>
                {c.n[0]}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{c.n}</div>
              <div style={{ fontSize: 11, color: c.sel ? 'rgba(244,239,230,0.6)' : 'var(--ink-tertiary)', marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Or new */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 10 }}>O registra una nueva</div>
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '14px 16px', borderRadius: 14, border: '1.5px solid var(--ink)', background: 'var(--paper)' }}>
            <label style={{ fontSize: 10, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Nombre completo</label>
            <div style={{ marginTop: 2, fontSize: 14, color: 'var(--ink)' }}>María Saavedra<span style={{ marginLeft: 4, width: 1.5, height: 14, background: 'var(--copper)', display: 'inline-block', verticalAlign: 'middle' }} /></div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--paper)' }}>
            <label style={{ fontSize: 10, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>RUT (opcional)</label>
            <div style={{ marginTop: 2, fontSize: 14, color: 'var(--ink-tertiary)' }}>15.234.812-9</div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--paper)' }}>
            <label style={{ fontSize: 10, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tipo</label>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              {['Visita', 'Servicio', 'Encomienda', 'Trabajos'].map((t, i) => (
                <span key={i} style={{
                  padding: '5px 10px', borderRadius: 999, fontSize: 11,
                  background: i === 1 ? 'var(--ink)' : 'var(--paper-warm)',
                  color: i === 1 ? 'var(--paper)' : 'var(--ink-muted)',
                }}>{t}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Continuar</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function VisitStep2When() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Visita · paso 2 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={1} />
        </div>

        <div style={{ padding: '8px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Cuándo</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿Para <span style={{ fontStyle: 'italic' }}>cuándo</span> la avisamos?
          </h1>
        </div>

        {/* Quick presets */}
        <div style={{ padding: '22px 22px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { l: 'Ahora', sub: 'En el lobby' },
            { l: 'En 1 hora', sub: '15:30' },
            { l: 'Hoy más tarde', sub: 'Define hora', sel: true },
            { l: 'Otro día', sub: 'Calendario' },
          ].map((p, i) => (
            <div key={i} style={{
              padding: '16px',
              borderRadius: 14,
              background: p.sel ? 'var(--ink)' : 'var(--paper)',
              color: p.sel ? 'var(--paper)' : 'var(--ink)',
              border: p.sel ? 'none' : '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.l}</div>
              <div style={{ fontSize: 11, color: p.sel ? 'rgba(244,239,230,0.6)' : 'var(--ink-tertiary)', marginTop: 4 }}>{p.sub}</div>
            </div>
          ))}
        </div>

        {/* Time picker */}
        <div style={{ padding: '20px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Selecciona hora</div>
          <div style={{ padding: 18, borderRadius: 14, background: 'var(--paper-warm)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>
                <span style={{ color: 'var(--ink-tertiary)' }}>15</span><span>:18</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
              {['15:00', '15:30', '16:00', '16:30', '17:00', '17:30'].map((t, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--mono)', fontSize: 11,
                  color: i === 1 ? 'var(--ink)' : 'var(--ink-tertiary)',
                  fontWeight: i === 1 ? 500 : 400,
                }}>{t}</span>
              ))}
            </div>
            <div style={{ height: 4, background: 'var(--ivory-soft)', borderRadius: 999, marginTop: 14, position: 'relative' }}>
              <div style={{ position: 'absolute', left: '20%', top: -6, width: 16, height: 16, borderRadius: 999, background: 'var(--ink)', border: '3px solid var(--paper)' }} />
            </div>
          </div>
        </div>

        {/* Optional message */}
        <div style={{ padding: '18px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Mensaje a conserjería (opcional)</div>
          <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink-muted)', minHeight: 64 }}>
            Por favor, dejarla pasar sin avisarme.
          </div>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Generar QR de acceso</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function VisitStep3QR() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, opacity: 0 }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Visita · paso 3 de 3</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} />
          </button>
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={2} accent="var(--sage)" />
        </div>

        <div style={{ padding: '12px 22px 0', textAlign: 'center' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Acceso autorizado</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            María Saavedra<br />
            <span style={{ fontStyle: 'italic', color: 'var(--sage)' }}>está esperada</span>.
          </h1>
        </div>

        {/* QR */}
        <div style={{ margin: '24px 22px 0', padding: 24, borderRadius: 20, background: 'var(--ink)', color: 'var(--paper)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(110,130,104,0.25) 0%, transparent 60%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-block', padding: 14, background: 'var(--paper)', borderRadius: 14 }}>
              {/* Fake QR */}
              <svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
                <rect width="160" height="160" fill="#FAF7F1"/>
                {/* finder patterns */}
                <rect x="8" y="8" width="38" height="38" fill="#1A1611"/>
                <rect x="14" y="14" width="26" height="26" fill="#FAF7F1"/>
                <rect x="20" y="20" width="14" height="14" fill="#1A1611"/>
                <rect x="114" y="8" width="38" height="38" fill="#1A1611"/>
                <rect x="120" y="14" width="26" height="26" fill="#FAF7F1"/>
                <rect x="126" y="20" width="14" height="14" fill="#1A1611"/>
                <rect x="8" y="114" width="38" height="38" fill="#1A1611"/>
                <rect x="14" y="120" width="26" height="26" fill="#FAF7F1"/>
                <rect x="20" y="126" width="14" height="14" fill="#1A1611"/>
                {/* random data dots */}
                {Array.from({ length: 350 }).map((_, i) => {
                  const x = (i * 13) % 144 + 8;
                  const y = (i * 17 + i * i) % 144 + 8;
                  if ((x < 50 && y < 50) || (x > 110 && y < 50) || (x < 50 && y > 110)) return null;
                  if ((i * 7) % 11 < 5) return null;
                  return <rect key={i} x={x} y={y} width="6" height="6" fill="#1A1611" />;
                })}
                {/* logo center */}
                <rect x="64" y="64" width="32" height="32" fill="#FAF7F1"/>
                <rect x="68" y="68" width="24" height="24" fill="#B5664E"/>
                <text x="80" y="86" fontFamily="serif" fontSize="18" fontStyle="italic" fill="#FAF7F1" textAnchor="middle">c</text>
              </svg>
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(244,239,230,0.7)', letterSpacing: '0.15em' }}>
              CCV-89AT-204Q
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(244,239,230,0.5)' }}>
              Válido hasta hoy 17:30 · 1 entrada
            </div>
          </div>
        </div>

        {/* Share row */}
        <div style={{ padding: '20px 22px 0', display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line-strong)', fontSize: 12, color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="send" size={13} /> Enviar por WhatsApp
          </button>
          <button style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line-strong)', fontSize: 12, color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="chat" size={13} /> Mensaje
          </button>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Volver al home
          </button>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--ink-tertiary)' }}>
            Conserjería ya fue notificada
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ============================================================
   ASAMBLEA · Flujo de 3 pasos (votar)
   ============================================================ */

function AsambleaStep1Read() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Asamblea · paso 1 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={0} />
        </div>

        <div style={{ padding: '8px 22px 22px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <span className="tag" style={{ color: 'var(--copper)', borderColor: 'rgba(181,102,78,0.30)', padding: '3px 10px', fontSize: 10 }}>
              <span className="dot" /> En sesión
            </span>
            <span className="tag" style={{ color: 'var(--ink-muted)', borderColor: 'var(--line)', padding: '3px 10px', fontSize: 10 }}>Punto 3 de 7</span>
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Cambio de <span style={{ fontStyle: 'italic' }}>jardinería ornamental</span> por especies nativas
          </h1>
        </div>

        {/* Live counter */}
        <div style={{ margin: '0 22px 18px', padding: 18, borderRadius: 16, background: 'var(--ink)', color: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(110,130,104,0.30)', display: 'grid', placeItems: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 6, borderRadius: 999, background: 'var(--sage)', animation: 'pulse 2s infinite' }} />
            <div style={{ position: 'relative', width: 10, height: 10, borderRadius: 999, background: 'var(--paper)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(244,239,230,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tiempo restante para votar</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, marginTop: 4, letterSpacing: '0.05em' }}>04:32</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'rgba(244,239,230,0.55)' }}>Conectados</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, marginTop: 2 }}>147</div>
          </div>
        </div>

        {/* Proposal body */}
        <div className="uppercase-eyebrow" style={{ padding: '0 22px', marginBottom: 10 }}>Propuesta</div>
        <div style={{ padding: '0 22px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.65, marginBottom: 18 }}>
          Reemplazar la actual jardinería ornamental tropical (38 especies, requieren riego diario y poda profesional) por un diseño paisajístico con <span style={{ fontStyle: 'italic', fontFamily: 'var(--display)' }}>especies nativas chilenas</span> (peumo, quillay, chagual, palmas chilenas).
        </div>

        {/* Pros / cons */}
        <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <div style={{ padding: 14, borderRadius: 14, background: 'var(--sage-tint)', border: '1px solid rgba(110,130,104,0.20)' }}>
            <div style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 500, marginBottom: 8 }}>↓ 38%</div>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.4 }}>Reducción en consumo de agua</div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: 'var(--copper-tint)', border: '1px solid rgba(181,102,78,0.20)' }}>
            <div style={{ fontSize: 11, color: 'var(--copper)', fontWeight: 500, marginBottom: 8 }}>14 meses</div>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.4 }}>Recuperación de la inversión inicial</div>
          </div>
        </div>

        {/* Documents */}
        <div style={{ padding: '0 22px', marginBottom: 22 }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Documentos adjuntos</div>
          {[
            { l: 'Propuesta técnica completa', s: '12 págs · PDF' },
            { l: 'Cotización paisajista certificado', s: '4 págs · PDF' },
          ].map((d, i) => (
            <div key={i} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--paper-warm)', display: 'grid', placeItems: 'center' }}>
                <Icon name="receipt" size={14} color="var(--ink-muted)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{d.l}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{d.s}</div>
              </div>
              <Icon name="chevron" size={14} color="var(--ink-faint)" />
            </div>
          ))}
        </div>

        <div style={{ padding: '0 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Continuar a emitir mi voto</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function AsambleaStep2Vote() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevron" size={16} strokeWidth={2} />
          </button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Asamblea · paso 2 de 3</div>
          <button style={{ width: 36, opacity: 0 }} />
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={1} />
        </div>

        <div style={{ padding: '8px 22px 0' }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Tu voto</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            ¿Cómo <span style={{ fontStyle: 'italic' }}>quieres votar</span>?
          </h1>
        </div>

        {/* Big card options */}
        <div style={{ padding: '24px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Yes */}
          <div style={{
            padding: 22,
            borderRadius: 18,
            background: 'var(--sage)',
            color: '#fff',
            display: 'flex', alignItems: 'center', gap: 16,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
            <div style={{ width: 52, height: 52, borderRadius: 999, background: 'rgba(255,255,255,0.20)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="check" size={26} color="#fff" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 24, lineHeight: 1.05 }}>A favor</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Aprobar el cambio a especies nativas</div>
            </div>
          </div>

          {/* No */}
          <div style={{
            padding: 22,
            borderRadius: 18,
            background: 'var(--paper)',
            border: '1px solid var(--line-strong)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: 'var(--rose-tint)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.05 }}>En contra</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Mantener la jardinería actual</div>
            </div>
          </div>

          {/* Abstain */}
          <div style={{
            padding: 22,
            borderRadius: 18,
            background: 'var(--paper-warm)',
            border: '1px dashed var(--line-strong)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: 'var(--paper)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-tertiary)' }}>—</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.05 }}>Abstención</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>No tengo postura formada</div>
            </div>
          </div>
        </div>

        {/* Privacy note */}
        <div style={{ margin: '24px 22px 0', padding: '14px 16px', borderRadius: 12, background: 'var(--paper-warm)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="eye" size={14} color="var(--ink-muted)" />
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Tu voto es <span style={{ fontWeight: 500, color: 'var(--ink)' }}>anónimo y verificable</span>. Recibirás un comprobante con hash blockchain una vez registrado.
          </div>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>Emitir voto · A favor</span>
            <Icon name="arrowSm" size={16} color="var(--paper)" />
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function AsambleaStep3Result() {
  return (
    <PhoneFrame>
      <div style={{ padding: '14px 0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="no-scrollbar">
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button style={{ width: 36, height: 36, opacity: 0 }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Asamblea · paso 3 de 3</div>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={16} />
          </button>
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <StepDots total={3} current={2} accent="var(--sage)" />
        </div>

        {/* Hero */}
        <div style={{ padding: '12px 22px 28px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--sage-tint)', color: 'var(--sage)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
            <Icon name="check" size={26} strokeWidth={2.2} color="var(--sage)" />
          </div>
          <div className="uppercase-eyebrow" style={{ marginBottom: 10 }}>Voto registrado · resultado preliminar</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            La comunidad <span style={{ fontStyle: 'italic', color: 'var(--sage)' }}>aprobó</span> la propuesta.
          </h1>
        </div>

        {/* Donut + breakdown */}
        <div style={{ margin: '0 22px 16px', padding: 22, borderRadius: 18, background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', gap: 22, alignItems: 'center' }}>
          <svg width="110" height="110" viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
            <circle cx="55" cy="55" r="44" fill="none" stroke="var(--ivory-soft)" strokeWidth="14" />
            <circle cx="55" cy="55" r="44" fill="none" stroke="var(--sage)" strokeWidth="14" strokeDasharray="205 276" transform="rotate(-90 55 55)" strokeLinecap="round" />
            <text x="55" y="58" fontFamily="var(--display)" fontSize="22" fill="#1A1611" textAnchor="middle">74%</text>
            <text x="55" y="74" fontFamily="var(--mono)" fontSize="9" fill="#8B8278" textAnchor="middle">A FAVOR</text>
          </svg>
          <div style={{ flex: 1 }}>
            {[
              { l: 'A favor', v: '74%', c: 'var(--sage)', n: '109 votos' },
              { l: 'En contra', v: '18%', c: 'var(--rose)', n: '27 votos' },
              { l: 'Abstención', v: '8%', c: 'var(--ink-tertiary)', n: '11 votos' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: r.c }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink)' }}>{r.l}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{r.n}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quorum */}
        <div style={{ margin: '0 22px 16px', padding: 16, borderRadius: 14, background: 'var(--sage-tint)', border: '1px solid rgba(110,130,104,0.20)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>Quórum alcanzado</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--sage)' }}>78% · 147/186</span>
          </div>
          <div style={{ height: 4, background: 'rgba(110,130,104,0.20)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: '78%', height: '100%', background: 'var(--sage)' }} />
          </div>
        </div>

        {/* Receipt */}
        <div style={{ margin: '0 22px 0', padding: '14px 16px', borderRadius: 12, background: 'var(--paper-warm)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="check" size={14} color="var(--sage)" />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>
            <div style={{ color: 'var(--ink)', fontWeight: 500, marginBottom: 2 }}>Tu voto está registrado</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>hash: 0x8a2f…d49c</div>
          </div>
        </div>

        <div style={{ padding: '24px 22px 16px', marginTop: 'auto', display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '14px', borderRadius: 14, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-strong)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Comprobante
          </button>
          <button style={{ flex: 1.4, padding: '14px', borderRadius: 14, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Siguiente punto →
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

window.PayStep1Review = PayStep1Review;
window.PayStep2Method = PayStep2Method;
window.PayStep3Confirm = PayStep3Confirm;
window.VisitStep1Identify = VisitStep1Identify;
window.VisitStep2When = VisitStep2When;
window.VisitStep3QR = VisitStep3QR;
window.AsambleaStep1Read = AsambleaStep1Read;
window.AsambleaStep2Vote = AsambleaStep2Vote;
window.AsambleaStep3Result = AsambleaStep3Result;
