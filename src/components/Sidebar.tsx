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

    const menuSections = [
        {
            title: 'COMUNIDAD',
            links: [
                { href: '/home', label: 'Inicio', icon: Home, roles: ['admin', 'resident', 'concierge'] },
                { href: '/comunicaciones', label: 'Comunicaciones', icon: MessageSquare, roles: ['admin', 'resident', 'concierge'] },
                { href: '/directorio', label: 'Directorio', icon: Users, roles: ['resident', 'admin'] },
            ]
        },
        {
            title: 'MIS SERVICIOS',
            links: [
                { href: '/amenities', label: 'Espacios Comunes', icon: Calendar, roles: ['resident', 'admin'], feature: 'amenities' },
                { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag, roles: ['resident', 'admin'] },
                { href: '/services', label: 'Directorio Servicios', icon: Wrench, roles: ['resident', 'admin'], feature: 'maintenance' },
                { href: '/services/my-requests', label: 'Mis Solicitudes', icon: ClipboardList, roles: ['resident', 'admin'], feature: 'maintenance' },
                { href: '/resident/invitations', label: 'Mis Invitaciones', icon: QrCode, roles: ['resident', 'admin'] },
                { href: '/votaciones', label: 'Votaciones', icon: Vote, roles: ['resident', 'admin'], feature: 'voting' },
            ]
        },
        {
            title: 'FINANZAS PERSONALES',
            links: [
                { href: '/resident/finances', label: 'Mis Gastos', icon: DollarSign, roles: ['resident', 'admin'] },
                { href: '/resident/consumo', label: 'Mi Consumo de Agua', icon: Waves, roles: ['resident', 'admin'] },
            ]
        },
        {
            title: 'AULA & INTELIGENCIA IA',
            links: [
                { href: '/resident/training', label: 'Aula Virtual IA', icon: GraduationCap, roles: ['resident', 'concierge', 'admin'], feature: 'coco_ai' },
                { href: '/admin/training', label: 'Generador de Cursos', icon: BookOpen, roles: ['admin'], feature: 'coco_ai' },
            ]
        },
        {
            title: 'CONFIGURACIÓN IA',
            links: [
                { href: '/admin/onboarding', label: 'Configurar Agentes IA', icon: Sparkles, roles: ['admin'], feature: 'coco_ai' },
            ]
        },
        {
            title: 'CONSERJERÍA',
            links: [
                { href: '/concierge/visitors', label: 'Visitas', icon: Shield, roles: ['concierge', 'admin'] },
                { href: '/concierge/packages', label: 'Paquetería', icon: Package, roles: ['concierge', 'admin', 'resident'] },
            ]
        },
        {
            title: 'ADMINISTRACIÓN',
            links: [
                { href: '/admin/finanzas', label: 'Control Finanzas', icon: PieChart, roles: ['admin'] },
                { href: '/admin/units', label: 'Unidades', icon: Home, roles: ['admin'] },
                { href: '/admin/consumo', label: 'Control Hídrico', icon: Waves, roles: ['admin'] },
                { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench, roles: ['admin'], feature: 'maintenance' },
                { href: '/admin/votaciones', label: 'Gestión Votos', icon: BarChart3, roles: ['admin'], feature: 'voting' },
                { href: '/admin/users', label: 'Usuarios', icon: Users, roles: ['admin'] },
            ]
        },
        {
            title: 'AJUSTES',
            links: [
                { href: '/profile', label: 'Mi Perfil', icon: UserCircle, roles: ['admin', 'resident', 'concierge'] },
            ]
        }
    ];

    if (user.email === 'pedromoreno1983@gmail.com' || user.email.includes('comunidadconnect')) {
        menuSections.push({
            title: 'SaaS SUPERADMIN',
            links: [
                { href: '/superadmin', label: 'Panel SaaS', icon: Shield, roles: ['admin'] }
            ]
        });
    }

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
            <div className="flex h-20 shrink-0 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
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
            <div className="p-4 shrink-0">
                <div className="p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-white dark:border-white/10 shadow-sm backdrop-blur-md">
                    <div className="flex items-center">
                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${getRoleGradient()} flex items-center justify-center text-white font-bold text-lg shadow-lg shrink-0`}>
                            {user.name.charAt(0)}
                        </div>
                        <div className="ml-3 overflow-hidden flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {user.name.includes('@')
                                    ? (user.name.split('@')[0].split('.')[0].charAt(0).toUpperCase() + user.name.split('@')[0].split('.')[0].slice(1))
                                    : user.name}
                            </p>
                            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getRoleBg()}`}>
                                <Sparkles className="h-3 w-3" />
                                {user.role === 'admin' ? 'Admin' : user.role === 'resident' ? 'Residente' : 'Conserjería'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 pb-6 space-y-6 custom-scrollbar">
                {menuSections.map((section, sIdx) => {
                    const validLinks = section.links.filter(link => {
                        // 1. Check basic user role matching
                        if (!link.roles.includes(user.role)) return false;
                        
                        // 2. Check Plan Features using feature flag if defined
                        if (link.feature && user.features) {
                            if (user.features[link.feature] === false) return false;
                        }
                        return true;
                    });
                    
                    if (validLinks.length === 0) return null;

                    return (
                        <div key={sIdx} className="space-y-1">
                            <h3 className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                                {section.title}
                            </h3>
                            {validLinks.map((link, lIdx) => {
                                const Icon = link.icon;
                                // Simple active check
                                const isActive = pathname === link.href || (link.href !== '/home' && pathname.startsWith(link.href + '/'));

                                return (
                                    <motion.div
                                        key={link.href}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: (sIdx * 0.1) + (lIdx * 0.05), duration: 0.3 }}
                                        whileHover={{ scale: 1.02, x: 4 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <Link
                                            href={link.href}
                                            onClick={() => setIsMobileOpen(false)}
                                            className={clsx(
                                                "relative group overflow-hidden flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300",
                                                isActive
                                                    ? `bg-gradient-to-r ${getRoleGradient()} text-white shadow-md ring-1 ring-white/20`
                                                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                                            )}
                                        >
                                            <Icon className={clsx(
                                                "relative z-10 mr-3 h-5 w-5 transition-transform group-hover:scale-110",
                                                isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-500"
                                            )} />
                                            <span className="flex-1">{link.label}</span>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </div>
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
