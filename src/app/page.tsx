"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { useTheme } from 'next-themes';
import {
  Building2, User, ShieldCheck, KeyRound,
  Sun, Moon, CheckCircle2, HelpCircle,
  BellRing, CreditCard, CalendarCheck, ArrowRight,
  MessageSquare, Package, MapPin, TrendingUp, Star,
  Users, Home, Zap, ChevronRight
} from 'lucide-react';
import { motion, useInView } from 'framer-motion';

/* ── Animated counter hook ────────────────────────────── */
function useCounter(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

/* ── Mini App Mockup ──────────────────────────────────── */
function AppMockup() {
  const [activeCard, setActiveCard] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActiveCard(c => (c + 1) % 3), 2800);
    return () => clearInterval(t);
  }, []);

  const cards = [
    {
      icon: <BellRing className="w-5 h-5 text-[#FF6B47]" />,
      label: "Nueva circular",
      sub: "Asamblea de propietarios — Sáb 19 Abr, 19:00",
      tag: "Urgente",
      tagColor: "bg-[#FF6B47]/10 text-[#FF6B47]",
      delay: "animate-float-card",
    },
    {
      icon: <CreditCard className="w-5 h-5 text-[#0BC9A1]" />,
      label: "Gasto común pagado",
      sub: "$45.200 — Marzo 2026 ✓",
      tag: "Pagado",
      tagColor: "bg-[#0BC9A1]/10 text-[#0BC9A1]",
      delay: "animate-float-card-delay-1",
    },
    {
      icon: <CalendarCheck className="w-5 h-5 text-amber-500" />,
      label: "Reserva confirmada",
      sub: "Piscina — Domingo 20 Abr, 11:00",
      tag: "Confirmada",
      tagColor: "bg-amber-400/10 text-amber-600 dark:text-amber-400",
      delay: "animate-float-card-delay-2",
    },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Phone frame */}
      <div className="relative bg-white dark:bg-[#1e1912] rounded-[2.5rem] shadow-2xl border border-[#e8e2dd] dark:border-[#3d3530] overflow-hidden"
        style={{ boxShadow: '0 40px 80px -20px rgba(255,107,71,0.25), 0 20px 40px -10px rgba(0,0,0,0.15)' }}>
        {/* Status bar */}
        <div className="flex justify-between items-center px-6 pt-4 pb-2 text-xs font-semibold text-[#7a706a] dark:text-[#7a706a]">
          <span>9:41</span>
          <div className="w-20 h-5 bg-[#1A1512] dark:bg-[#f5f0ec] rounded-full mx-auto" />
          <span>📶</span>
        </div>

        {/* App header */}
        <div className="px-5 pt-2 pb-4 border-b border-[#f5f1ee] dark:border-[#2e2820]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF6B47] to-[#e8502d] flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1A1512] dark:text-[#f5f0ec]">ComunidadConnect</p>
              <p className="text-[10px] text-[#a89e97]">Torre Norte · Depto 8B</p>
            </div>
            <div className="ml-auto relative">
              <BellRing className="w-5 h-5 text-[#7a706a]" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#FF6B47] rounded-full border-2 border-white dark:border-[#1e1912]" />
            </div>
          </div>
        </div>

        {/* Cards stack */}
        <div className="px-5 py-4 space-y-3 pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a89e97]">Actividad reciente</p>
          {cards.map((card, i) => (
            <motion.div
              key={i}
              animate={{
                scale: activeCard === i ? 1 : 0.97,
                opacity: activeCard === i ? 1 : 0.5,
                y: activeCard === i ? 0 : 6,
              }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#faf8f6] dark:bg-[#26201a] border border-[#e8e2dd] dark:border-[#3d3530]"
            >
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#1e1912] flex items-center justify-center shadow-sm flex-shrink-0">
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#1A1512] dark:text-[#f5f0ec] leading-tight">{card.label}</p>
                <p className="text-xs text-[#7a706a] mt-0.5 leading-relaxed truncate">{card.sub}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${card.tagColor}`}>{card.tag}</span>
            </motion.div>
          ))}

          {/* Mini bottom nav */}
          <div className="flex justify-around pt-3 border-t border-[#f5f1ee] dark:border-[#2e2820]">
            {[
              { icon: <Home className="w-4 h-4" />, label: "Inicio", active: true },
              { icon: <CreditCard className="w-4 h-4" />, label: "Pagos", active: false },
              { icon: <MessageSquare className="w-4 h-4" />, label: "Chat", active: false },
              { icon: <User className="w-4 h-4" />, label: "Perfil", active: false },
            ].map((item, i) => (
              <div key={i} className={`flex flex-col items-center gap-1 ${item.active ? 'text-[#FF6B47]' : 'text-[#a89e97]'}`}>
                {item.icon}
                <span className="text-[9px] font-semibold">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating notification badge */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-6 top-16 bg-white dark:bg-[#26201a] shadow-xl rounded-2xl px-4 py-2.5 flex items-center gap-2.5 border border-[#e8e2dd] dark:border-[#3d3530]"
      >
        <div className="w-7 h-7 rounded-xl bg-[#FF6B47]/10 flex items-center justify-center">
          <Package className="w-3.5 h-3.5 text-[#FF6B47]" />
        </div>
        <div>
          <p className="text-xs font-bold text-[#1A1512] dark:text-[#f5f0ec]">Paquete llegó</p>
          <p className="text-[10px] text-[#a89e97]">Conserjería · ahora</p>
        </div>
      </motion.div>

      {/* Floating payment badge */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -left-8 bottom-20 bg-white dark:bg-[#26201a] shadow-xl rounded-2xl px-4 py-2.5 flex items-center gap-2.5 border border-[#e8e2dd] dark:border-[#3d3530]"
      >
        <div className="w-7 h-7 rounded-xl bg-[#0BC9A1]/10 flex items-center justify-center">
          <TrendingUp className="w-3.5 h-3.5 text-[#0BC9A1]" />
        </div>
        <div>
          <p className="text-xs font-bold text-[#1A1512] dark:text-[#f5f0ec]">Recaudo 98%</p>
          <p className="text-[10px] text-[#a89e97]">Este mes</p>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Trust Stats ──────────────────────────────────────── */
function TrustStats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  const units = useCounter(850, 2000, inView);
  const communities = useCounter(32, 1800, inView);
  const satisfaction = useCounter(98, 1600, inView);

  const stats = [
    { value: `+${units}`, label: "Unidades gestionadas", icon: <Home className="w-5 h-5" />, color: "text-[#FF6B47]", bg: "bg-[#FF6B47]/10" },
    { value: communities, label: "Comunidades activas", icon: <Building2 className="w-5 h-5" />, color: "text-[#0BC9A1]", bg: "bg-[#0BC9A1]/10" },
    { value: `${satisfaction}%`, label: "Satisfacción de usuarios", icon: <Star className="w-5 h-5" />, color: "text-amber-500", bg: "bg-amber-400/10" },
  ];

  return (
    <div ref={ref} className="w-full max-w-4xl mx-auto mt-16 md:mt-20">
      <div className="grid grid-cols-3 gap-4 md:gap-8">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center gap-2"
          >
            <div className={`w-11 h-11 rounded-2xl ${s.bg} flex items-center justify-center ${s.color} mb-1`}>
              {s.icon}
            </div>
            <p className={`text-2xl md:text-4xl font-extrabold tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-xs md:text-sm text-[#7a706a] dark:text-[#b0a8a2] font-medium leading-tight">{s.label}</p>
          </motion.div>
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
    color: '#FF6B47',
    gradientFrom: 'from-[#FF6B47]',
    gradientTo: 'to-[#e8502d]',
    shadowColor: 'hover:shadow-[#FF6B47]/20',
    borderHover: 'hover:border-[#FF6B47]/40',
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
    color: '#0BC9A1',
    gradientFrom: 'from-[#0BC9A1]',
    gradientTo: 'to-[#08a884]',
    shadowColor: 'hover:shadow-[#0BC9A1]/20',
    borderHover: 'hover:border-[#0BC9A1]/40',
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
    title: 'Registra tu comunidad',
    desc: 'Sube tu lista de departamentos en Excel. En 48 horas tenemos todo configurado y listo.',
    icon: <Building2 className="w-6 h-6" />,
    color: '#FF6B47',
    bg: 'bg-[#FF6B47]/10',
  },
  {
    num: '02',
    title: 'Invita a tus vecinos',
    desc: 'Enviamos el link de registro a cada residente. Se unen en segundos desde su celular.',
    icon: <Users className="w-6 h-6" />,
    color: '#0BC9A1',
    bg: 'bg-[#0BC9A1]/10',
  },
  {
    num: '03',
    title: 'Tu comunidad conectada',
    desc: 'Pagos, reservas, circulares y más. Todo en una app que la gente de verdad quiere usar.',
    icon: <Zap className="w-6 h-6" />,
    color: '#f59e0b',
    bg: 'bg-amber-400/10',
  },
];

/* ── Testimonials ─────────────────────────────────────── */
const testimonials = [
  {
    name: 'Valentina Rojas',
    role: 'Administradora · Condominio Los Pinos',
    quote: 'Los gastos comunes que antes tardaban una semana en recaudar, ahora los tenemos el mismo día. ComunidadConnect cambió todo.',
    avatar: '🧑‍💼',
    color: '#FF6B47',
    stars: 5,
  },
  {
    name: 'Sebastián Muñoz',
    role: 'Residente · Torre Andes',
    quote: 'Reservar la piscina, hablar con la conserjería y pagar todo desde el teléfono. Mi edificio por fin es moderno.',
    avatar: '👨‍💻',
    color: '#0BC9A1',
    stars: 5,
  },
  {
    name: 'María José Fernández',
    role: 'Conserje · Edificio Bellavista',
    quote: 'El libro de novedades digital me salvó la vida. Nada más de cuadernos perdidos ni malentendidos en los turnos.',
    avatar: '👩‍🔧',
    color: '#f59e0b',
    stars: 5,
  },
];

/* ── Main Page ────────────────────────────────────────── */
export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user && !authLoading) router.push('/home');
  }, [user, authLoading, router]);

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  const selectedRole = roles.find(r => r.id === selectedInfo);

  return (
    <div className="min-h-screen bg-[#FFF8F5] dark:bg-[#111008] text-[#1A1512] dark:text-[#f5f0ec] flex flex-col font-sans overflow-x-hidden relative transition-colors duration-700">

      {/* ── Background blobs ── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Warm coral blob top-right */}
        <div className="animate-morph-blob absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-[#FF6B47]/20 to-[#FF6B47]/5 blur-3xl" />
        {/* Teal blob bottom-left */}
        <div className="animate-morph-blob absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-br from-[#0BC9A1]/15 to-[#0BC9A1]/5 blur-3xl" style={{ animationDelay: '3s' }} />
        {/* Subtle warm grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#FF6B4706_1px,transparent_1px),linear-gradient(to_bottom,#FF6B4706_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 w-full px-6 py-5 md:px-12 flex justify-between items-center max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-[#FF6B47] to-[#e8502d] rounded-2xl flex items-center justify-center shadow-lg shadow-[#FF6B47]/30">
            <Building2 className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">
            Comunidad<span className="text-[#FF6B47]">Connect</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <button
            onClick={() => router.push('/login')}
            className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-[#5a534e] dark:text-[#b0a8a2] hover:text-[#FF6B47] dark:hover:text-[#FF6B47] transition-colors"
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => router.push('/signup')}
            className="px-5 py-2.5 rounded-xl bg-[#FF6B47] hover:bg-[#e8502d] text-white text-sm font-bold transition-all shadow-md shadow-[#FF6B47]/30 hover:shadow-[#FF6B47]/50 hover:-translate-y-0.5"
          >
            Empezar gratis
          </button>
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-white/70 dark:bg-[#1e1912]/70 border border-[#e8e2dd] dark:border-[#3d3530] hover:bg-[#f5f1ee] dark:hover:bg-[#26201a] transition-colors backdrop-blur-sm"
          >
            {mounted ? (
              resolvedTheme === 'light' ? <Moon className="w-4 h-4 text-[#5a534e]" /> : <Sun className="w-4 h-4 text-amber-400" />
            ) : <div className="w-4 h-4" />}
          </button>
        </motion.div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col w-full max-w-7xl mx-auto px-6 md:px-12">

        {/* ── Hero: Asymmetric ── */}
        <section className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 pt-10 pb-4 md:pt-16">

          {/* Left: Text */}
          <div className="flex-1 max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#FF6B47]/10 border border-[#FF6B47]/20 text-[#e8502d] dark:text-[#ff9d80] text-sm font-bold tracking-wide mb-6"
            >
              <MapPin className="w-3.5 h-3.5" />
              La plataforma de las comunidades chilenas
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.08] mb-6"
            >
              Tu edificio,{' '}
              <span className="relative inline-block">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6B47] to-[#e8502d]">más humano</span>
                <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 200 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 5 Q50 1 100 5 Q150 9 200 5" stroke="#FF6B47" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />
                </svg>
              </span>
              {' '}que nunca.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-[#5a534e] dark:text-[#b0a8a2] leading-relaxed mb-8 max-w-md"
            >
              Gastos comunes, reservas, conserjería y vecinos — todo conectado en una app que la gente de verdad quiere usar.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <button
                onClick={() => router.push('/signup')}
                id="cta-hero-primary"
                className="group flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#FF6B47] hover:bg-[#e8502d] text-white font-bold text-base transition-all shadow-xl shadow-[#FF6B47]/30 hover:shadow-[#FF6B47]/50 hover:-translate-y-1"
              >
                Probar gratis 30 días
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => router.push('/login')}
                className="flex items-center gap-2 px-7 py-4 rounded-2xl bg-white dark:bg-[#1e1912] border border-[#e8e2dd] dark:border-[#3d3530] text-[#3d3835] dark:text-[#f5f0ec] font-bold text-base hover:border-[#FF6B47]/40 transition-all shadow-sm"
              >
                Iniciar sesión
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 mt-6 text-sm text-[#a89e97] dark:text-[#7a706a]"
            >
              <CheckCircle2 className="w-4 h-4 text-[#0BC9A1]" />
              <span>Sin tarjeta de crédito</span>
              <span className="mx-2">·</span>
              <CheckCircle2 className="w-4 h-4 text-[#0BC9A1]" />
              <span>Onboarding en 48 horas</span>
              <span className="mx-2">·</span>
              <CheckCircle2 className="w-4 h-4 text-[#0BC9A1]" />
              <span>Cancela cuando quieras</span>
            </motion.div>
          </div>

          {/* Right: Interactive App Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40, rotate: 2 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex-shrink-0 w-full max-w-[320px] lg:max-w-[360px]"
          >
            <AppMockup />
          </motion.div>
        </section>

        {/* ── Trust Stats ── */}
        <TrustStats />

        {/* ── Divider ── */}
        <div className="my-20 md:my-28 flex items-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#e8e2dd] dark:via-[#3d3530] to-transparent" />
          <span className="text-xs font-bold text-[#a89e97] uppercase tracking-widest px-4">Elige tu rol</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#e8e2dd] dark:via-[#3d3530] to-transparent" />
        </div>

        {/* ── Role Cards — Building Window Style ── */}
        <section className="w-full pb-4">
          <div className="text-center mb-14">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF6B47]/10 border border-[#FF6B47]/20 text-[#e8502d] dark:text-[#ff9d80] text-xs font-bold tracking-widest uppercase mb-5"
            >
              ✦ Tres roles, una sola plataforma
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-3"
            >
              Tu edificio desde{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6B47] to-[#0BC9A1]">todos los ángulos</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-[#7a706a] dark:text-[#b0a8a2] text-lg max-w-xl mx-auto"
            >
              Haz clic en tu rol para explorar todo lo que tienes a disposición.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {roles.map((role, idx) => {
              const isHovered = hoveredRole === role.id;
              return (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: idx * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  onClick={() => setSelectedInfo(role.id)}
                  id={`role-card-${role.id}`}
                  className="group relative flex flex-col rounded-[2rem] cursor-pointer overflow-hidden transition-all duration-500 ease-out hover:-translate-y-3"
                  style={{
                    background: isHovered
                      ? `linear-gradient(145deg, ${role.color}15, ${role.color}08)`
                      : 'var(--surface)',
                    border: `2px solid ${isHovered ? role.color + '50' : 'var(--border-default)'}`,
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
                        <motion.div
                          key={wi}
                          initial={false}
                          animate={{
                            background: isHovered
                              ? `linear-gradient(135deg, ${role.color}18, ${role.color}08)`
                              : 'var(--background-subtle)',
                            borderColor: isHovered ? `${role.color}40` : 'var(--border-subtle)',
                          }}
                          transition={{ duration: 0.3, delay: wi * 0.04 }}
                          className="flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center"
                        >
                          <span className="text-base leading-none">{win.icon}</span>
                          <span className="text-[9px] font-bold text-[#7a706a] dark:text-[#b0a8a2] tracking-wide uppercase leading-tight">{win.label}</span>
                        </motion.div>
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
                            : 'var(--background-subtle)',
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

                    <p className="text-[#7a706a] dark:text-[#b0a8a2] text-sm leading-relaxed">{role.description}</p>

                    <div className="flex-1" />

                    <div className="flex items-center justify-between pt-4 border-t border-[#f5f1ee] dark:border-[#2e2820]">
                      <span className="text-sm font-bold transition-colors duration-300" style={{ color: isHovered ? role.color : 'var(--text-muted)' }}>
                        Explorar funciones
                      </span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{
                          background: isHovered ? role.color : 'var(--background-subtle)',
                          color: isHovered ? 'white' : 'var(--text-muted)',
                          transform: isHovered ? 'translateX(3px)' : 'none',
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="mt-24 md:mt-32 w-full">
          <div className="text-center mb-14">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0BC9A1]/10 border border-[#0BC9A1]/20 text-[#08a884] dark:text-[#0BC9A1] text-xs font-bold tracking-widest uppercase mb-5"
            >
              ✦ Proceso simple
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-3"
            >
              Listo en{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0BC9A1] to-[#FF6B47]">48 horas</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-[#7a706a] dark:text-[#b0a8a2] text-lg max-w-lg mx-auto"
            >
              Sin instalaciones complicadas. Sin cursos. Solo una comunidad más conectada.
            </motion.p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-0.5 bg-gradient-to-r from-[#FF6B47]/30 via-[#0BC9A1]/30 to-amber-400/30" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
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
                  <p className="text-[#7a706a] dark:text-[#b0a8a2] text-sm leading-relaxed max-w-[220px]">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="mt-24 md:mt-32 w-full">
          <div className="text-center mb-14">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-extrabold tracking-tighter mb-3"
            >
              Lo que dicen{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6B47] to-[#0BC9A1]">las comunidades</span>
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex flex-col gap-5 p-7 rounded-[2rem] bg-white dark:bg-[#1e1912] border border-[#e8e2dd] dark:border-[#3d3530] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* Quote mark */}
                <div className="text-5xl leading-none font-black opacity-10 absolute top-4 right-6" style={{ color: t.color }}>"</div>

                {/* Stars */}
                <div className="flex gap-1">
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <Star key={si} className="w-4 h-4 fill-current" style={{ color: t.color }} />
                  ))}
                </div>

                <p className="text-[#3d3835] dark:text-[#e8e2dd] text-sm leading-relaxed font-medium flex-1">«{t.quote}»</p>

                <div className="flex items-center gap-3 pt-4 border-t border-[#f5f1ee] dark:border-[#2e2820]">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${t.color}15` }}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1A1512] dark:text-[#f5f0ec]">{t.name}</p>
                    <p className="text-[11px] text-[#a89e97] font-medium">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Role Modal ── */}
        {selectedInfo && selectedRole && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setSelectedInfo(null)}
              className="absolute inset-0 bg-[#1A1512]/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
              className="relative w-full max-w-xl bg-white dark:bg-[#1e1912] rounded-[2.5rem] shadow-2xl overflow-hidden border border-[#e8e2dd] dark:border-[#3d3530]"
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
                    className="p-2 rounded-full hover:bg-[#f5f1ee] dark:hover:bg-[#26201a] transition-colors"
                  >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  </button>
                </div>

                <p className="text-[#5a534e] dark:text-[#b0a8a2] mb-8 leading-relaxed font-medium">{selectedRole.fullDescription}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
                  {selectedRole.extraFeatures.map((feat, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-[#faf8f6] dark:bg-[#26201a] border border-[#f5f1ee] dark:border-[#3d3530]">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: selectedRole.color }} />
                      <span className="text-sm font-semibold leading-snug text-[#3d3835] dark:text-[#e8e2dd]">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/signup')}
                    className="flex-1 py-4 rounded-2xl text-white font-bold hover:opacity-90 transition-all shadow-lg text-sm"
                    style={{ background: `linear-gradient(135deg, ${selectedRole.color}, ${selectedRole.color}dd)`, boxShadow: `0 8px 24px ${selectedRole.color}40` }}
                  >
                    Empezar Ahora
                  </button>
                  <button
                    onClick={() => setSelectedInfo(null)}
                    className="px-6 py-4 rounded-2xl bg-[#f5f1ee] dark:bg-[#26201a] font-bold hover:bg-[#e8e2dd] dark:hover:bg-[#3d3530] transition-all text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Pricing ── */}
        <section className="mt-24 md:mt-32 w-full max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-extrabold mb-3 tracking-tighter"
            >
              Planes simples y transparentes
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-[#7a706a] dark:text-[#b0a8a2]"
            >
              Todos los planes incluyen 30 días de prueba gratuita. Sin tarjeta de crédito.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Básico */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-[#1e1912] border-2 border-[#e8e2dd] dark:border-[#3d3530] rounded-[2rem] p-8 flex flex-col hover:border-[#FF6B47]/30 hover:shadow-xl hover:shadow-[#FF6B47]/10 transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#FF6B47]/10 flex items-center justify-center mb-4 text-xl">🏢</div>
              <h3 className="text-xl font-extrabold mb-1">Básico</h3>
              <p className="text-[#a89e97] mb-6 text-sm">Para condominios que recién se digitalizan.</p>
              <div className="mb-1">
                <span className="text-4xl font-extrabold tracking-tight">$19.990</span>
                <span className="text-[#a89e97] font-medium text-sm"> /mes base</span>
              </div>
              <p className="text-xs text-[#a89e97] mb-8">+ $490 por unidad/mes</p>
              <ul className="space-y-3 mb-8 flex-1">
                {['Muro y Avisos', 'Directorio Vecinal', 'Conserjería Digital', 'Espacios Comunes', 'Control de Visitas'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#3d3835] dark:text-[#e8e2dd] text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-[#FF6B47] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
                {['Mantenimiento', 'Votaciones', 'CoCo IA'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#a89e97] text-sm line-through">
                    <div className="w-4 h-4 rounded-full border border-[#d4cbc4] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/admin-onboarding')} id="pricing-basic-cta" className="w-full py-3.5 rounded-xl bg-[#faf8f6] dark:bg-[#26201a] hover:bg-[#f5f1ee] dark:hover:bg-[#2e2820] font-bold transition-colors text-sm">
                Empezar Gratis
              </button>
            </motion.div>

            {/* Avanzado (featured) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-b from-[#FF6B47] to-[#c03a1d] rounded-[2rem] p-8 flex flex-col text-white shadow-2xl shadow-[#FF6B47]/30 relative overflow-hidden md:-translate-y-4"
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
              <button onClick={() => router.push('/admin-onboarding')} id="pricing-advanced-cta" className="w-full py-3.5 rounded-xl bg-white text-[#e8502d] hover:bg-[#fff3f0] font-extrabold transition-colors shadow-lg text-sm">
                Empezar Gratis
              </button>
            </motion.div>

            {/* Premium */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-[#1e1912] border-2 border-[#e8e2dd] dark:border-[#3d3530] rounded-[2rem] p-8 flex flex-col hover:border-[#0BC9A1]/30 hover:shadow-xl hover:shadow-[#0BC9A1]/10 transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#0BC9A1]/10 flex items-center justify-center mb-4 text-xl">✨</div>
              <h3 className="text-xl font-extrabold mb-1">Premium</h3>
              <p className="text-[#a89e97] mb-6 text-sm">La solución total con inteligencia artificial.</p>
              <div className="mb-1">
                <span className="text-4xl font-extrabold tracking-tight">$49.990</span>
                <span className="text-[#a89e97] font-medium text-sm"> /mes base</span>
              </div>
              <p className="text-xs text-[#a89e97] mb-8">+ $990 por unidad/mes</p>
              <ul className="space-y-3 mb-8 flex-1">
                {['Todo lo del plan Avanzado', 'CoCo IA Assistant', 'Aula Virtual', 'Integraciones', 'Soporte Prioritario 24/7'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#3d3835] dark:text-[#e8e2dd] text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-[#0BC9A1] flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/admin-onboarding')} id="pricing-premium-cta" className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#0BC9A1] to-[#08a884] hover:from-[#08a884] hover:to-[#06967a] text-white font-bold transition-colors shadow-lg shadow-[#0BC9A1]/20 text-sm">
                Empezar Gratis
              </button>
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mt-24 md:mt-32 mb-16 w-full max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tighter"
            >
              Preguntas Frecuentes
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-[#7a706a] dark:text-[#b0a8a2]"
            >
              Todo lo que necesitas saber antes de modernizar tu comunidad.
            </motion.p>
          </div>

          <div className="space-y-3">
            {[
              { q: "¿En qué países está disponible ComunidadConnect?", a: "Actualmente operamos en Chile, pero nuestra plataforma ha sido diseñada para ser 100% adaptable a cualquier país de Latinoamérica, soportando su respectiva moneda y formatos locales." },
              { q: "¿Es seguro el manejo del dinero y los pagos en la app?", a: "Absolutamente. No almacenamos ni procesamos tarjetas directamente. Usamos pasarelas con certificación PCI Compliance que aseguran máxima protección bancaria." },
              { q: "¿Qué pasa si un residente no tiene smartphone?", a: "No hay problema. Los residentes también pueden acceder desde computadora o tablet navegando por la web." },
              { q: "¿Cuánto tiempo toma instalar el sistema en el edificio?", a: "Muy poco. Una vez que nos envías la lista de departamentos y residentes en Excel, dejamos todo funcionando en menos de 48 horas hábiles." }
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * i }}
                className="bg-white dark:bg-[#1e1912] border border-[#e8e2dd] dark:border-[#3d3530] rounded-2xl p-5 hover:border-[#FF6B47]/25 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-[#FF6B47]/10 rounded-xl flex-shrink-0 mt-0.5">
                    <HelpCircle className="w-4 h-4 text-[#FF6B47]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#1A1512] dark:text-[#f5f0ec] mb-1.5 tracking-tight">{faq.q}</h4>
                    <p className="text-[#7a706a] dark:text-[#b0a8a2] leading-relaxed text-sm font-medium">{faq.a}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="mb-16 w-full max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#FF6B47] via-[#e8502d] to-[#c03a1d] p-10 md:p-14 text-white text-center"
          >
            {/* Decorative blobs inside banner */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl transform translate-x-20 -translate-y-20" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0BC9A1]/20 rounded-full blur-2xl transform -translate-x-10 translate-y-10" />
            <div className="relative z-10">
              <div className="text-4xl mb-4">🏘️</div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tighter mb-3">¿Listo para transformar tu comunidad?</h2>
              <p className="text-white/75 text-lg mb-8 max-w-md mx-auto">Únete a las comunidades que ya viven diferente. Empieza gratis hoy.</p>
              <button
                onClick={() => router.push('/signup')}
                id="cta-footer-btn"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-[#e8502d] font-extrabold text-base hover:bg-[#fff3f0] transition-all shadow-xl shadow-black/20 hover:-translate-y-1"
              >
                Crear mi cuenta gratis
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-white/50 text-xs mt-4">Sin tarjeta · Onboarding en 48h · Cancela cuando quieras</p>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 py-8 border-t border-[#e8e2dd] dark:border-[#2e2820]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-[#FF6B47] to-[#e8502d] rounded-lg flex items-center justify-center">
              <Building2 className="text-white w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-bold text-[#5a534e] dark:text-[#b0a8a2]">
              Comunidad<span className="text-[#FF6B47]">Connect</span>
            </span>
            <span className="text-[#a89e97] text-sm">· © 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-semibold text-[#a89e97]">
            <Link href="/privacy" className="hover:text-[#FF6B47] transition-colors">Privacidad</Link>
            <Link href="/terms" className="hover:text-[#FF6B47] transition-colors">Términos</Link>
            <a href="mailto:soporte@comunidadconnect.com" className="hover:text-[#FF6B47] transition-colors">Soporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
