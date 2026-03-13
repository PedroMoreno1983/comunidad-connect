"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { useTheme } from 'next-themes';
import {
  Building2, User, ShieldCheck, KeyRound,
  Sun, Moon, Sparkles, Command, ChevronRight,
  CheckCircle2, HelpCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (user && !authLoading) {
      router.push('/home');
    }
  }, [user, authLoading, router]);

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');

  const features = [
    {
      id: 'admin',
      title: 'Administración',
      icon: ShieldCheck,
      description: 'Panel de control centralizado. Finanzas, auditoría y gestión de comunidad integral.',
      color: 'from-blue-500 to-indigo-600',
      borderHover: 'hover:border-blue-500/50',
      bgHover: 'group-hover:bg-blue-500/5',
      shadowHover: 'hover:shadow-blue-500/20',
      features: ['Analítica Financiera', 'Gestión de Residentes', 'Reportes de Consumo']
    },
    {
      id: 'resident',
      title: 'Residente',
      icon: User,
      description: 'Tu hogar inteligente. Reservas, pagos y comunicación vecinal en un solo lugar.',
      color: 'from-violet-500 to-purple-600',
      borderHover: 'hover:border-violet-500/50',
      bgHover: 'group-hover:bg-violet-500/5',
      shadowHover: 'hover:shadow-violet-500/20',
      features: ['Pago de Gastos', 'Marketplace', 'Reservas de Espacios']
    },
    {
      id: 'concierge',
      title: 'Conserjería',
      icon: KeyRound,
      description: 'Operaciones en tiempo real. Máxima seguridad y estricto control de accesos.',
      color: 'from-emerald-500 to-teal-600',
      borderHover: 'hover:border-emerald-500/50',
      bgHover: 'group-hover:bg-emerald-500/5',
      shadowHover: 'hover:shadow-emerald-500/20',
      features: ['Control de Visitas', 'Recepción de Paquetes', 'Gestión de Emergencias']
    }
  ];

  const roleDetails: Record<string, { title: string; fullDescription: string; extraFeatures: string[] }> = {
    admin: {
      title: 'Administración Profesional',
      fullDescription: 'El cerebro de la comunidad. Diseñado para administradores que buscan transparencia total y eficiencia operativa absoluta.',
      extraFeatures: [
        'Auditoría en tiempo real de todos los movimientos financieros.',
        'Emisión masiva de gastos comunes con un solo clic.',
        'Portal de transparencia para que los residentes vean en qué se gasta su dinero.',
        'Gestión de proveedores y contratos de mantenimiento preventivo.'
      ]
    },
    resident: {
      title: 'Experiencia del Residente',
      fullDescription: 'Tu edificio en el bolsillo. Eliminamos la fricción de vivir en comunidad con herramientas modernas y fáciles de usar.',
      extraFeatures: [
        'Notificaciones push instantáneas sobre avisos de la comunidad.',
        'Marketplace interno seguro para comprar y vender con tus vecinos.',
        'Sistema de reservas inteligentes con pago integrado.',
        'Chat directo con administración y conserjería.'
      ]
    },
    concierge: {
      title: 'Control y Seguridad',
      fullDescription: 'La primera línea de defensa. Empoderamos a la conserjería con tecnología para un control de acceso sin errores.',
      extraFeatures: [
        'Registro digital de visitas con escaneo de documentos.',
        'Control de paquetes y encomiendas con notificaciones automáticas.',
        'Libro de novedades digital para cambios de turno eficientes.',
        'Botón de pánico y gestión de protocolos de emergencia.'
      ]
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 overflow-hidden relative transition-colors duration-700">

      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Subtle Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        {/* Ambient Glows (Optimized: hidden on mobile to prevent severe performance drops) */}
        <div className="hidden md:block absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/20 dark:bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="hidden md:block absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 dark:bg-purple-500/10 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      <header className="relative z-10 w-full px-6 py-6 md:px-12 md:py-8 flex justify-between items-center max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Building2 className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Comunidad<span className="text-indigo-500 dark:text-indigo-400">Connect</span></span>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={toggleTheme}
          className="p-2.5 rounded-full bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/50 dark:border-slate-700/50 hover:bg-slate-300/50 dark:hover:bg-slate-700 transition-colors backdrop-blur-sm"
        >
          {mounted ? (
            resolvedTheme === 'light' ? <Moon className="w-5 h-5 text-slate-700" /> : <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <div className="w-5 h-5" />
          )}
        </motion.button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-20 w-full max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto space-y-8 mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-sm font-semibold tracking-wide"
          >
            <Sparkles className="w-4 h-4" />
            La evolución de la gestión inmobiliaria
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter leading-[1.1] break-words"
          >
            Administración inteligente que <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">conecta personas</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
          >
            Una plataforma de nivel empresarial diseñada para hacer que la vida en comunidad sea más simple, transparente y segura.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-4 mt-8"
          >
            <button
              onClick={() => router.push('/login')}
              className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center gap-2"
            >
              Iniciar Sesión <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push('/signup')}
              className="px-8 py-4 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold border border-slate-200 dark:border-slate-700 transition-all shadow-sm"
            >
              Registrarse
            </button>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full z-20">
          {features.map((role, idx) => {
            const Icon = role.icon;
            const isHovered = hoveredRole === role.id;

            return (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + (idx * 0.1) }}
                onMouseEnter={() => setHoveredRole(role.id)}
                onMouseLeave={() => setHoveredRole(null)}
                onClick={() => setSelectedInfo(role.id)}
                className={`
                  group relative flex flex-col p-8 rounded-[2rem] cursor-pointer
                  bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60
                  transition-all duration-500 ease-out
                  ${role.shadowHover} ${role.borderHover} ${role.bgHover}
                  hover:-translate-y-2 focus:outline-none focus:ring-4 focus:ring-indigo-500/20
                `}
                role="button"
                tabIndex={0}
              >
                {/* Glowing orb behind icon on hover */}
                {isHovered && (
                  <motion.div
                    layoutId="hover-glow"
                    className={`absolute w-32 h-32 bg-gradient-to-br ${role.color} rounded-full blur-[50px] opacity-20 top-10 left-10`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    exit={{ opacity: 0 }}
                  />
                )}

                <div className={`
                  w-14 h-14 rounded-2xl mb-8 flex items-center justify-center transition-transform duration-500 z-10
                  bg-gradient-to-br ${isHovered ? role.color : 'from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700'}
                  ${isHovered ? 'scale-110 shadow-lg' : ''}
                `}>
                  <Icon className={`w-7 h-7 ${isHovered ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>

                <div className="flex-1 z-10">
                  <h3 className="text-2xl font-bold mb-3 tracking-tight">{role.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                    {role.description}
                  </p>

                  <div className="space-y-4 mb-8">
                    {role.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 font-medium">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br flex-shrink-0 ${role.color}`} />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between z-10">
                  <span className={`text-sm font-semibold transition-colors duration-300 ${isHovered ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                    Más información
                  </span>
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                    ${isHovered ? `bg-gradient-to-br ${role.color} text-white translate-x-1 shadow-md` : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}
                  `}>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Info Modal */}
        <motion.div initial={false}>
          {selectedInfo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedInfo(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20"
              >
                <div className={`h-2 bg-gradient-to-r ${features.find(f => f.id === selectedInfo)?.color}`} />
                <div className="p-8 md:p-12">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight mb-2">
                        {roleDetails[selectedInfo].title}
                      </h2>
                      <div className="h-1 w-20 bg-indigo-500 rounded-full" />
                    </div>
                    <button
                      onClick={() => setSelectedInfo(null)}
                      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ChevronRight className="w-6 h-6 rotate-180" />
                    </button>
                  </div>

                  <p className="text-lg text-slate-600 dark:text-slate-400 mb-10 leading-relaxed font-medium">
                    {roleDetails[selectedInfo].fullDescription}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {roleDetails[selectedInfo].extraFeatures.map((feat, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50">
                        <CheckCircle2 className="w-5 h-5 text-indigo-500 mt-1 flex-shrink-0" />
                        <span className="text-sm font-semibold leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-12 flex gap-4">
                    <button
                      onClick={() => router.push('/signup')}
                      className="flex-1 py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
                    >
                      Empezar Ahora
                    </button>
                    <button
                      onClick={() => setSelectedInfo(null)}
                      className="px-8 py-4 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* PRICING SECTION */}
        <div className="mt-24 md:mt-32 w-full max-w-5xl mx-auto z-20">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold mb-4 tracking-tight"
            >
              Planes simples y transparentes
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-slate-600 dark:text-slate-400"
            >
              Diseñados para escalar junto al crecimiento de tu comunidad.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:px-12">
            {/* Basic Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-[2rem] p-8 flex flex-col hover:shadow-xl hover:border-indigo-500/30 transition-all"
            >
              <h3 className="text-2xl font-bold mb-2">Comunidad</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Para condominios pequeños que necesitan digitalizarse.</p>
              <div className="mb-8">
                <span className="text-5xl font-extrabold tracking-tight">$1.500</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium"> / unidad al mes</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {['App Móvil para Residentes', 'Gestión de Cobros Básica', 'Noticias y Avisos Push', 'Reservas de Áreas Comunes'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/signup')} className="w-full py-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition-colors">
                Prueba Gratis por 14 Días
              </button>
            </motion.div>

            {/* Pro Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[2rem] p-8 flex flex-col text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden transform md:-translate-y-4"
            >
              <div className="absolute top-0 right-0 bg-white/20 backdrop-blur-md px-6 py-2 rounded-bl-2xl font-semibold text-sm tracking-wide uppercase">Recomendado</div>
              <h3 className="text-2xl font-bold mb-2 mt-4 md:mt-0">Enterprise</h3>
              <p className="text-indigo-100 mb-6">La solución total para grandes edificios y conserjerías.</p>
              <div className="mb-8">
                <span className="text-5xl font-extrabold tracking-tight">$2.500</span>
                <span className="text-indigo-200 font-medium"> / unidad al mes</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {['App para Conserjería', 'Marketplace Comunitario', 'Control de Visitas', 'Analítica Avanzada y Multi-Rol'].map((feat, i) => (
                  <li key={i} className="flex items-center gap-3 text-white font-medium">
                    <CheckCircle2 className="w-5 h-5 text-indigo-200 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push('/signup')} className="w-full py-4 rounded-xl bg-white text-indigo-600 hover:bg-slate-50 font-bold transition-colors shadow-lg shadow-white/10">
                Contactar Ventas
              </button>
            </motion.div>
          </div>
        </div>

        {/* FAQ SECTION */}
        <div className="mt-24 md:mt-32 mb-10 w-full max-w-3xl mx-auto z-20">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold mb-4 tracking-tight"
            >
              Preguntas Frecuentes
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-slate-600 dark:text-slate-400"
            >
              Todo lo que necesitas saber antes de modernizar tu comunidad.
            </motion.p>
          </div>

          <div className="space-y-4">
            {[
              { q: "¿En qué países está disponible ComunidadConnect?", a: "Actualmente operamos en Chile, pero nuestra plataforma ha sido diseñada para ser 100% adaptable a cualquier país de Latinoamérica, soportando su respectiva moneda y formatos locales." },
              { q: "¿Es seguro el manejo del dinero y los pagos en la app?", a: "Absolutamente. ComunidadConnect no almacena ni procesa tarjetas de crédito directamente. Usamos pasarelas de pago oficiales y altamente reguladas (con certificación PCI Compliance) que aseguran máxima protección bancaria." },
              { q: "¿Qué pasa si un residente no tiene un smartphone?", a: "No hay problema. Si bien la aplicación móvil nativa brinda la mejor experiencia, los residentes también pueden acceder a ComunidadConnect desde la computadora o tablet, navegando simplemente por la web." },
              { q: "¿Cuánto tiempo toma instalar este sistema en el edificio?", a: "El proceso de configuración es muy veloz. Usualmente, una vez que nos envías la lista de departamentos y residentes (en Excel), nuestra plataforma deja todo funcionando en menos de 48 horas hábiles." }
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i }}
                className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl flex-shrink-0 mt-0.5">
                    <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{faq.q}</h4>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{faq.a}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-8 text-center text-sm text-slate-500 dark:text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 ComunidadConnect. Sistema de Gestión Inmobiliaria Nivel Empresarial.</p>
          <div className="flex items-center gap-6 font-medium">
            <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">Privacidad</Link>
            <Link href="/terms" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">Términos</Link>
            <a href="mailto:soporte@comunidadconnect.com" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">Soporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
