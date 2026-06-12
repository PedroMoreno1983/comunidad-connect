/* global React */
/* Analytics screens — Cotton-inspired blade fans, score donuts, dot matrix
   Built on the Convive warm-ivory system. */

const { AdminShell, Icon } = window;

const DATA = {
  blue: '#2F6CB0', green: '#3E8E57', red: '#C24A3E', yellow: '#E0B23C',
  orange: '#D27A38', purple: '#7C6BA6', lime: '#93A23E', teal: '#3E8E8E',
};

/* darken a hex by factor (0–1) → rgb() string, for the ribbon fold */
function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

/* ============================================================
   BLADE — single folded ribbon
   ============================================================ */
function Blade({ angle, length, width, color, origin, tipInset = 0, fold = 0.66 }) {
  const w = width;
  const left = `${-w / 2},0 0,0 0,${-length} ${-w / 2},${-length + tipInset}`;
  const right = `${w / 2},0 0,0 0,${-length} ${w / 2},${-length + tipInset}`;
  return (
    <g transform={`translate(${origin.x},${origin.y}) rotate(${angle})`}>
      <polygon points={left} fill={color} />
      <polygon points={right} fill={darken(color, fold)} />
    </g>
  );
}

/* tip coordinate of a blade after rotation */
function tipOf(origin, angle, length, extra = 0) {
  const a = (angle * Math.PI) / 180;
  const L = length + extra;
  return { x: origin.x + L * Math.sin(a), y: origin.y - L * Math.cos(a) };
}

/* ============================================================
   BLADE FAN — radial chart with optional grid + tip labels
   ============================================================ */
function BladeFan({
  width = 520, height = 460,
  origin = { x: 90, y: 400 },
  startAngle = 8, endAngle = 84,
  blades = [],            // [{ color, value, max, label, delta }]
  maxLen = 300,
  bladeWidth = 16,
  grid = true,
  gridRings = [1, 2, 3, 4, 5],
  labels = true,
}) {
  const n = blades.length;
  const span = endAngle - startAngle;
  const maxVal = Math.max(...blades.map(b => b.max ?? b.value));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="bladeShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1A1611" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* radial grid */}
      {grid && gridRings.map((ring, i) => {
        const r = (ring / Math.max(...gridRings)) * maxLen;
        const a0 = (startAngle * Math.PI) / 180;
        const a1 = (endAngle * Math.PI) / 180;
        const x0 = origin.x + r * Math.sin(a0);
        const y0 = origin.y - r * Math.cos(a0);
        const x1 = origin.x + r * Math.sin(a1);
        const y1 = origin.y - r * Math.cos(a1);
        const large = (endAngle - startAngle) > 180 ? 1 : 0;
        return (
          <g key={i}>
            <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke="var(--line)" strokeWidth="1" />
            <text x={origin.x + r * Math.sin(a1) + 8} y={origin.y - r * Math.cos(a1)} fontFamily="var(--mono)" fontSize="9" fill="var(--ink-faint)">{ring}</text>
          </g>
        );
      })}

      {/* blades */}
      <g filter="url(#bladeShadow)">
        {blades.map((b, i) => {
          const angle = n === 1 ? (startAngle + endAngle) / 2 : startAngle + (i / (n - 1)) * span;
          const len = ((b.value) / maxVal) * maxLen;
          return <Blade key={i} angle={angle} length={len} width={bladeWidth} color={b.color} origin={origin} />;
        })}
      </g>

      {/* tip labels with leaders */}
      {labels && blades.map((b, i) => {
        const angle = n === 1 ? (startAngle + endAngle) / 2 : startAngle + (i / (n - 1)) * span;
        const len = ((b.value) / maxVal) * maxLen;
        const tip = tipOf(origin, angle, len, 14);
        const lead = tipOf(origin, angle, len, 4);
        return (
          <g key={`l${i}`}>
            <line x1={lead.x} y1={lead.y} x2={tip.x} y2={tip.y} stroke="var(--line-strong)" strokeWidth="1" />
            <text x={tip.x} y={tip.y - 4} fontFamily="var(--display)" fontSize="18" fill="var(--ink)" textAnchor="middle">{b.value.toFixed(2)}</text>
            {b.delta && <text x={tip.x} y={tip.y + 9} fontFamily="var(--mono)" fontSize="9" fill={b.delta[0] === '+' ? 'var(--sage)' : 'var(--rose)'} textAnchor="middle">{b.delta}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   SCORE DONUT — small circular indicator
   ============================================================ */
function ScoreDonut({ score, max = 5, color, size = 38 }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = score / max;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ivory-soft)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${frac * c} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <circle cx={size / 2} cy={size / 2} r="3" fill={color} />
    </svg>
  );
}

/* score row (left column) */
function ScoreRow({ donut, label, score, delta, sub, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <ScoreDonut score={score} color={donut} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', fontFamily: 'var(--mono)' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1 }}>{score.toFixed(2)}</span>
          {delta && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: delta[0] === '+' ? 'var(--sage)' : 'var(--rose)' }}>{delta}</span>}
        </div>
      </div>
    </div>
  );
}

/* editorial section header (Cotton "Evaluation < >" bar) */
function VizHeader({ title, eyebrow, range = "30D · mayo 2026" }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <div>
          <div className="uppercase-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 44, lineHeight: 0.95, letterSpacing: '-0.02em', fontWeight: 400 }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {['chevron', 'chevron'].map((_, i) => (
            <button key={i} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', display: 'grid', placeItems: 'center', transform: i === 0 ? 'scaleX(-1)' : 'none' }}>
              <Icon name="chevron" size={14} color="var(--ink-muted)" strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }}>
          <Icon name="sparkles" size={13} color="var(--copper)" />
          <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>Pregúntale a Coco…</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--ink)', color: 'var(--paper)' }}>
          <Icon name="calendar" size={13} color="var(--paper)" />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{range}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   1. INDICADORES — Program-scores analog
   ============================================================ */
function IndicadoresScreen() {
  const scores = [
    { label: 'Satisfacción de residentes', score: 4.25, delta: '+0.2', sub: '186 respuestas', color: DATA.blue },
    { label: 'Estado de pagos al día',      score: 3.67, delta: '−0.1', sub: '171 de 186 unidades', color: DATA.yellow },
    { label: 'Mantención resuelta a tiempo', score: 3.83, delta: '+0.3', sub: '142 solicitudes', color: DATA.green },
    { label: 'Uso de amenidades',           score: 4.83, delta: '+0.1', sub: '512 reservas', color: DATA.teal },
    { label: 'Seguridad percibida',         score: 3.67, delta: '0.0',  sub: '186 respuestas', color: DATA.orange },
    { label: 'Convivencia y reglamento',    score: 1.67, delta: '−0.4', sub: '38 incidencias', color: DATA.red },
  ];

  return (
    <AdminShell activeNav="home" role="admin">
      <VizHeader eyebrow="Indicadores de gestión" title="Evaluación" />

      <div style={{ marginBottom: 18 }}>
        <div className="uppercase-eyebrow" style={{ marginBottom: 4 }}>Dimensiones con datos reportados</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 32, alignItems: 'start' }}>
        {/* Left: score cards */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: '8px 22px' }}>
          {scores.map((s, i) => (
            <ScoreRow key={i} donut={s.color} label={s.label} score={s.score} delta={s.delta} sub={s.sub} last={i === scores.length - 1} />
          ))}
        </div>

        {/* Right: blade fan */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: '28px 24px', minHeight: 480, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="uppercase-eyebrow">Puntaje por dimensión · escala 1–5</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)' }}>n = 186</div>
          </div>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <BladeFan
              width={560} height={440}
              origin={{ x: 70, y: 380 }}
              startAngle={10} endAngle={82}
              maxLen={300} bladeWidth={18}
              blades={scores.map(s => ({ color: s.color, value: s.score, max: 5, delta: s.delta }))}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

/* ============================================================
   2. COSTO POR CATEGORÍA — the dramatic peacock fan
   ============================================================ */
function CostoScreen() {
  const cats = [
    { label: 'Administración',          clp: 42500, color: DATA.blue },
    { label: 'Agua caliente comunitaria', clp: 38900, color: DATA.green },
    { label: 'Conserjería 24/7',         clp: 38900, color: DATA.orange },
    { label: 'Ascensores y mantención',  clp: 31700, color: DATA.yellow },
    { label: 'Electricidad comunes',     clp: 28200, color: DATA.red },
    { label: 'Áreas verdes',             clp: 12400, color: DATA.purple },
    { label: 'Fondo de reserva',         clp: 7220,  color: DATA.lime },
  ];

  return (
    <AdminShell activeNav="gastos" role="admin">
      <VizHeader eyebrow="Gastos comunes · desglose" title="Costos" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'stretch' }}>
        {/* Fan */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: '28px 24px', position: 'relative', overflow: 'hidden', minHeight: 520 }}>
          <div className="uppercase-eyebrow" style={{ position: 'absolute', top: 24, left: 24 }}>Costo mensual por categoría</div>
          <div style={{ position: 'absolute', bottom: 24, left: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-tertiary)' }}>Total · $199.820 CLP / unidad</div>
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <BladeFan
              width={620} height={480}
              origin={{ x: 110, y: 360 }}
              startAngle={18} endAngle={120}
              maxLen={340} bladeWidth={26}
              grid={false} labels={false}
              blades={cats.map(c => ({ color: c.color, value: c.clp }))}
            />
          </div>
        </div>

        {/* Legend */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 28 }}>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Costo promedio<br /><span style={{ fontStyle: 'italic' }}>por categoría</span>
          </h2>
          <div className="uppercase-eyebrow" style={{ marginBottom: 22 }}>Por unidad · mensual</div>

          {cats.map((c, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: i < cats.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: c.color }} />
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingLeft: 17 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-tertiary)' }}>CLP</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1 }}>{c.clp.toLocaleString('es-CL')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

/* ============================================================
   3. RESIDENTES · demografía — donuts + dot matrix + mini fan
   ============================================================ */
function DotMatrix({ rows = 6, cols = 32, filled, color = DATA.blue }) {
  const total = rows * cols;
  const dots = [];
  for (let i = 0; i < total; i++) {
    const on = i < filled;
    dots.push(
      <div key={i} style={{ width: 7, height: 7, borderRadius: 999, background: on ? color : 'var(--ivory-soft)' }} />
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 5 }}>
      {dots}
    </div>
  );
}

function BigDonut({ value, label, sub, color, pct }) {
  const size = 96, r = size / 2 - 8, c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ivory-soft)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div>
        <div className="uppercase-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}

function DemografiaScreen() {
  const otros = [
    { label: 'Con mascotas', color: DATA.green, value: 84 },
    { label: 'Trabaja remoto', color: DATA.blue, value: 62 },
    { label: 'Adulto mayor', color: DATA.purple, value: 38 },
    { label: 'Familias con niños', color: DATA.orange, value: 71 },
    { label: 'Vehículo eléctrico', color: DATA.teal, value: 24 },
  ];

  return (
    <AdminShell activeNav="residentes" role="admin">
      <VizHeader eyebrow="Comunidad · perfil" title="Residentes" />

      {/* Unit dot matrix */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 28, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <div className="uppercase-eyebrow" style={{ marginBottom: 6 }}>192 unidades · estado</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24 }}>96.8% ocupación</div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: DATA.blue }} /> Ocupadas 186</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--ivory-soft)' }} /> Vacantes 6</span>
          </div>
        </div>
        <DotMatrix rows={6} cols={32} filled={186} color={DATA.blue} />
      </div>

      {/* Donuts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 16 }}>
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 28 }}>
          <BigDonut label="Tenencia" value="68%" sub="Propietarios · 126 unidades" color={DATA.blue} pct={68} />
        </div>
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 28 }}>
          <BigDonut label="Adopción app" value="93%" sub="174 con app activa" color={DATA.green} pct={93} />
        </div>

        {/* Mini fan — otros */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 18, padding: 28 }}>
          <div className="uppercase-eyebrow" style={{ marginBottom: 14 }}>Otras características</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <BladeFan
              width={180} height={150}
              origin={{ x: 30, y: 125 }}
              startAngle={12} endAngle={80}
              maxLen={110} bladeWidth={11}
              grid={false} labels={false}
              blades={otros.map(o => ({ color: o.color, value: o.value }))}
            />
            <div style={{ flex: 1 }}>
              {otros.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--ink-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: o.color }} /> {o.label}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{o.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

window.IndicadoresScreen = IndicadoresScreen;
window.CostoScreen = CostoScreen;
window.DemografiaScreen = DemografiaScreen;
