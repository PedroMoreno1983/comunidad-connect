"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { clsx } from 'clsx';
import { ThemeToggleCompact } from '@/components/ThemeToggle';
import { NotificationCenter } from '@/components/NotificationCenter';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
    Building2,
    Home,
    ShoppingBag,
    Wrench,
    Users,
    LogOut,
    Package,
    ClipboardList,
    Calendar,
    Bell,
    DollarSign,
    ChevronRight,
    Sparkles,
    Menu,
    X,
    PieChart,
    QrCode,
    Shield,
    Vote,
    BarChart3,
    MessageSquare,
    Filter,
    Waves,
    Hash,
    UserCircle,
    GraduationCap,
    BookOpen
} from 'lucide-react';

// Mobile menu button component for external use
export function MobileMenuButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
    return (
        <button
            onClick={onClick}
            className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
        >
            <AnimatePresence mode="wait">
                {isOpen ? (
                    <motion.div
                        key="close"
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: 90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <X className="h-5 w-5" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="menu"
                        initial={{ rotate: 90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: -90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Menu className="h-5 w-5" />
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
}

// Sidebar with mobile support
export function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileOpen(false);
    }, [pathname]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsMobileOpen(false);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (!user) return null;

    const links = [
        { href: '/home', label: 'Inicio', icon: Home, roles: ['admin', 'resident', 'concierge'] },
        { href: '/chat', label: 'Comunidad', icon: MessageSquare, roles: ['resident', 'admin'] },
        { href: '/directorio', label: 'Directorio', icon: Users, roles: ['resident', 'admin'] },
        { href: '/social', label: 'Muro Social', icon: Hash, roles: ['resident', 'admin'] },
        { href: '/feed', label: 'Avisos Oficiales', icon: Bell, roles: ['admin', 'resident', 'concierge'] },
        { href: '/amenities', label: 'Espacios Comunes', icon: Calendar, roles: ['resident', 'admin'] },
        { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag, roles: ['resident', 'admin'] },
        { href: '/services', label: 'Servicios', icon: Wrench, roles: ['resident', 'admin'] },
        { href: '/services/my-requests', label: 'Mis Solicitudes', icon: ClipboardList, roles: ['resident', 'admin'] },
        { href: '/resident/finances', label: 'Mis Gastos', icon: DollarSign, roles: ['resident', 'admin'] },
        { href: '/resident/consumo', label: 'Consumo Agua', icon: Waves, roles: ['resident', 'admin'] },
        { href: '/resident/supermercado', label: 'Supermercado', icon: ShoppingBag, roles: ['resident'] },
        { href: '/votaciones', label: 'Votaciones', icon: Vote, roles: ['resident', 'admin'] },
        { href: '/resident/invitations', label: 'Invitaciones', icon: QrCode, roles: ['resident', 'admin'] },
        { href: '/admin/votaciones', label: 'Gestión Votos', icon: BarChart3, roles: ['admin'] },
        { href: '/admin/units', label: 'Unidades', icon: Home, roles: ['admin'] },
        { href: '/admin/consumo', label: 'Control Hídrico', icon: Waves, roles: ['admin'] },
        { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench, roles: ['admin'] },
        { href: '/admin/finanzas', label: 'Finanzas Comunitarias', icon: PieChart, roles: ['admin'] },
        { href: '/admin/users', label: 'Usuarios', icon: Users, roles: ['admin'] },
        { href: '/concierge/visitors', label: 'Visitas', icon: Shield, roles: ['concierge', 'admin'] },
        { href: '/concierge/packages', label: 'Paquetería', icon: Package, roles: ['concierge', 'admin', 'resident'] },
        { href: '/resident/training', label: 'Aula Multi-Agente', icon: GraduationCap, roles: ['resident', 'concierge'] },
        { href: '/admin/training', label: 'Creador Cursos IA', icon: BookOpen, roles: ['admin'] },
        { href: '/resident/training', label: 'Vista Alumno (Aula)', icon: Users, roles: ['admin'] },
        { href: '/training', label: 'Cursos (Antiguo)', icon: GraduationCap, roles: ['admin', 'concierge'] },
        { href: '/profile', label: 'Mi Perfil', icon: UserCircle, roles: ['admin', 'resident', 'concierge'] },
    ];

    const getRoleGradient = () => {
        switch (user.role) {
            case 'admin': return 'from-indigo-500 to-purple-600';
            case 'resident': return 'from-emerald-500 to-teal-600';
            case 'concierge': return 'from-amber-500 to-orange-600';
            default: return 'from-indigo-500 to-purple-600';
        }
    };

    const getRoleBg = () => {
        switch (user.role) {
            case 'admin': return 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300';
            case 'resident': return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
            case 'concierge': return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
            default: return 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300';
        }
    };



    const sidebarContent = (
        <>
            {/* Header / Logo */}
            <div className="flex h-20 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getRoleGradient()} shadow-lg shadow-indigo-500/30`}>
                        <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="ml-3">
                        <span className="text-lg font-bold text-slate-900 dark:text-white">Comunidad</span>
                        <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Connect</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <NotificationCenter />
                    <ThemeToggleCompact />
                </div>
            </div>

            {/* User Profile Card */}
            <div className="p-4">
                <div className="p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-white dark:border-white/10 shadow-sm backdrop-blur-md">
                    <div className="flex items-center">
                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${getRoleGradient()} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                            {user.name.charAt(0)}
                        </div>
                        <div className="ml-3 overflow-hidden flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {user.name.includes('@')
                                    ? (user.name.split('@')[0].split('.')[0].charAt(0).toUpperCase() + user.name.split('@')[0].split('.')[0].slice(1))
                                    : user.name}
                            </p>
                            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBg()}`}>
                                <Sparkles className="h-3 w-3" />
                                {user.role === 'admin' ? 'Administrador' : user.role === 'resident' ? 'Residente' : 'Conserjería'}
                            </span>
                        </div>
                    </div>
                    {user.unitName && (
                        <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Unidad</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user.unitName}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {links.map((link, idx) => {
                    if (!link.roles.includes(user.role)) return null;

                    const Icon = link.icon;
                    const isActive = pathname.startsWith(link.href) &&
                        !links.filter(l => l.roles.includes(user.role) && l.href.length > link.href.length)
                            .some(l => pathname.startsWith(l.href));

                    return (
                        <motion.div
                            key={link.href}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05, duration: 0.3 }}
                            whileHover={{ scale: 1.03, x: 5 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <Link
                                href={link.href}
                                onClick={() => setIsMobileOpen(false)}
                                className={clsx(
                                    "relative group overflow-hidden flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300",
                                    isActive
                                        ? `bg-gradient-to-r ${getRoleGradient()} text-white shadow-[0_8px_30px_-4px_rgba(99,102,241,0.4)] dark:shadow-[0_8px_30px_-4px_rgba(99,102,241,0.2)] ring-1 ring-white/20`
                                        : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white backdrop-blur-sm shadow-sm"
                                )}
                            >
                                {/* Active Link Shimmer Overlay */}
                                {isActive && (
                                    <motion.div
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                                        initial={{ x: "-150%" }}
                                        animate={{ x: "150%" }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                )}
                                <Icon className={clsx(
                                    "relative z-10 mr-3 h-5 w-5 transition-transform group-hover:scale-110",
                                    isActive ? "text-white drop-shadow-md" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400"
                                )} />
                                <span className="flex-1">{link.label}</span>

                                <ChevronRight className={clsx(
                                    "h-4 w-4 transition-all duration-200",
                                    isActive ? "opacity-100 text-white/70" : "opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500"
                                )} />
                            </Link>
                        </motion.div>
                    );
                })}
            </nav>

            {/* Footer / Logout */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">


                <button
                    onClick={handleLogout}
                    className="w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
                >
                    <LogOut className="mr-3 h-5 w-5 text-slate-400 dark:text-slate-500 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" />
                    Cerrar Sesión
                </button>
                <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-600">
                    v2.0 Pro • ComunidadConnect
                </p>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
                <AnimatePresence mode="wait">
                    {isMobileOpen ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <X className="h-5 w-5" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="menu"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Menu className="h-5 w-5" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            {/* Mobile Overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsMobileOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Mobile Sidebar */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ x: -288 }}
                        animate={{ x: 0 }}
                        exit={{ x: -288 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="lg:hidden fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col bg-slate-50/90 dark:bg-[#0B0F19]/90 backdrop-blur-2xl border-r border-slate-200/50 dark:border-white/5 shadow-[20px_0_40px_-15px_rgba(0,0,0,0.3)]"
                    >
                        {sidebarContent}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Desktop Sidebar */}
            <div className="hidden lg:flex h-screen w-72 flex-col bg-slate-50/80 dark:bg-[#0B0F19]/80 backdrop-blur-2xl border-r border-slate-200/50 dark:border-white/5 z-10 relative shadow-[10px_0_30px_-15px_rgba(0,0,0,0.1)] dark:shadow-[10px_0_30px_-15px_rgba(0,0,0,0.5)]">
                {sidebarContent}
            </div>
        </>
    );
}
