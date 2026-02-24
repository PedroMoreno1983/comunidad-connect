"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { useTheme } from 'next-themes';
import {
  Building2, User, ShieldCheck, KeyRound,
  Sun, Moon, Sparkles, Command, ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (user && !authLoading) {
      router.push('/home');
    }
  }, [user, authLoading, router]);

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');

  const handleLogin = async (role: string) => {
    setLoading(role);
    await login(role as 'admin' | 'resident' | 'concierge');
    router.push('/home');
  };

  const roles = [
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 overflow-hidden relative transition-colors duration-700">

      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Subtle Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        {/* Ambient Glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/20 dark:bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 dark:bg-purple-500/10 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
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
            className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1.1]"
          >
            Administración inteligente que <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">conecta personas</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
          >
            Una plataforma de nivel empresarial diseñada para hacer que la vida en comunidad sea más simple, transparente y segura. Selecciona una vista para comenzar la demostración interactiva.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full z-20">
          {roles.map((role, idx) => {
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
                onClick={() => handleLogin(role.id)}
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
                    {loading === role.id ? 'Iniciando sesión...' : 'Ingresar a la vista'}
                  </span>
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                    ${isHovered ? `bg-gradient-to-br ${role.color} text-white translate-x-1 shadow-md` : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}
                  `}>
                    {loading === role.id ? (
                      <Command className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      <footer className="relative z-10 py-8 text-center text-sm text-slate-500 dark:text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 ComunidadConnect. Sistema de Gestión Inmobiliaria Nivel Empresarial.</p>
          <div className="flex items-center gap-6 font-medium">
            <span className="hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer transition-colors">Privacidad</span>
            <span className="hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer transition-colors">Términos</span>
            <span className="hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer transition-colors">Soporte</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
