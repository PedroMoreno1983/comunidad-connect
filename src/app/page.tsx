"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import {
  Sun, Moon, HelpCircle,
  ArrowRight,
  ShieldCheck, MessageSquare, Layers,
  Users, Heart, Clock,
  X, Send, Loader2,
  Shield, Home, KeyRound,
  BarChart3, FileText, Wrench, Vote, Megaphone,
  Waves, ShoppingCart, Package, Bell,
  DoorOpen, ClipboardList,
} from 'lucide-react';
import { Brand } from '@/components/cc/Brand';
import { useToast } from '@/components/ui/Toast';
import { CommercialService } from '@/lib/api';
import type { ContactAdminModalProps } from '@/lib/types';

/* ── Hand-drawn annotation mark — dot + dashed leader + italic label ── */
function Annotation({ className = '', label, color = 'var(--cc-copper)' }: { className?: string; label: string; color?: string }) {
  return (
    <div className={`pointer-events-none hidden items-center gap-2 lg:flex ${className}`}>
      <div className="h-3 w-3 shrink-0 rounded-full border-2" style={{ borderColor: color }} />
      <div className="h-px w-10 shrink-0 opacity-80" style={{ borderTop: `1.5px dashed ${color}` }} />
      <div className="max-w-[320px] text-[26px] italic leading-tight" style={{ fontFamily: 'var(--cc-font-display)', color }}>{label}</div>
    </div>
  );
}

/* ── CoCo WhatsApp thread mockup ───────────────────────── */
function CoCoWhatsAppThread() {
  const thread = [
    { mine: false, text: '¿Está libre el quincho el sábado?' },
    { mine: true, text: 'Sí, de 12:00 a 20:00. ¿Reservo a tu nombre?' },
    { mine: false, text: 'Dale, gracias CoCo 🙌' },
    { mine: true, text: 'Listo, quincho reservado sábado 12–20h ✓' },
  ];

  return (
    <div className="relative">
      <div className="rounded-2xl border p-6 shadow-2xl" style={{ background: '#171512', borderColor: 'rgba(244,239,230,0.10)' }}>
        <div className="mb-5 flex items-center gap-2.5 border-b pb-4" style={{ borderColor: 'rgba(244,239,230,0.10)' }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: 'var(--cc-sage)', fontFamily: 'var(--cc-font-display)' }}>C</div>
          <div>
            <div className="text-sm font-semibold text-white">CoCo · tu edificio</div>
            <div className="text-[11px]" style={{ color: 'var(--cc-sage-soft)' }}>en línea</div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {thread.map((m, i) => (
            <div
              key={i}
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug text-white ${m.mine ? 'self-end rounded-tr-sm' : 'self-start rounded-tl-sm'}`}
              style={{ background: m.mine ? 'var(--cc-sage)' : 'rgba(244,239,230,0.08)' }}
            >
              {m.text}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 hidden items-center gap-3 lg:flex">
        <div className="h-px w-8 shrink-0" style={{ borderTop: '1.5px dashed var(--cc-copper-soft)' }} />
        <span className="text-2xl italic leading-tight" style={{ fontFamily: 'var(--cc-font-display)', color: 'var(--cc-copper-soft)' }}>resuelto sin llamar a conserjería</span>
      </div>
    </div>
  );
}

/* ── Trust strip ──────────────────────────────────────── */
const trust = [
  { Icon: ShieldCheck, title: 'Datos por comunidad', desc: 'Aislamiento por edificio, permisos por rol y sesiones verificadas.' },
  { Icon: MessageSquare, title: 'Acciones confirmadas', desc: 'Las escrituras de CoCo requieren revisión humana y dejan trazabilidad.' },
  { Icon: Layers, title: 'Operación centralizada', desc: 'Gastos, reservas, comunicaciones, cursos y solicitudes en una plataforma.' },
];

/* ── CoCo / WhatsApp checks ───────────────────────────── */
const cocoChecks = [
  { t: 'Cero apps que descargar', d: 'Los residentes gestionan todo enviando un simple mensaje de WhatsApp.' },
  { t: 'Reservas instantáneas', d: 'CoCo verifica disponibilidad de espacios comunes (quinchos, piscinas) y agenda al instante.' },
  { t: 'Conserjería en sincronía', d: 'Notificaciones instantáneas de visitas, encomiendas o emergencias registradas por la app.' },
];

/* ── Roles — rows ─────────────────────────────────────── */
const roles = [
  {
    id: 'admin',
    title: 'Administración',
    Icon: Shield,
    desc: 'Panel de control centralizado. Finanzas, auditoría y gestión de comunidad integral.',
    items: [
      { Icon: BarChart3, label: 'Finanzas' },
      { Icon: Users, label: 'Residentes' },
      { Icon: FileText, label: 'Reportes' },
      { Icon: Wrench, label: 'Mantención' },
      { Icon: Vote, label: 'Votaciones' },
      { Icon: Megaphone, label: 'Circulares' },
    ],
  },
  {
    id: 'resident',
    title: 'Residente',
    Icon: Home,
    desc: 'Gastos comunes, reservas y comunicación vecinal en una experiencia web simple.',
    items: [
      { Icon: Waves, label: 'Piscina' },
      { Icon: ShoppingCart, label: 'Mercado' },
      { Icon: Package, label: 'Paquetes' },
      { Icon: MessageSquare, label: 'Chat' },
      { Icon: Bell, label: 'Avisos' },
    ],
  },
  {
    id: 'concierge',
    title: 'Conserjería',
    Icon: KeyRound,
    desc: 'Registro de visitas, accesos y paquetería con permisos definidos por rol.',
    items: [
      { Icon: DoorOpen, label: 'Accesos' },
      { Icon: ClipboardList, label: 'Novedades' },
      { Icon: KeyRound, label: 'Visitas' },
    ],
  },
];

function isCommercialItem(label: string) {
  return !/Pagos|Cámaras|Alertas|Parking/i.test(label);
}

/* ── How it operates — steps ──────────────────────────── */
const steps = [
  { n: '1', t: 'Sube la información', d: 'Carga nóminas, gastos, reglamentos o proveedores. CoCo interpreta la estructura y detecta brechas.', note: 'sin plantillas genéricas' },
  { n: '2', t: 'Revisa y aprueba', d: 'La administración valida unidades, contactos, roles y cobros antes de tocar datos reales.', note: 'nada se activa sin tu aprobación' },
  { n: '3', t: 'Activa la comunidad', d: 'Invitaciones, reservas, circulares y acciones de CoCo quedan listas para operar.', note: 'todo queda documentado desde el día uno' },
];

/* ── Apoyo Mutuo pillars ──────────────────────────────── */
const mutualAidPillars = [
  { Icon: Heart, title: 'Fondo confidencial', desc: 'Los residentes que enfrentan desempleo, jubilación o gastos de salud graves pueden solicitar el subsidio. El comité lo evalúa y abona a su cuenta sin exponer su privacidad.', note: 'identidad protegida ante el resto de la comunidad' },
  { Icon: Clock, title: 'Retribución comunitaria', desc: 'Quienes reciben el subsidio aportan de vuelta realizando tareas sencillas del edificio: clasificación en punto verde, orden de encomiendas o apoyo digital a tercera edad.', note: 'ciclo cerrado, sin dependencia permanente' },
];

/* ── FAQ ───────────────────────────────────────────────── */
const faqs = [
  { q: '¿Qué pasa si un residente no tiene smartphone?', a: 'No hay problema. Los residentes también pueden acceder desde computadora o tablet navegando por la web.' },
  { q: '¿Cuánto tiempo toma activar el edificio?', a: 'Depende de la calidad de los datos, pero el flujo está pensado para que la administración suba archivos, CoCo detecte brechas y solo se guarde información aprobada.' },
];

/* ── Main Page ────────────────────────────────────────── */
export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');

  return (
    <div className="min-h-screen font-sans overflow-x-hidden" style={{ background: 'var(--cc-ivory)' }}>

      {/* ── Nav ── */}
      <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6 md:px-12" style={{ borderColor: 'var(--cc-line)' }}>
        <Brand withMark size={20} />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/admin-onboarding')}
            className="hidden rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors sm:inline-flex"
            style={{ color: 'var(--cc-ink-muted)' }}
          >
            Registrar condominio
          </button>
          <button
            onClick={() => router.push('/login')}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:opacity-90 sm:px-5"
            style={{ background: 'var(--cc-copper)' }}
          >
            Iniciar sesión
          </button>
          <button
            onClick={toggleTheme}
            className="shrink-0 rounded-xl border p-2 transition-colors"
            style={{ borderColor: 'var(--cc-line-strong)', background: 'var(--cc-paper)' }}
          >
            {mounted ? (
              resolvedTheme === 'light' ? <Moon className="h-4 w-4" style={{ color: 'var(--cc-ink-muted)' }} /> : <Sun className="h-4 w-4 text-amber-400" />
            ) : <div className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="relative min-h-[660px] overflow-hidden px-4 py-12 sm:min-h-[700px] sm:px-6 md:px-12 md:py-14 lg:min-h-[760px]" style={{ background: 'var(--cc-carbon)' }}>
        <Image
          src="/edificio-malaga-exterior.jpg"
          alt="Edificio Málaga, comunidad conectada con Convive Connect"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[58%_center] sm:object-center"
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(23,21,18,0.96) 0%, rgba(23,21,18,0.34) 56%, rgba(23,21,18,0.58) 100%)' }} />
        <div className="relative mx-auto flex min-h-[566px] w-full max-w-7xl flex-col justify-end sm:min-h-[606px] lg:min-h-[652px]">
          <h1 className="max-w-5xl text-[3.25rem] font-normal leading-[0.92] tracking-[-0.035em] text-white sm:text-6xl md:text-7xl lg:text-[6.25rem]" style={{ fontFamily: 'var(--cc-font-display)' }}>
            Tu edificio,<br />
            <em className="not-italic italic" style={{ color: 'var(--cc-copper-soft)' }}>en una sola conversación.</em>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed sm:text-lg" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Gastos comunes, reservas, conserjería y vecinos — todo resuelto en un solo lugar, sin planillas ni WhatsApp perdido.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.push('/onboarding')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-medium transition-all hover:opacity-90"
              style={{ color: 'var(--cc-ink)' }}
            >
              Activar con CoCo <ArrowRight size={14} />
            </button>
            <button
              onClick={() => router.push('/recorrido')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.35)' }}
            >
              Ver recorrido comercial
            </button>
          </div>

          <div className="mt-11 flex max-w-xl gap-10 border-t pt-6" style={{ borderColor: 'rgba(255,255,255,0.16)' }}>
            {[['24/7', 'CoCo siempre disponible'], ['3', 'roles en una sola app']].map(([v, l], i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-1 h-8 w-px shrink-0" style={{ background: 'var(--cc-copper-soft)' }} />
                <div>
                  <div className="text-2xl leading-none text-white" style={{ fontFamily: 'var(--cc-font-display)' }}>{v}</div>
                  <div className="mt-1.5 max-w-[140px] text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Trust strip ── */}
      <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 md:px-12 md:py-24">
        <div className="relative">
          <Annotation className="absolute -top-8 left-[64%]" label="cada acción queda documentada" />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {trust.map((t, i) => (
              <div key={i} className="rounded-2xl border p-7" style={{ background: 'var(--cc-paper)', borderColor: 'var(--cc-line)' }}>
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--cc-copper-tint)' }}>
                  <t.Icon className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />
                </div>
                <div className="mb-2 text-lg" style={{ fontFamily: 'var(--cc-font-display)' }}>{t.title}</div>
                <div className="text-[13.5px] leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CoCo / WhatsApp ── */}
      <div className="relative overflow-hidden px-4 py-16 sm:px-6 md:px-12 md:py-24" style={{ background: 'var(--cc-carbon)' }}>
        <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(95,122,70,0.16) 0%, transparent 65%)' }} />
        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-5 flex items-baseline gap-3">
              <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-copper-soft)' }}>01 —</span>
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Exclusivo de Convive Connect</span>
            </div>
            <h2 className="text-4xl font-normal leading-[0.98] tracking-tight text-white sm:text-5xl" style={{ fontFamily: 'var(--cc-font-display)' }}>
              Un edificio que responde por <em className="not-italic italic" style={{ color: 'var(--cc-sage-soft)' }}>WhatsApp.</em>
            </h2>
            <p className="my-6 max-w-md text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
              CoCo atiende consultas y ejecuta acciones habilitadas con confirmación, permisos por rol y trazabilidad — sin apps, sin fricción.
            </p>
            <div className="mb-9 flex flex-col gap-6">
              {cocoChecks.map((c, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-px shrink-0 opacity-60" style={{ background: 'var(--cc-copper-soft)' }} />
                  <div>
                    <div className="mb-1 text-[15px] font-semibold text-white">{c.t}</div>
                    <div className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push('/recorrido')}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-medium transition-all hover:opacity-90"
              style={{ color: 'var(--cc-ink)' }}
            >
              Ver recorrido comercial <ArrowRight size={14} />
            </button>
          </div>
          <CoCoWhatsAppThread />
        </div>
      </div>

      {/* ── Roles ── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 md:px-12 md:py-24">
        <div className="relative mb-14">
          <Annotation className="absolute -top-9 left-[58%]" label="cada rol ve solo lo suyo" />
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-copper)' }}>02 —</span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--cc-copper)' }}>Tres roles, una sola plataforma</span>
          </div>
          <h2 className="max-w-2xl text-4xl font-normal tracking-tight sm:text-5xl" style={{ fontFamily: 'var(--cc-font-display)' }}>
            Tu edificio desde <em className="not-italic italic" style={{ color: 'var(--cc-copper)' }}>todos los ángulos.</em>
          </h2>
        </div>
        <div>
          {roles.map((r, i) => {
            const RoleIcon = r.Icon;
            const items = r.items.filter(item => isCommercialItem(item.label));
            return (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-6 py-10 md:grid-cols-[64px_1fr_1.4fr] md:gap-10"
                style={{ borderTop: i === 0 ? '1px solid var(--cc-line-strong)' : '1px solid var(--cc-line)' }}
              >
                <div className="hidden pt-1.5 text-sm md:block" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-ink-faint)' }}>0{i + 1}</div>
                <div>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--cc-carbon)' }}>
                    <RoleIcon className="h-[18px] w-[18px]" style={{ color: 'var(--cc-copper-soft)' }} />
                  </div>
                  <div className="mb-2.5 text-2xl tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--cc-font-display)' }}>{r.title}</div>
                  <p className="mb-5 max-w-xs text-sm leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>{r.desc}</p>
                  <Link href="/login" className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--cc-copper)' }}>
                    Explorar funciones <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 content-start gap-x-7 gap-y-2.5">
                  {items.map((item, j) => (
                    <div key={j} className="flex min-w-0 items-center gap-3 border-b py-3" style={{ borderColor: 'var(--cc-line)' }}>
                      <item.Icon className="h-[15px] w-[15px] shrink-0" style={{ color: 'var(--cc-ink-tertiary)' }} />
                      <span className="text-[13.5px]" style={{ color: 'var(--cc-ink)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Cómo opera ── */}
      <section className="px-4 py-16 sm:px-6 md:px-12 md:py-24" style={{ background: 'var(--cc-paper-warm)' }}>
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-16">
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-copper)' }}>03 —</span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--cc-copper)' }}>Proceso simple</span>
            </div>
            <h2 className="max-w-xl text-4xl font-normal tracking-tight sm:text-5xl" style={{ fontFamily: 'var(--cc-font-display)' }}>
              Activo con <em className="not-italic italic" style={{ color: 'var(--cc-copper)' }}>IA guiada.</em>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>
              Sin configuración manual interminable. CoCo interpreta, el admin aprueba y la comunidad queda lista para operar.
            </p>
          </div>
          <div className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            <div className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-[19px] hidden h-px md:block" style={{ borderTop: '1px dashed var(--cc-copper)', opacity: 0.5 }} />
            {steps.map((s, i) => (
              <div key={i} className="relative min-w-0">
                <div className="relative z-10 mb-6 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: 'var(--cc-carbon)', color: 'var(--cc-carbon)', background: 'var(--cc-paper-warm)', fontFamily: 'var(--cc-font-mono)' }}>
                  {s.n}
                </div>
                <div className="mb-2.5 text-xl tracking-tight sm:text-2xl" style={{ fontFamily: 'var(--cc-font-display)' }}>{s.t}</div>
                <div className="mb-4 max-w-[260px] text-[13.5px] leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>{s.d}</div>
                <div className="flex items-center gap-3">
                  <div className="h-px w-6 shrink-0 opacity-80" style={{ borderTop: '1.5px dashed var(--cc-copper)' }} />
                  <span className="text-[19px] italic leading-tight" style={{ fontFamily: 'var(--cc-font-display)', color: 'var(--cc-copper)' }}>{s.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Apoyo Mutuo ── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 md:px-12 md:py-24">
        <div className="relative rounded-3xl border p-8 text-center md:p-14" style={{ background: 'var(--cc-paper)', borderColor: 'var(--cc-line)' }}>
          <Annotation className="absolute -top-24 left-1" label="gestionado con total confidencialidad" color="var(--cc-sage)" />
          <span className="inline-flex rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--cc-sage)', background: 'var(--cc-sage-tint)' }}>
            Cohesión comunitaria nativa
          </span>
          <h2 className="mx-auto mt-6 max-w-xl text-3xl font-normal tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--cc-font-display)' }}>
            Apoyo Mutuo: el <em className="not-italic italic" style={{ color: 'var(--cc-sage)' }}>corazón</em> de tu comunidad
          </h2>
          <p className="mx-auto mb-10 mt-4 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>
            No somos solo un software contable. Diseñamos el primer ecosistema digital que fomenta la colaboración vecinal organizada y confidencial.
          </p>
          <div className="mx-auto mb-9 grid max-w-3xl grid-cols-1 gap-5 text-left sm:grid-cols-2">
            {mutualAidPillars.map((p, i) => (
              <div key={i} className="rounded-2xl border p-6" style={{ background: 'var(--cc-paper-warm)', borderColor: 'var(--cc-line)' }}>
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: 'var(--cc-sage)' }}>
                  <p.Icon className="h-[15px] w-[15px]" style={{ color: 'var(--cc-sage)' }} />
                </div>
                <div className="mb-2 text-[19px]" style={{ fontFamily: 'var(--cc-font-display)' }}>{p.title}</div>
                <p className="mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>{p.desc}</p>
                <div className="flex items-center gap-3">
                  <div className="h-px w-6 shrink-0 opacity-80" style={{ borderTop: '1.5px dashed var(--cc-sage)' }} />
                  <span className="text-[19px] italic leading-tight" style={{ fontFamily: 'var(--cc-font-display)', color: 'var(--cc-sage)' }}>{p.note}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setIsContactModalOpen(true)}
            className="mx-auto inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-semibold transition-all hover:bg-[var(--cc-paper-warm)]"
            style={{ borderColor: 'var(--cc-line-strong)' }}
          >
            Hablar con un administrador <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 py-16 sm:px-6 md:px-12 md:py-24" style={{ background: 'var(--cc-paper-warm)' }}>
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-copper)' }}>04 —</span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--cc-copper)' }}>Preguntas frecuentes</span>
            </div>
            <h2 className="text-3xl font-normal leading-tight tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--cc-font-display)' }}>Antes de modernizar tu comunidad.</h2>
          </div>
          <div className="flex flex-col">
            {faqs.map((f, i) => (
              <div key={i} className="flex gap-5 border-t py-6" style={{ borderColor: 'var(--cc-line)' }}>
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--cc-copper)' }} />
                <div>
                  <div className="mb-2 text-[15.5px] font-semibold">{f.q}</div>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>{f.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cierre ── */}
      <div className="relative overflow-hidden px-4 py-20 sm:px-6 md:px-12 md:py-28" style={{ background: 'var(--cc-carbon)' }}>
        <div className="pointer-events-none absolute -bottom-36 -left-24 h-96 w-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(156,86,54,0.18) 0%, transparent 65%)' }} />
        <div className="relative mx-auto w-full max-w-7xl">
          <div className="max-w-xl">
            <div className="mb-6 flex items-baseline gap-3">
              <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-copper-soft)' }}>05 —</span>
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Próximo paso</span>
            </div>
            <h2 className="text-4xl font-normal leading-[1.02] tracking-tight text-white sm:text-5xl" style={{ fontFamily: 'var(--cc-font-display)' }}>
              Activa tu comunidad <em className="not-italic italic" style={{ color: 'var(--cc-copper-soft)' }}>desde hoy.</em>
            </h2>
            <p className="my-6 max-w-md text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Datos reales, roles definidos y CoCo trabajando desde el día uno — sin configuración manual interminable.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push('/onboarding')}
                className="rounded-xl bg-white px-6 py-3.5 text-sm font-medium transition-all hover:opacity-90"
                style={{ color: 'var(--cc-ink)' }}
              >
                Registrar mi condominio
              </button>
              <button
                onClick={() => setIsContactModalOpen(true)}
                className="rounded-xl border px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.3)' }}
              >
                Hablar con ventas
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t" style={{ borderColor: 'var(--cc-line)' }}>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row md:px-12">
          <div className="flex items-center gap-2.5">
            <Brand withMark size={16} />
            <span className="text-sm" style={{ color: 'var(--cc-ink-tertiary)' }}>· © 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-semibold" style={{ color: 'var(--cc-ink-tertiary)' }}>
            <Link href="/privacy" className="transition-colors hover:text-[var(--cc-copper)]">Privacidad</Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--cc-copper)]">Términos</Link>
            <Link href="/support" className="transition-colors hover:text-[var(--cc-copper)]">Soporte</Link>
          </div>
        </div>
      </footer>

      {/* ── ContactAdminModal ── */}
      {isContactModalOpen && (
        <ContactAdminFormModal
          onClose={() => setIsContactModalOpen(false)}
        />
      )}
    </div>
  );
}

function ContactAdminFormModal({ onClose }: ContactAdminModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [condo, setCondo] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast({
        title: "Campos incompletos",
        description: "Por favor completa tu nombre y correo.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await CommercialService.submitLead({
        adminName: name,
        adminEmail: email,
        condoName: condo || 'Tu Comunidad',
        source: 'landing_contact',
      });

      setConfirmationSent(result.emailSent);
      setSuccess(true);
      if (result.emailSent) {
        toast({
          title: "Solicitud registrada",
          description: "Te enviamos la confirmacion y el equipo comercial ya fue notificado.",
          variant: "success",
        });
      } else {
        toast({
          title: "Solicitud guardada",
          description: "Tus datos quedaron registrados. La confirmacion por correo esta pendiente.",
          variant: "default",
        });
      }
    } catch (err: unknown) {
      console.warn("Contact send failed:", err instanceof Error ? err.message : err);
      toast({
        title: "No se pudo registrar",
        description: err instanceof Error ? err.message : "Revisa tu conexion e intentalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'rgba(32,30,26,0.6)' }}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border p-8 text-left shadow-2xl md:p-10" style={{ background: 'var(--cc-paper)', borderColor: 'var(--cc-line)' }}>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cc-sage)' }}>CONTACTO</span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Hablemos de tu Comunidad</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--cc-ink-tertiary)' }}>Implementa el Fondo de Apoyo Mutuo y la gestión inteligente.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-[var(--cc-paper-warm)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl" style={{ background: 'var(--cc-sage-tint)', color: 'var(--cc-sage)' }}>
              ✓
            </div>
            <h3 className="text-lg font-semibold">¡Solicitud Recibida!</h3>
            <p className="mx-auto max-w-sm text-xs leading-relaxed" style={{ color: 'var(--cc-ink-tertiary)' }}>
              {confirmationSent
                ? <>Registramos tus datos y enviamos la confirmacion a <strong>{email}</strong>.</>
                : <>Registramos tus datos de forma segura. La confirmacion a <strong>{email}</strong> esta pendiente.</>}
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full cursor-pointer rounded-xl py-3 text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'var(--cc-sage)' }}
            >
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase" style={{ color: 'var(--cc-ink-tertiary)' }}>Nombre Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pedro Moreno"
                required
                className="w-full rounded-xl border px-4 py-2.5 text-xs transition-all focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--cc-line-strong)", background: 'var(--cc-paper-warm)' }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase" style={{ color: 'var(--cc-ink-tertiary)' }}>Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pedro@comunidad.com"
                required
                className="w-full rounded-xl border px-4 py-2.5 text-xs transition-all focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--cc-line-strong)", background: 'var(--cc-paper-warm)' }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase" style={{ color: 'var(--cc-ink-tertiary)' }}>Nombre del Edificio / Condominio</label>
              <input
                type="text"
                value={condo}
                onChange={(e) => setCondo(e.target.value)}
                placeholder="Edificio Plaza Mayo"
                className="w-full rounded-xl border px-4 py-2.5 text-xs transition-all focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--cc-line-strong)", background: 'var(--cc-paper-warm)' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--cc-sage)' }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Enviar y recibir propuesta
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
