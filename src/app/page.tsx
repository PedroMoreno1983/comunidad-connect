"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import {
  Building2,
  Sun, Moon, CheckCircle2, HelpCircle,
  ArrowRight,
  MessageSquare, Package, TrendingUp,
  Users, Zap, ChevronRight, Handshake, Heart, Clock,
  X, Send, Loader2
} from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { useToast } from '@/components/ui/Toast';


/* ── Animated counter hook ────────────────────────────── */
/* ── Resident Home Dashboard Preview ───────────────────── */
function AppPreview() {
  return (
    <div className="relative w-full max-w-[360px] bg-white dark:bg-[#25242A] border rounded-[2rem] p-5 shadow-2xl text-left transition-all duration-300 hover:shadow-[#C8705A]/5" style={{ borderColor: 'var(--cc-border-default)' }}>
      {/* Top bar header */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#F1EAE1] dark:border-[#3B3530]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[rgba(156, 86, 54,0.1)] text-[#9C5636] flex items-center justify-center font-bold text-xs">
            PM
          </div>
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Residente</div>
            <div className="text-xs font-bold text-[#2D2A26] dark:text-[#FBF8F3] mt-0.5">Pedro Moreno</div>
          </div>
        </div>
        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
          🏢 Dpto 402-B
        </span>
      </div>

      {/* Gasto Común Card */}
      <div className="bg-[#FAF7F1] dark:bg-[#302D2A] border border-[#E4D8CA] dark:border-[#3B3530] rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Gasto Común Mayo</span>
            <div className="text-xl font-bold font-mono text-ink mt-0.5">$45.200 <span className="text-[10px] font-normal text-slate-400">CLP</span></div>
          </div>
          <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 animate-pulse">
            Pendiente
          </span>
        </div>
        <button className="w-full py-2 bg-[#1A1611] hover:bg-[#2D2A26] dark:bg-white dark:hover:bg-[#FAF7F1] dark:text-black text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
          Pagar con Webpay <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fondo de Apoyo Mutuo Widget */}
      <div className="bg-[rgba(95, 122, 70,0.04)] border border-[rgba(95, 122, 70,0.12)] rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[9px] font-bold text-[#5F7A46] uppercase tracking-widest flex items-center gap-1">
            <Heart className="w-3 h-3 fill-[#5F7A46]" /> Apoyo Mutuo Vecinal
          </span>
          <span className="text-[10px] font-bold font-mono text-[#5F7A46]">$180.000</span>
        </div>
        <p className="text-[10px] leading-relaxed text-[#5F5A54] dark:text-[#C8BFB6] mb-3">
          Tu redondeo mensual: <strong className="text-ink">+$800 CLP</strong> acumulado para la comunidad.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-[#25242A] border border-[rgba(95, 122, 70,0.12)] rounded-lg p-2 text-center">
            <div className="text-[8px] font-bold text-slate-400 uppercase">Horas Devueltas</div>
            <div className="text-xs font-bold text-[#5F7A46] mt-0.5">6.5h</div>
          </div>
          <div className="bg-white dark:bg-[#25242A] border border-[rgba(95, 122, 70,0.12)] rounded-lg p-2 text-center">
            <div className="text-[8px] font-bold text-slate-400 uppercase">Familias Apoyadas</div>
            <div className="text-xs font-bold text-[#9C5636] mt-0.5">2</div>
          </div>
        </div>
      </div>

      {/* Conserjería alerts */}
      <div className="flex items-center justify-between p-3 bg-[#FAF7F1] dark:bg-[#302D2A] border border-[#E4D8CA] dark:border-[#3B3530] rounded-xl text-[10px]">
        <div className="flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-[#C8705A]" />
          <span className="font-bold text-[#2D2A26] dark:text-[#E4D8CA]">Encomienda lista en conserjería</span>
        </div>
        <span className="text-slate-400 font-mono text-[9px]">Hace 15m</span>
      </div>
    </div>
  );
}

/* ── CoCo WhatsApp Preview ─────────────────────────────── */
function CoCoWhatsAppPreview() {
  return (
    <div className="w-full max-w-[340px] mx-auto bg-[#E5DDD5] dark:bg-[#0C0A08] border border-[#E4D8CA] dark:border-[#3B3530] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col h-[420px]">
      {/* WhatsApp header */}
      <div className="bg-[#075E54] dark:bg-[#25242A] px-4 py-3 text-white flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <div className="text-xs font-bold">CoCo Assistant</div>
            <div className="text-[9px] text-emerald-300 dark:text-emerald-400 font-bold flex items-center gap-1 leading-none mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> En línea
            </div>
          </div>
        </div>
        <span className="text-[9px] bg-white/10 dark:bg-white/5 px-2 py-0.5 rounded text-white/80 font-bold uppercase tracking-wider">WhatsApp</span>
      </div>

      {/* WhatsApp message area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 relative flex flex-col">
        {/* Date indicator */}
        <div className="flex justify-center my-1">
          <span className="bg-white/70 dark:bg-white/10 px-2.5 py-0.5 rounded-full text-[9px] font-bold text-slate-500 dark:text-slate-300 shadow-sm uppercase tracking-wider">
            Hoy
          </span>
        </div>

        {/* Resident Message */}
        <div className="flex justify-end">
          <div className="bg-[#DCF8C6] dark:bg-[#056162] text-[#2D2A26] dark:text-[#FAF7F1] p-3 rounded-2xl rounded-tr-none max-w-[85%] text-xs shadow-sm">
            <p className="leading-relaxed">Hola CoCo, soy Pedro del dpto 402. ¿Está disponible el Quincho para este sábado por la tarde?</p>
            <span className="text-[8px] text-slate-400 dark:text-slate-300 block text-right mt-1 font-mono">14:02 ✓✓</span>
          </div>
        </div>

        {/* CoCo Response */}
        <div className="flex justify-start">
          <div className="bg-white dark:bg-[#25242A] text-[#2D2A26] dark:text-[#FAF7F1] p-3 rounded-2xl rounded-tl-none max-w-[85%] text-xs shadow-sm">
            <p className="leading-relaxed">¡Hola Pedro! 🏢 Sí, el <strong>Quincho A</strong> está libre el sábado 30 de mayo de 14:00 a 18:00 hrs. La tarifa de reserva es de $15.000 CLP.</p>
            <p className="leading-relaxed mt-1">¿Te gustaría que lo reserve a tu nombre?</p>
            <span className="text-[8px] text-slate-400 block text-right mt-1 font-mono">14:02</span>
          </div>
        </div>

        {/* Resident Message */}
        <div className="flex justify-end">
          <div className="bg-[#DCF8C6] dark:bg-[#056162] text-[#2D2A26] dark:text-[#FAF7F1] p-3 rounded-2xl rounded-tr-none max-w-[85%] text-xs shadow-sm">
            <p className="leading-relaxed">Sí, por favor confírmalo y cárgalo a mi cuenta.</p>
            <span className="text-[8px] text-slate-400 dark:text-slate-300 block text-right mt-1 font-mono">14:03 ✓✓</span>
          </div>
        </div>

        {/* CoCo Response */}
        <div className="flex justify-start">
          <div className="bg-white dark:bg-[#25242A] text-[#2D2A26] dark:text-[#FAF7F1] p-3 rounded-2xl rounded-tl-none max-w-[85%] text-xs shadow-sm">
            <p className="leading-relaxed">¡Listo Pedro! Reserva confirmada. He enviado la orden de cobro de $15.000 CLP a tu perfil de gastos comunes.</p>
            <p className="leading-relaxed mt-1">Puedes pagarlo directo en este link: <span className="text-blue-500 dark:text-blue-400 underline font-bold">convive.cl/p/pay_982</span> 💳</p>
            <span className="text-[8px] text-slate-400 block text-right mt-1 font-mono">14:03</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Trust Stats ──────────────────────────────────────── */
function TrustStats() {
  const stats = [
    {
      value: "95% de Recaudación",
      desc: "Gastos comunes pagados dentro de las primeras 72h gracias al cobro inteligente y links rápidos.",
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-[#5A7D5A]",
      bg: "bg-[#5A7D5A]/10",
      border: "border-[#5A7D5A]/20"
    },
    {
      value: "-80% Carga Operativa",
      desc: "Reducción de consultas de copropiedad y reservas gracias al soporte automático de CoCo IA.",
      icon: <MessageSquare className="w-5 h-5" />,
      color: "text-[#C8705A]",
      bg: "bg-[#C8705A]/10",
      border: "border-[#C8705A]/20"
    },
    {
      value: "100% Transparencia",
      desc: "Libro diario e historial de apoyo mutuo automatizados y auditables en tiempo real.",
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: "text-amber-500",
      bg: "bg-amber-400/10",
      border: "border-amber-400/20"
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto mt-16 md:mt-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((s, i) => (
          <div
            key={i}
            className={`flex flex-col gap-3 p-6 rounded-2xl bg-white dark:bg-[#25242A] border ${s.border} shadow-sm transition-all hover:shadow-md`}
          >
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center ${s.color}`}>
              {s.icon}
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[#2D2A26] dark:text-[#FBF8F3]">{s.value}</h3>
            <p className="text-xs text-[#8A8580] dark:text-[#C8BFB6] leading-relaxed font-medium">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Role Cards (Building Window style) ───────────────── */
const roles = [
  {
    id: 'admin',
    title: 'Administración',
    emoji: '🛡️',
    description: 'Panel de control centralizado. Finanzas, auditoría y gestión de comunidad integral.',
    color: '#C8705A',
    gradientFrom: 'from-[#C8705A]',
    gradientTo: 'to-[#B45F4B]',
    shadowColor: 'hover:shadow-[#C8705A]/20',
    borderHover: 'hover:border-[#C8705A]/40',
    // Building window grid: each cell is a mini feature
    windows: [
      { icon: '📊', label: 'Finanzas' },
      { icon: '👥', label: 'Residentes' },
      { icon: '📋', label: 'Reportes' },
      { icon: '🔧', label: 'Mantención' },
      { icon: '🗳️', label: 'Votaciones' },
      { icon: '📢', label: 'Circulares' },
    ],
    features: ['Analítica Financiera', 'Gestión de Residentes', 'Reportes de Consumo'],
    fullDescription: 'El cerebro de la comunidad. Diseñado para administradores que buscan transparencia total y eficiencia operativa absoluta.',
    extraFeatures: [
      'Auditoría en tiempo real de todos los movimientos financieros.',
      'Emisión masiva de gastos comunes con un solo clic.',
      'Portal de transparencia para que los residentes vean en qué se gasta su dinero.',
      'Gestión de proveedores y contratos de mantenimiento preventivo.'
    ]
  },
  {
    id: 'resident',
    title: 'Residente',
    emoji: '🏡',
    description: 'Tu hogar inteligente. Reservas, pagos y comunicación vecinal en un solo lugar.',
    color: '#5A7D5A',
    gradientFrom: 'from-[#5A7D5A]',
    gradientTo: 'to-[#466746]',
    shadowColor: 'hover:shadow-[#5A7D5A]/20',
    borderHover: 'hover:border-[#5A7D5A]/40',
    windows: [
      { icon: '💳', label: 'Pagos' },
      { icon: '🏊', label: 'Piscina' },
      { icon: '🛒', label: 'Mercado' },
      { icon: '📦', label: 'Paquetes' },
      { icon: '💬', label: 'Chat' },
      { icon: '🔔', label: 'Avisos' },
    ],
    features: ['Pago de Gastos', 'Marketplace', 'Reservas de Espacios'],
    fullDescription: 'Tu edificio en el bolsillo. Eliminamos la fricción de vivir en comunidad con herramientas modernas y fáciles de usar.',
    extraFeatures: [
      'Notificaciones push instantáneas sobre avisos de la comunidad.',
      'Marketplace interno seguro para comprar y vender con tus vecinos.',
      'Sistema de reservas inteligentes con pago integrado.',
      'Chat directo con administración y conserjería.'
    ]
  },
  {
    id: 'concierge',
    title: 'Conserjería',
    emoji: '🔑',
    description: 'Operaciones en tiempo real. Máxima seguridad y estricto control de accesos.',
    color: '#f59e0b',
    gradientFrom: 'from-amber-400',
    gradientTo: 'to-amber-600',
    shadowColor: 'hover:shadow-amber-400/20',
    borderHover: 'hover:border-amber-400/40',
    windows: [
      { icon: '🚪', label: 'Accesos' },
      { icon: '📷', label: 'Cámaras' },
      { icon: '📝', label: 'Novedades' },
      { icon: '🚨', label: 'Alertas' },
      { icon: '🅿️', label: 'Parking' },
      { icon: '🔐', label: 'Visitas' },
    ],
    features: ['Control de Visitas', 'Recepción de Paquetes', 'Gestión de Emergencias'],
    fullDescription: 'La primera línea de defensa. Empoderamos a la conserjería con tecnología para un control de acceso sin errores.',
    extraFeatures: [
      'Registro digital de visitas con escaneo de documentos.',
      'Control de paquetes y encomiendas con notificaciones automáticas.',
      'Libro de novedades digital para cambios de turno eficientes.',
      'Botón de pánico y gestión de protocolos de emergencia.'
    ]
  }
];

/* ── How It Works steps ───────────────────────────────── */
const steps = [
  {
    num: '01',
    title: 'Sube la informacion',
    desc: 'Carga nominas, gastos, reglamentos o proveedores. CoCo interpreta la estructura y detecta brechas.',
    icon: <Building2 className="w-6 h-6" />,
    color: '#C8705A',
    bg: 'bg-[#C8705A]/10',
  },
  {
    num: '02',
    title: 'Revisa y aprueba',
    desc: 'La administracion valida unidades, contactos, roles y cobros antes de tocar datos reales.',
    icon: <Users className="w-6 h-6" />,
    color: '#5A7D5A',
    bg: 'bg-[#5A7D5A]/10',
  },
  {
    num: '03',
    title: 'Activa la comunidad',
    desc: 'Invitaciones, pagos, reservas, circulares y acciones de CoCo quedan listas para operar.',
    icon: <Zap className="w-6 h-6" />,
    color: '#f59e0b',
    bg: 'bg-amber-400/10',
  },
];

// Testimonials removed to ensure platform authenticity

/* ── Main Page ────────────────────────────────────────── */
export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  const selectedRole = roles.find(r => r.id === selectedInfo);

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-x-hidden relative transition-colors duration-700" style={{ background: 'radial-gradient(circle at top right, rgba(156, 86, 54, 0.07) 0%, var(--cc-ivory) 100%)' }}>

      {/* ── Background blobs ── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Subtle warm grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(26,22,17,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,22,17,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto box-border flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 md:px-12 md:py-5">
        <div
          className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#C8705A] to-[#B45F4B] shadow-lg shadow-[#C8705A]/30 sm:h-10 sm:w-10 sm:rounded-2xl">
            <Handshake className="h-5 w-5 text-white" />
          </div>
          <BrandWordmark className="min-w-0 truncate text-base text-[#C8705A] sm:text-xl" />
        </div>

        <div
          className="flex shrink-0 items-center gap-2 sm:gap-3"
        >
          <button
            onClick={() => router.push('/login')}
            className="whitespace-nowrap rounded-xl bg-[#C8705A] px-3 py-2 text-xs font-bold text-white shadow-md shadow-[#C8705A]/30 transition-all hover:-translate-y-0.5 hover:bg-[#B45F4B] hover:shadow-[#C8705A]/50 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => router.push('/admin-onboarding')}
            className="hidden items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#5F5A54] transition-colors hover:text-[#C8705A] dark:text-[#C8BFB6] dark:hover:text-[#C8705A] sm:inline-flex"
          >
            <span className="sm:hidden">Registrar</span>
            <span className="hidden sm:inline">Registrar condominio</span>
          </button>
          <button
            onClick={toggleTheme}
            className="shrink-0 rounded-xl border border-[#E4D8CA] bg-white/70 p-2 backdrop-blur-sm transition-colors hover:bg-[#F1EAE1] dark:border-[#3B3530] dark:bg-[#25242A]/70 dark:hover:bg-[#302D2A] sm:p-2.5"
          >
            {mounted ? (
              resolvedTheme === 'light' ? <Moon className="w-4 h-4 text-[#5F5A54]" /> : <Sun className="w-4 h-4 text-amber-400" />
            ) : <div className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto box-border flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-6 md:px-12">

        {/* ── Hero: Asymmetric ── */}
        <section className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 pt-10 pb-4 md:pt-16">

          {/* Left: Text */}
          <div className="flex-1 max-w-xl">
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[rgba(95, 122, 70,0.06)] border text-xs font-semibold mb-6 transition-all"
              style={{ borderColor: 'rgba(95, 122, 70, 0.15)' }}
            >
              <Heart className="h-3.5 w-3.5 text-[#5F7A46]" />
              <span style={{ color: 'var(--cc-sage)' }}>Apoyo Mutuo y Convivencia Vecinal</span>
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-normal leading-[1.05] tracking-tight mb-6"
              style={{ fontFamily: 'var(--cc-font-display)' }}
            >
              La <span className="italic" style={{ color: 'var(--cc-copper)' }}>buena vida</span> en comunidad, sin papeleo.
            </h1>

            <p
              className="text-base sm:text-lg text-[#524A40] mb-8 max-w-md leading-relaxed"
            >
              Gastos comunes, reservas, conserjería y vecinos; todo conectado en una app que la gente de verdad quiere usar.
            </p>

            <div
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <button
                onClick={() => router.push('/onboarding')}
                className="inline-flex items-center justify-center gap-2 font-bold transition-all cursor-pointer px-6 py-3.5 rounded-xl bg-[#1A1611] dark:bg-white dark:text-black text-[#FAF7F1] text-sm hover:opacity-90 shadow-md"
              >
                Activar con CoCo
                <ArrowRight size={15} />
              </button>
              <button
                onClick={() => setIsContactModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 font-semibold transition-all cursor-pointer px-6 py-3.5 rounded-xl border text-sm hover:bg-slate-50 dark:hover:bg-[#302D2A]"
                style={{ borderColor: 'var(--cc-border-default)', background: 'transparent' }}
              >
                Ver recorrido comercial
              </button>
            </div>
          </div>

          {/* Right: Interactive App Preview */}
          <div
            className="flex-shrink-0 w-full max-w-[320px] lg:max-w-[360px]"
          >
            <AppPreview />
          </div>
        </section>

        {/* ── Trust Stats ── */}
        <TrustStats />

        {/* ── Real building showcase — Edificio Málaga, Las Condes ── */}
        <section className="mt-24 md:mt-32">
          <div className="mb-8 max-w-xl">
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold mb-5"
              style={{ borderColor: 'var(--cc-line-strong)', background: 'var(--cc-copper-tint)', color: 'var(--cc-copper)' }}
            >
              Edificio piloto Net Zero
            </div>
            <h2
              className="text-3xl md:text-5xl leading-[1.05] tracking-tight mb-4"
              style={{ fontFamily: 'var(--cc-font-display)' }}
            >
              Málaga 433, <em className="italic" style={{ color: 'var(--cc-copper)' }}>Las Condes.</em>
            </h2>
            <p className="text-base sm:text-lg max-w-md leading-relaxed" style={{ color: 'var(--cc-ink-muted)' }}>
              Madera oxidada, acero estructural y vegetación real — así es el edificio donde nace Convive Connect.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl" style={{ borderColor: 'var(--cc-line)' }}>
              <Image
                src="/edificio-malaga-patio.jpg"
                alt="Patio interior del edificio Málaga 433, con revestimiento de madera oxidada, estructura de acero y vegetación nativa"
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="relative aspect-[4/3] lg:aspect-auto overflow-hidden rounded-2xl">
              <Image
                src="/edificio-malaga-exterior.jpg"
                alt="Fachada exterior del edificio Málaga 433 con paneles solares y balcones de madera"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ── Section: CoCo IA (WhatsApp Integration) ── */}
        <section className="mt-24 md:mt-32 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <div className="flex-1 max-w-xl order-2 lg:order-1">
            <CoCoWhatsAppPreview />
          </div>
          <div className="flex-1 max-w-xl order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#5A7D5A]/10 border border-[#5A7D5A]/20 text-[#5A7D5A] text-xs font-bold tracking-widest uppercase mb-5">
              ✦ Exclusivo de Convive Connect
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-6 leading-none text-[#2D2A26] dark:text-[#FBF8F3]">
              CoCo IA: Tu edificio conectado por <span className="text-[#25D366]">WhatsApp</span>
            </h2>
            <p className="text-base sm:text-lg text-[#524A40] dark:text-[#C8BFB6] mb-8 leading-relaxed">
              Olvídate de descargar aplicaciones complejas e iniciar sesión cada vez. Con Convive Connect, integramos un asistente conversacional impulsado por IA directamente en WhatsApp para responder y resolver todo al instante.
            </p>
            <ul className="space-y-4 mb-8">
              {[
                { title: "Cero apps que descargar", desc: "Los residentes gestionan todo enviando un simple mensaje de WhatsApp." },
                { title: "Reservas instantáneas", desc: "CoCo verifica disponibilidad de espacios comunes (quinchos, piscinas) y agenda al instante." },
                { title: "Pagos sin fricción", desc: "Envío inmediato de links directos de Webpay para saldar gastos comunes o arriendos." },
                { title: "Conserjería en sincronía", desc: "Notificaciones instantáneas de visitas, encomiendas o emergencias registradas por la app." }
              ].map((item, i) => (
                <li key={i} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✓</div>
                  <div>
                    <h4 className="text-sm font-bold text-[#2D2A26] dark:text-[#FBF8F3]">{item.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setIsContactModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl bg-[#1A1611] text-[#FAF7F1] dark:bg-white dark:text-black text-sm hover:opacity-90 transition-all shadow-md"
            >
              Ver recorrido comercial
              <ArrowRight size={15} />
            </button>
          </div>
        </section>

        {/* ── Divider ── */}
        <div className="my-20 md:my-28 flex items-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#E4D8CA] dark:via-[#3B3530] to-transparent" />
          <span className="text-xs font-bold text-[#8A8580] uppercase tracking-widest px-0 md:px-4 text-center">Elige tu rol</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#E4D8CA] dark:via-[#3B3530] to-transparent" />
        </div>

        {/* ── Role Cards — Building Window Style ── */}
        <section className="w-full pb-4">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8705A]/10 border border-[#C8705A]/20 text-[#B45F4B] dark:text-[#DFAF9B] text-xs font-bold tracking-widest uppercase mb-5"
            >
              ✦ Tres roles, una sola plataforma
            </div>
            <h2
              className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-3"
            >
              Tu edificio desde{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8705A] to-[#5A7D5A]">todos los ángulos</span>
            </h2>
            <p
              className="text-[#8A8580] dark:text-[#C8BFB6] text-lg max-w-xl mx-auto"
            >
              Haz clic en tu rol para explorar todo lo que tienes a disposición.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {roles.map((role) => {
              const isHovered = hoveredRole === role.id;
              return (
                <div
                  key={role.id}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  onClick={() => setSelectedInfo(role.id)}
                  id={`role-card-${role.id}`}
                  className="group relative flex flex-col rounded-[2rem] cursor-pointer overflow-hidden transition-all duration-500 ease-out hover:-translate-y-3"
                  style={{
                    background: isHovered
                      ? `linear-gradient(145deg, ${role.color}15, ${role.color}08)`
                      : 'var(--cc-bg-surface)',
                    border: `2px solid ${isHovered ? role.color + '50' : 'var(--cc-border-default)'}`,
                    boxShadow: isHovered
                      ? `0 30px 60px -15px ${role.color}35, 0 0 0 1px ${role.color}20`
                      : '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {/* ── Building facade top bar ── */}
                  <div
                    className="h-2 w-full transition-all duration-500"
                    style={{ background: `linear-gradient(90deg, ${role.color}, ${role.color}99)` }}
                  />

                  {/* ── Building "floors" grid = window grid ── */}
                  <div className="px-6 pt-5 pb-3">
                    <div className="grid grid-cols-3 gap-2">
                      {role.windows.map((win, wi) => (
                        <div
                          key={wi}
                          className="flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center"
                        >
                          <span className="text-base leading-none">{win.icon}</span>
                          <span className="text-[9px] font-bold text-[#8A8580] dark:text-[#C8BFB6] tracking-wide uppercase leading-tight">{win.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Card body ── */}
                  <div className="px-6 pb-6 flex flex-col flex-1 gap-4">
                    <div className="flex items-center gap-3 mt-1">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 transition-all duration-500"
                        style={{
                          background: isHovered
                            ? `linear-gradient(135deg, ${role.color}, ${role.color}cc)`
                            : 'var(--cc-bg-elevated)',
                          boxShadow: isHovered ? `0 6px 20px ${role.color}40` : 'none',
                        }}
                      >
                        {role.emoji}
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold tracking-tight leading-none">{role.title}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: role.color }}>Vista completa</p>
                      </div>
                    </div>

                    <p className="text-[#8A8580] dark:text-[#C8BFB6] text-sm leading-relaxed">{role.description}</p>

                    <div className="flex-1" />

                    <div className="flex items-center justify-between pt-4 border-t border-[#F1EAE1] dark:border-[#3B3530]">
                      <span className="text-sm font-bold transition-colors duration-300" style={{ color: isHovered ? role.color : 'var(--cc-text-tertiary)' }}>
                        Explorar funciones
                      </span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{
                          background: isHovered ? role.color : 'var(--cc-bg-elevated)',
                          color: isHovered ? 'white' : 'var(--cc-text-tertiary)',
                          transform: isHovered ? 'translateX(3px)' : 'none',
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="mt-24 md:mt-32 w-full">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#5A7D5A]/10 border border-[#5A7D5A]/20 text-[#466746] dark:text-[#5A7D5A] text-xs font-bold tracking-widest uppercase mb-5"
            >
              ✦ Proceso simple
            </div>
            <h2
              className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-3"
            >
              Activo con{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#5A7D5A] to-[#C8705A]">IA guiada</span>
            </h2>
            <p
              className="text-[#8A8580] dark:text-[#C8BFB6] text-lg max-w-lg mx-auto"
            >
              Sin configuracion manual interminable. CoCo interpreta, el admin aprueba y la comunidad queda lista para operar.
            </p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-0.5 bg-gradient-to-r from-[#C8705A]/30 via-[#5A7D5A]/30 to-amber-400/30" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center text-center"
                >
                  <div className="relative mb-6">
                    <div
                      className={`w-16 h-16 rounded-2xl ${step.bg} flex items-center justify-center relative z-10 shadow-lg`}
                      style={{ color: step.color, boxShadow: `0 12px 30px ${step.color}30` }}
                    >
                      {step.icon}
                    </div>
                    <div
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white z-20"
                      style={{ background: step.color }}
                    >
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight mb-2">{step.title}</h3>
                  <p className="text-[#8A8580] dark:text-[#C8BFB6] text-sm leading-relaxed max-w-[220px]">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section: Apoyo Mutuo (Solidaridad Vecinal) ── */}
        <section className="mt-24 md:mt-32 w-full max-w-5xl mx-auto rounded-[2.5rem] bg-[#FAF7F1] dark:bg-[#25242A] border border-[#E4D8CA] dark:border-[#3B3530] p-8 md:p-14 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[rgba(95, 122, 70,0.06)] rounded-full blur-3xl" />
          
          <div className="relative z-10 max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#5F7A46]/15 border border-[#5F7A46]/20 text-[#5F7A46] text-xs font-bold tracking-widest uppercase mb-5 animate-pulse">
              ✦ Cohesión Comunitaria Nativa
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-4 text-[#2D2A26] dark:text-[#FBF8F3]">
              Apoyo Mutuo: El <span className="text-[#5F7A46] italic font-serif">corazón</span> de tu comunidad
            </h2>
            <p className="text-base text-slate-500 dark:text-slate-400">
              No somos solo un software contable. Diseñamos el primer ecosistema digital que fomenta la colaboración vecinal organizada y confidencial.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: "01",
                title: "Redondeo Solidario",
                desc: "Al pagar los gastos comunes, los residentes pueden elegir redondear su cuenta (por ejemplo, aportar $800 extra). Cada peso va directo al fondo de la comunidad.",
                icon: <TrendingUp className="w-6 h-6 text-[#5F7A46]" />,
                bg: "bg-[#5F7A46]/10"
              },
              {
                num: "02",
                title: "Fondo Confidencial",
                desc: "Los residentes que enfrentan desempleo, jubilación o gastos de salud graves pueden solicitar el subsidio. El comité lo evalúa y abona a su cuenta sin exponer su privacidad.",
                icon: <Heart className="w-6 h-6 text-[#C8705A]" />,
                bg: "bg-[#C8705A]/10"
              },
              {
                num: "03",
                title: "Retribución Comunitaria",
                desc: "Quienes reciben el subsidio aportan de vuelta realizando tareas sencillas del edificio: clasificación en punto verde, orden de encomiendas o apoyo digital a tercera edad.",
                icon: <Clock className="w-6 h-6 text-[#C99A4A]" />,
                bg: "bg-amber-400/10"
              }
            ].map((pillar, i) => (
              <div key={i} className="flex flex-col p-6 rounded-2xl bg-white dark:bg-[#1E1E24] border border-[#E4D8CA]/60 dark:border-[#3B3530] shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-4">
                  <div className={`w-12 h-12 rounded-xl ${pillar.bg} flex items-center justify-center`}>
                    {pillar.icon}
                  </div>
                  <span className="font-mono text-2xl font-black text-slate-200 dark:text-slate-700">{pillar.num}</span>
                </div>
                <h3 className="text-lg font-bold text-[#2D2A26] dark:text-[#FBF8F3] mb-2">{pillar.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{pillar.desc}</p>
              </div>
            ))}
          </div>
          
          <div className="relative z-10 text-center mt-10">
            <button
              onClick={() => setIsContactModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl border border-slate-300 dark:border-[#3B3530] text-sm text-[#2D2A26] dark:text-[#FAF7F1] hover:bg-slate-50 dark:hover:bg-[#302D2A] transition-all shadow-sm"
            >
              Hablar con un administrador
              <ArrowRight size={15} />
            </button>
          </div>
        </section>

        {/* ── Role Modal ── */}
        {selectedInfo && selectedRole && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              onClick={() => setSelectedInfo(null)}
              className="absolute inset-0 bg-[#2D2A26]/60 backdrop-blur-md"
            />
            <div
              className="relative w-full max-w-xl bg-white dark:bg-[#25242A] rounded-[2.5rem] shadow-2xl overflow-hidden border border-[#E4D8CA] dark:border-[#3B3530]"
            >
              <div className={`h-1.5 bg-gradient-to-r ${selectedRole.gradientFrom} ${selectedRole.gradientTo}`} />
              <div className="p-8 md:p-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${selectedRole.gradientFrom} ${selectedRole.gradientTo} flex items-center justify-center text-2xl shadow-lg`}>
                      {selectedRole.emoji}
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight">{selectedRole.title}</h2>
                      <div className="h-1 w-16 rounded-full mt-1" style={{ background: selectedRole.color }} />
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedInfo(null)}
                    className="p-2 rounded-full hover:bg-[#F1EAE1] dark:hover:bg-[#302D2A] transition-colors"
                  >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  </button>
                </div>

                <p className="text-[#5F5A54] dark:text-[#C8BFB6] mb-8 leading-relaxed font-medium">{selectedRole.fullDescription}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
                  {selectedRole.extraFeatures.map((feat, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-[#FBF8F3] dark:bg-[#302D2A] border border-[#F1EAE1] dark:border-[#3B3530]">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: selectedRole.color }} />
                      <span className="text-sm font-semibold leading-snug text-[#2D2A26] dark:text-[#E4D8CA]">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/onboarding')}
                    className="flex-1 py-4 rounded-2xl text-white font-bold hover:opacity-90 transition-all shadow-lg text-sm"
                    style={{ background: `linear-gradient(135deg, ${selectedRole.color}, ${selectedRole.color}dd)`, boxShadow: `0 8px 24px ${selectedRole.color}40` }}
                  >
                    Ver activacion IA
                  </button>
                  <button
                    onClick={() => setSelectedInfo(null)}
                    className="px-6 py-4 rounded-2xl bg-[#F1EAE1] dark:bg-[#302D2A] font-bold hover:bg-[#E4D8CA] dark:hover:bg-[#3B3530] transition-all text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Pricing ── */}
        <section className="mt-24 md:mt-32 w-full max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-3xl md:text-5xl font-extrabold mb-3 tracking-tighter"
            >
              Planes simples y transparentes
            </h2>
            <p
              className="text-lg text-[#8A8580] dark:text-[#C8BFB6]"
            >
              Todos los planes incluyen 30 días de prueba gratuita. Sin tarjeta de crédito.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Básico */}
            <div
              className="bg-white dark:bg-[#25242A] border-2 border-[#E4D8CA] dark:border-[#3B3530] rounded-[2rem] p-8 flex flex-col hover:border-[#C8705A]/30 hover:shadow-xl hover:shadow-[#C8705A]/10 transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#C8705A]/10 flex items-center justify-center mb-4 text-xl">🏢</div>
              <h3 className="text-xl font-extrabold mb-1">Básico</h3>
              <p className="text-[#8A8580] mb-6 text-sm">Para condominios que recién se digitalizan.</p>
              <div className="mb-1">
                <span className="text-4xl font-extrabold tracking-tight">$19.990</span>
                <span className="text-[#8A8580] font-medium text-sm"> /mes base</span>
              </div>
              <p className="text-xs text-[#8A8580] mb-8">+ $490 por unidad/mes</p>
              <ul className="space-y-3 mb-8 flex-1">
                {['Muro y Avisos', 'Directorio Vecinal', 'Conserjería Digital', 'Espacios Comunes', 'Control de Visitas'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#2D2A26] dark:text-[#E4D8CA] text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-[#C8705A] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
                {['Mantenimiento', 'Votaciones', 'CoCo IA'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#8A8580] text-sm line-through">
                    <div className="w-4 h-4 rounded-full border border-[#d4cbc4] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/onboarding')} id="pricing-basic-cta" className="w-full py-3.5 rounded-xl bg-[#FBF8F3] dark:bg-[#302D2A] hover:bg-[#F1EAE1] dark:hover:bg-[#3B3530] font-bold transition-colors text-sm">
                Probar Plan Básico
              </button>
            </div>

            {/* Avanzado (featured) */}
            <div
              className="bg-gradient-to-b from-[#C8705A] to-[#974C3C] rounded-[2rem] p-8 flex flex-col text-white shadow-2xl shadow-[#C8705A]/30 relative overflow-hidden md:-translate-y-4"
            >
              <div className="absolute top-0 right-0 bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-bl-2xl font-bold text-xs tracking-widest uppercase">Más Popular</div>
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center mb-4 text-xl mt-5 md:mt-0">🚀</div>
              <h3 className="text-xl font-extrabold mb-1">Avanzado</h3>
              <p className="text-white/70 mb-6 text-sm">Para comunidades que quieren más control.</p>
              <div className="mb-1">
                <span className="text-4xl font-extrabold tracking-tight">$34.990</span>
                <span className="text-white/60 font-medium text-sm"> /mes base</span>
              </div>
              <p className="text-xs text-white/50 mb-8">+ $690 por unidad/mes</p>
              <ul className="space-y-3 mb-8 flex-1">
                {['Todo lo del plan Básico', 'Mantenimiento y Solicitudes', 'Votaciones Online', 'Pagos Online', 'Reportes Financieros'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-white text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-white/60 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
                {['CoCo IA'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/40 text-sm line-through">
                    <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/onboarding')} id="pricing-advanced-cta" className="w-full py-3.5 rounded-xl bg-white text-[#B45F4B] hover:bg-[#F4E8DF] font-extrabold transition-colors shadow-lg text-sm">
                Hablar con un Asesor
              </button>
            </div>

            {/* Premium */}
            <div
              className="bg-white dark:bg-[#25242A] border-2 border-[#E4D8CA] dark:border-[#3B3530] rounded-[2rem] p-8 flex flex-col hover:border-[#5A7D5A]/30 hover:shadow-xl hover:shadow-[#5A7D5A]/10 transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#5A7D5A]/10 flex items-center justify-center mb-4 text-xl">✨</div>
              <h3 className="text-xl font-extrabold mb-1">Premium</h3>
              <p className="text-[#8A8580] mb-6 text-sm">La solución total con inteligencia artificial.</p>
              <div className="mb-1">
                <span className="text-4xl font-extrabold tracking-tight">$49.990</span>
                <span className="text-[#8A8580] font-medium text-sm"> /mes base</span>
              </div>
              <p className="text-xs text-[#8A8580] mb-8">+ $990 por unidad/mes</p>
              <ul className="space-y-3 mb-8 flex-1">
                {['Todo lo del plan Avanzado', 'CoCo IA Assistant', 'Aula Virtual', 'Integraciones', 'Soporte Prioritario 24/7'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#2D2A26] dark:text-[#E4D8CA] text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-[#5A7D5A] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/onboarding')} id="pricing-premium-cta" className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#5A7D5A] to-[#466746] hover:from-[#466746] hover:to-[#3F5E3F] text-white font-bold transition-colors shadow-lg shadow-[#5A7D5A]/20 text-sm">
                Activar con CoCo
              </button>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mt-24 md:mt-32 mb-16 w-full max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tighter"
            >
              Preguntas Frecuentes
            </h2>
            <p
              className="text-[#8A8580] dark:text-[#C8BFB6]"
            >
              Todo lo que necesitas saber antes de modernizar tu comunidad.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { q: "¿En qué países está disponible Convive Connect?", a: "Actualmente operamos en Chile, pero nuestra plataforma ha sido diseñada para ser 100% adaptable a cualquier país de Latinoamérica, soportando su respectiva moneda y formatos locales." },
              { q: "¿Es seguro el manejo del dinero y los pagos en la app?", a: "Absolutamente. No almacenamos ni procesamos tarjetas directamente. Usamos pasarelas con certificación PCI Compliance que aseguran máxima protección bancaria." },
              { q: "¿Qué pasa si un residente no tiene smartphone?", a: "No hay problema. Los residentes también pueden acceder desde computadora o tablet navegando por la web." },
              { q: "¿Cuánto tiempo toma activar el edificio?", a: "Depende de la calidad de los datos, pero el flujo esta pensado para que la administracion suba archivos, CoCo detecte brechas y solo se guarde informacion aprobada." }
            ].map((faq, i) => (
              <div
                key={i}
                className="bg-white dark:bg-[#25242A] border border-[#E4D8CA] dark:border-[#3B3530] rounded-2xl p-5 hover:border-[#C8705A]/25 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-[#C8705A]/10 rounded-xl flex-shrink-0 mt-0.5">
                    <HelpCircle className="w-4 h-4 text-[#C8705A]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#2D2A26] dark:text-[#FBF8F3] mb-1.5 tracking-tight">{faq.q}</h4>
                    <p className="text-[#8A8580] dark:text-[#C8BFB6] leading-relaxed text-sm font-medium">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="mb-16 w-full max-w-4xl mx-auto">
          <div
            className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#C8705A] via-[#B45F4B] to-[#974C3C] p-10 md:p-14 text-white text-center"
          >
            {/* Decorative blobs inside banner */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl transform translate-x-20 -translate-y-20" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#5A7D5A]/20 rounded-full blur-2xl transform -translate-x-10 translate-y-10" />
            <div className="relative z-10">
              <div className="text-4xl mb-4">🏘️</div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tighter mb-3">¿Listo para transformar tu comunidad?</h2>
              <p className="text-white/75 text-lg mb-8 max-w-md mx-auto">Únete a las comunidades que ya viven diferente. Empieza gratis hoy.</p>
              <button
                onClick={() => router.push('/onboarding')}
                id="cta-footer-btn"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-[#B45F4B] font-extrabold text-base hover:bg-[#F4E8DF] transition-all shadow-xl shadow-black/20 hover:-translate-y-1"
              >
                Comenzar gratis hoy
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-white/50 text-xs mt-4">Sin tarjeta · Activacion asistida por IA · Cancela cuando quieras</p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 py-8 border-t border-[#E4D8CA] dark:border-[#3B3530]">
        <div className="mx-auto box-border flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row md:px-12">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-[#C8705A] to-[#B45F4B] rounded-lg flex items-center justify-center">
              <Handshake className="text-white w-3.5 h-3.5" />
            </div>
            <BrandWordmark className="text-sm text-[#C8705A]" />
            <span className="text-[#8A8580] text-sm">· © 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-semibold text-[#8A8580]">
            <Link href="/privacy" className="hover:text-[#C8705A] transition-colors">Privacidad</Link>
            <Link href="/terms" className="hover:text-[#C8705A] transition-colors">Términos</Link>
            <Link href="/support" className="hover:text-[#C8705A] transition-colors">Soporte</Link>
          </div>
        </div>
      </footer>

      {/* ── ContactAdminModal ── */}
      {isContactModalOpen && (
        <ContactAdminFormModal
          onClose={() => setIsContactModalOpen(false)}
          toast={toast}
        />
      )}
    </div>
  );
}

function ContactAdminFormModal({ onClose, toast }: { onClose: () => void; toast: any }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [condo, setCondo] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
      const response = await fetch('/api/email/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: name,
          adminEmail: email,
          condoName: condo || 'Tu Comunidad',
        }),
      });

      if (!response.ok) {
        throw new Error('No se pudo enviar el correo.');
      }

      setSuccess(true);
      toast({
        title: "Mensaje enviado",
        description: "Te hemos enviado una propuesta inicial a tu correo.",
        variant: "success",
      });
    } catch (err: unknown) {
      console.warn("Contact send failed:", err instanceof Error ? err.message : err);
      toast({
        title: "No se pudo enviar",
        description: "Revisa tu conexion e intentalo nuevamente.",
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
        className="absolute inset-0 bg-[#2D2A26]/60 backdrop-blur-md"
      />
      <div className="relative w-full max-w-md bg-white dark:bg-[#25242A] rounded-[2.5rem] shadow-2xl overflow-hidden border border-[#E4D8CA] dark:border-[#3B3530] p-8 md:p-10 z-10 text-left">
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[10px] font-semibold tracking-widest text-[#5F7A46] uppercase">CONTACTO</span>
            <h2 className="text-2xl font-extrabold tracking-tight mt-1 text-[#2D2A26] dark:text-[#FBF8F3]">Hablemos de tu Comunidad</h2>
            <p className="text-xs text-[#8A8580] dark:text-[#C8BFB6] mt-1">Implementa el Fondo de Apoyo Mutuo y la gestión inteligente.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#F1EAE1] dark:hover:bg-[#302D2A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#5F7A46]/15 text-[#5F7A46] flex items-center justify-center mx-auto text-2xl">
              ✓
            </div>
            <h3 className="text-lg font-bold text-[#2D2A26] dark:text-[#FBF8F3]">¡Solicitud Recibida!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              Hemos registrado tus datos. Te enviamos un correo automatizado a <strong>{email}</strong> con nuestra propuesta digital para que veas en acción nuestro sistema de notificaciones.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full py-3 bg-[#5F7A46] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
            >
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Nombre Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pedro Moreno"
                required
                className="w-full px-4 py-2.5 rounded-xl border bg-[#FAF7F1] dark:bg-[#1E1E24] text-xs focus:outline-none focus:ring-2 focus:ring-[#5F7A46] transition-all"
                style={{ borderColor: "var(--cc-line-strong)" }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pedro@comunidad.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border bg-[#FAF7F1] dark:bg-[#1E1E24] text-xs focus:outline-none focus:ring-2 focus:ring-[#5F7A46] transition-all"
                style={{ borderColor: "var(--cc-line-strong)" }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Nombre del Edificio / Condominio</label>
              <input
                type="text"
                value={condo}
                onChange={(e) => setCondo(e.target.value)}
                placeholder="Edificio Plaza Mayo"
                className="w-full px-4 py-2.5 rounded-xl border bg-[#FAF7F1] dark:bg-[#1E1E24] text-xs focus:outline-none focus:ring-2 focus:ring-[#5F7A46] transition-all"
                style={{ borderColor: "var(--cc-line-strong)" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 bg-[#5F7A46] text-white text-xs font-bold rounded-xl flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
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
