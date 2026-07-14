"use client";

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { isPlatformCreatorEmail } from '@/lib/platformAccess';
import { clsx } from 'clsx';
import { ThemeToggleCompact } from '@/components/ThemeToggle';
import { NotificationCenter } from '@/components/NotificationCenter';
import { BrandWordmark } from '@/components/BrandWordmark';
import { useState, useEffect } from 'react';
import { useProductCapabilities } from '@/hooks/useProductCapabilities';
import type { ProductCapabilityKey } from '@/lib/types';
import {
    Activity,
    Handshake,
    Home,
    ShoppingBag,
    Wrench,
    Users,
    LogOut,
    Package,
    ClipboardList,
    Calendar,
    DollarSign,
    Menu,
    X,
    PieChart,
    QrCode,
    Shield,
    Vote,
    BarChart3,
    MessageSquare,
    Waves,
    UserCircle,
    GraduationCap,
    BookOpen,
    Upload,
    Bot,
    Clapperboard,
    Briefcase,
    HeartHandshake,
    MessageCircle,
    Sparkles
} from 'lucide-react';

// Mobile menu button component for external use
export function MobileMenuButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
    return (
        <button
            onClick={onClick}
            className="fixed left-3 top-2 z-50 rounded-lg border border-subtle bg-surface p-2.5 shadow-sm cc-text-primary lg:hidden"
        >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
    );
}

// Sidebar with mobile support
export function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [hasSuperAdminAccess, setHasSuperAdminAccess] = useState(false);
    const capabilities = useProductCapabilities();

    // Close mobile menu on route change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

    useEffect(() => {
        if (user?.role !== 'admin' || !user.email) return;
        let cancelled = false;
        fetch('/api/superadmin/access', { cache: 'no-store' })
            .then(response => response.ok)
            .then(allowed => {
                if (!cancelled) setHasSuperAdminAccess(allowed);
            })
            .catch(() => {
                if (!cancelled) setHasSuperAdminAccess(false);
            });
        return () => {
            cancelled = true;
        };
    }, [user?.email, user?.role]);

    const isPlatformCreator = isPlatformCreatorEmail(user?.email);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (!user) return null;

    const menuSections = [
        {
            title: 'INTELIGENCIA OPERATIVA',
            links: [
                { href: '/agent-center', label: 'Agent Center', icon: Sparkles, roles: ['admin'], premium: true },
                { href: '/marketing/reels', label: 'Reels Agent', icon: Clapperboard, roles: ['admin'], premium: true, creatorOnly: true, capability: 'marketingReels' as ProductCapabilityKey },
            ]
        },
        {
            title: 'COMUNIDAD',
            links: [
                { href: '/home', label: 'Inicio', icon: Home, roles: ['admin', 'resident', 'concierge'] },
                { href: '/comunicaciones', label: 'Comunicaciones', icon: MessageSquare, roles: ['admin', 'resident', 'concierge'] },
                { href: '/convivencia', label: 'Convivencia', icon: HeartHandshake, roles: ['resident', 'admin', 'concierge'] },
                { href: '/directorio', label: 'Directorio', icon: Users, roles: ['resident', 'admin'] },
            ]
        },
        {
            title: 'AULA & INTELIGENCIA IA',
            links: [
                { href: '/resident/training', label: 'Aula Virtual IA', icon: GraduationCap, roles: ['concierge', 'admin'] },
                { href: '/admin/training', label: 'Generador de Cursos', icon: BookOpen, roles: ['admin'] },
            ]
        },
        {
            title: 'MIS SERVICIOS',
            links: [
                { href: '/amenities', label: 'Espacios Comunes', icon: Calendar, roles: ['resident', 'admin'], feature: 'amenities' },
                { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag, roles: ['resident', 'admin'] },
                { href: '/marketplace/my-listings', label: 'Mis Publicaciones', icon: ShoppingBag, roles: ['resident', 'admin'] },
                { href: '/services', label: 'Directorio Servicios', icon: Wrench, roles: ['resident', 'admin'], feature: 'maintenance' },
                { href: '/services/my-requests', label: 'Mis Solicitudes', icon: ClipboardList, roles: ['resident', 'admin'], feature: 'maintenance' },
                { href: '/services/provider-dashboard', label: 'Panel Proveedor', icon: Briefcase, roles: ['resident', 'admin'], feature: 'maintenance' },
                { href: '/resident/cases', label: 'Mis Casos CoCo', icon: Bot, roles: ['resident', 'admin'], feature: 'coco_ai' },
                { href: '/resident/invitations', label: 'Mis Invitaciones', icon: QrCode, roles: ['resident', 'admin'] },
                { href: '/resident/packages', label: 'Mis Encomiendas', icon: Package, roles: ['resident'] },
                { href: '/votaciones', label: 'Votaciones', icon: Vote, roles: ['resident', 'admin'], feature: 'voting' },
            ]
        },
        {
            title: 'FINANZAS PERSONALES',
            links: [
                { href: '/resident/finances', label: 'Mis Gastos', icon: DollarSign, roles: ['resident', 'admin'] },
                { href: '/resident/consumo', label: 'Mi Consumo de Agua', icon: Waves, roles: ['resident', 'admin'] },
                { href: '/expenses/solidaridad', label: 'Solidaridad Vecinal', icon: Shield, roles: ['resident', 'admin'] },
            ]
        },
        {
            title: 'CONSERJERÍA',
            links: [
                { href: '/concierge/visitors', label: 'Visitas', icon: Shield, roles: ['concierge', 'admin'] },
                { href: '/concierge/packages', label: 'Paquetería', icon: Package, roles: ['concierge', 'admin'] },
            ]
        },
        {
            title: 'ADMINISTRACIÓN',
            links: [
                { href: '/admin/finanzas', label: 'Control Finanzas', icon: PieChart, roles: ['admin'] },
                { href: '/admin/units', label: 'Unidades', icon: Home, roles: ['admin'] },
                { href: '/admin/consumo', label: 'Control Hídrico', icon: Waves, roles: ['admin'] },
                { href: '/admin/marketplace', label: 'Marketplace Admin', icon: ShoppingBag, roles: ['admin'] },
                { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench, roles: ['admin'], feature: 'maintenance' },
                { href: '/admin/votaciones', label: 'Gestión Votos', icon: BarChart3, roles: ['admin'], feature: 'voting' },
                { href: '/admin/operations', label: 'Centro Operativo', icon: Activity, roles: ['admin'] },
                { href: '/admin/whatsapp', label: 'WhatsApp CoCo', icon: MessageCircle, roles: ['admin'], feature: 'coco_ai' },
                { href: '/admin/users', label: 'Usuarios', icon: Users, roles: ['admin'] },
                { href: '/admin/onboarding', label: 'Carga Masiva de Datos', icon: Upload, roles: ['admin'], feature: 'coco_ai' },
            ]
        },
        {
            title: 'AJUSTES',
            links: [
                { href: '/profile', label: 'Mi Perfil', icon: UserCircle, roles: ['admin', 'resident', 'concierge'] },
            ]
        }
    ];

    if (hasSuperAdminAccess) {
        menuSections.push({
            title: 'SaaS SUPERADMIN',
            links: [
                { href: '/superadmin', label: 'Panel SaaS', icon: Shield, roles: ['admin'] }
            ]
        });
    }

    const getAvatarStyle = (): CSSProperties => {
        switch (user.role) {
            case 'admin':    return { backgroundColor: 'var(--cc-brand-500)' };
            case 'resident': return { backgroundColor: 'var(--cc-role-residente-500)' };
            case 'concierge':return { backgroundColor: 'var(--cc-role-conserje-500)' };
            default:         return { backgroundColor: 'var(--cc-brand-500)' };
        }
    };

    const avatarSrc = user.photo || user.avatarUrl;
    const displayName = user.name.includes('@')
        ? (user.name.split('@')[0].split('.')[0].charAt(0).toUpperCase() + user.name.split('@')[0].split('.')[0].slice(1))
        : user.name;

    const getRoleBadgeClass = () => {
        switch (user.role) {
            case 'admin':    return 'bg-role-admin-bg text-role-admin-fg border border-role-admin-border';
            case 'resident': return 'bg-role-residente-bg text-role-residente-fg border border-role-residente-border';
            case 'concierge':return 'bg-role-conserje-bg text-role-conserje-fg border border-role-conserje-border';
            default:         return 'bg-role-admin-bg text-role-admin-fg border border-role-admin-border';
        }
    };

    const canShowLink = (link: { href: string; roles: string[]; feature?: string; premium?: boolean; creatorOnly?: boolean; capability?: ProductCapabilityKey }) => {
        if (!link.roles.includes(user.role)) return false;
        if (link.creatorOnly && !isPlatformCreator) return false;
        if (link.href === '/showcase') return false;
        if (link.capability && !capabilities[link.capability]) return false;

        if (link.feature && user.features) {
            if (user.features[link.feature] === false) return false;
        }

        return true;
    };

    const visibleLinks = menuSections.flatMap(section => section.links.filter(canShowLink));
    const activeHref = visibleLinks
        .filter(link => pathname === link.href || (link.href !== '/home' && pathname.startsWith(`${link.href}/`)))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href;

    const sidebarContent = (
        <>
            {/* Header / Logo */}
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-subtle px-3">
                <div className="flex min-w-0 items-center">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={getAvatarStyle()}>
                        <Handshake className="h-5 w-5 text-white" />
                    </div>
                    <div className="ml-3 min-w-0 overflow-hidden">
                        <BrandWordmark className="max-w-[180px] text-xs text-brand-600" />
                    </div>
                </div>
                <div className="shrink-0">
                    <NotificationCenter />
                </div>
            </div>

            {/* User Profile Card */}
            <div className="shrink-0 p-3">
                <div className="rounded-lg border border-subtle bg-surface p-3">
                    <div className="flex items-center">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white" style={avatarSrc ? undefined : getAvatarStyle()}>
                            {avatarSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element -- Legacy avatars may be local data URLs.
                                <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                            ) : (
                                displayName.charAt(0)
                            )}
                        </div>
                        <div className="ml-3 overflow-hidden flex-1">
                            <p className="text-sm font-semibold cc-text-primary truncate">
                                {displayName}
                            </p>
                            <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeClass()}`}>
                                {user.role === 'admin' ? 'Admin' : user.role === 'resident' ? 'Residente' : 'Conserjería'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-2 pb-6">
                {menuSections.map((section, sIdx) => {
                    const validLinks = section.links.filter(canShowLink);
                    
                    if (validLinks.length === 0) return null;

                    return (
                        <div key={sIdx} className="space-y-1">
                            <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-tertiary">
                                {section.title}
                            </h3>
                            {validLinks.map((link) => {
                                const Icon = link.icon;
                                const isActive = link.href === activeHref;
                                const isPremium = "premium" in link && link.premium;

                                return (
                                    <div
                                        key={link.href}
                                    >
                                        <Link
                                            href={link.href}
                                            onClick={() => setIsMobileOpen(false)}
                                            data-sidebar-link={link.href}
                                            data-active={isActive ? "true" : "false"}
                                            className={clsx(
                                                "group relative flex items-center rounded-md border px-3 py-2 text-sm transition-colors duration-150",
                                                isPremium && isActive
                                                    ? "border-brand-200 bg-[var(--cc-ink)] font-semibold text-white"
                                                    : isPremium
                                                        ? "border-brand-100 bg-brand-50 font-semibold text-brand-700 hover:border-brand-200"
                                                        : isActive
                                                    ? "border-brand-200 bg-brand-50 font-semibold text-brand-700"
                                                    : "border-transparent cc-text-secondary hover:border-subtle hover:bg-elevated"
                                            )}
                                        >
                                            <Icon className={clsx(
                                                "relative z-10 mr-3 h-4 w-4",
                                                isPremium && isActive ? "text-white" : isActive ? "text-brand-600" : isPremium ? "text-brand-600" : "cc-text-tertiary group-hover:text-brand-500"
                                            )} />
                                            <span className="flex-1">{link.label}</span>
                                            {isPremium && (
                                                <span className={clsx("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", isActive ? "bg-white/15 text-white" : "bg-white text-brand-700")}>
                                                    IA
                                                </span>
                                            )}
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer / Logout */}
            <div className="space-y-3 border-t border-subtle p-3">
                <div className="flex items-center justify-between rounded-lg border border-subtle bg-canvas px-3 py-2">
                    <span className="text-xs font-semibold cc-text-secondary">Apariencia</span>
                    <ThemeToggleCompact />
                </div>
                <button
                    onClick={handleLogout}
                    className="group flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium cc-text-secondary transition-colors hover:bg-danger-bg hover:text-danger-fg"
                >
                    <LogOut className="mr-3 h-4 w-4 cc-text-tertiary transition-colors group-hover:text-danger-fg" />
                    Cerrar Sesión
                </button>
                <p className="mt-3 text-center text-xs cc-text-tertiary">
                    v2.0 Pro • Convive Connect
                </p>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                aria-label={isMobileOpen ? "Cerrar menu de navegacion" : "Abrir menu de navegacion"}
                aria-expanded={isMobileOpen}
                aria-controls="mobile-sidebar"
                className={clsx(
                    "fixed left-3 top-4 z-50 rounded-lg border border-subtle bg-surface p-2.5 shadow-sm cc-text-primary lg:hidden"
                )}
            >
                {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            {isMobileOpen && (
                <div
                    id="mobile-sidebar"
                    className="fixed inset-y-0 left-0 z-40 flex h-dvh w-[min(20rem,86vw)] flex-col border-r border-subtle bg-surface shadow-xl lg:hidden"
                >
                    {sidebarContent}
                </div>
            )}

            {/* Desktop Sidebar */}
            <div
                className="sticky z-10 hidden w-72 flex-col border-r border-subtle bg-surface lg:flex"
                style={{
                    top: "0px",
                    height: "100vh",
                }}
            >
                {sidebarContent}
            </div>
        </>
    );
}
