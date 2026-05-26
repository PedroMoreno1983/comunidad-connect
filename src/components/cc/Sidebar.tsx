/* src/components/cc/Sidebar.tsx ─────────────────────────────── */
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useDemoRestrictions } from "@/hooks/useDemoRestrictions";
import { isShowcaseUser } from "@/lib/showcase";
import { clsx } from "clsx";
import {
  Activity,
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
  Briefcase,
  Compass
} from "lucide-react";
import { Brand } from "./Brand";

type Role = "admin" | "conserje" | "resident";

const ACCENT: Record<Role, string> = {
  admin:    "var(--cc-copper)",
  conserje: "var(--cc-amber)",
  resident: "var(--cc-sage)",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  concierge: "Conserjería",
  resident: "Residente",
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] border-[rgba(181,102,78,0.15)]",
  concierge: "bg-[var(--cc-amber-tint)] text-[var(--cc-amber)] border-[rgba(201,154,74,0.15)]",
  resident: "bg-[var(--cc-sage-tint)] text-[var(--cc-sage)] border-[rgba(110,130,104,0.15)]",
};

type SidebarProps = {
  role?: Role;
  activeHref?: string;
  user?: { name: string; initials: string; roleLabel: string };
};

export function Sidebar({ role: propRole, activeHref: propActiveHref, user: propUser }: SidebarProps) {
  const pathname = usePathname();
  const { user: authUser, logout } = useAuth();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isDemoUser } = useDemoRestrictions();

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileOpen(false);
  }, [pathname]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleLogout = () => {
    if (logout) logout();
    router.push("/");
  };

  const activeUser = authUser || {
    role: propRole === "conserje" ? "concierge" : propRole || "admin",
    name: propUser?.name || "Usuario",
    email: "",
    photo: null,
    avatarUrl: null
  };

  const role: Role = (activeUser.role === "concierge" ? "conserje" : activeUser.role === "resident" ? "resident" : "admin") as Role;
  const accent = ACCENT[role];
  const activeHref = propActiveHref || pathname;

  const menuSections = [
    {
      title: "COMUNIDAD",
      links: [
        { href: "/home", label: "Inicio", icon: Home, roles: ["admin", "resident", "concierge"] },
        { href: "/comunicaciones", label: "Comunicaciones", icon: MessageSquare, roles: ["admin", "resident", "concierge"] },
        { href: "/directorio", label: "Directorio", icon: Users, roles: ["resident", "admin"] },
      ]
    },
    {
      title: "AULA & INTELIGENCIA IA",
      links: [
        { href: "/resident/training", label: "Aula Virtual IA", icon: GraduationCap, roles: ["resident", "concierge", "admin"] },
        { href: "/admin/training", label: "Generador de Cursos", icon: BookOpen, roles: ["admin"] },
      ]
    },
    {
      title: "MIS SERVICIOS",
      links: [
        { href: "/amenities", label: "Espacios Comunes", icon: Calendar, roles: ["resident", "admin"], feature: "amenities" },
        { href: "/marketplace", label: "Marketplace", icon: ShoppingBag, roles: ["resident", "admin"] },
        { href: "/marketplace/my-listings", label: "Mis Publicaciones", icon: ShoppingBag, roles: ["resident", "admin"] },
        { href: "/services", label: "Directorio Servicios", icon: Wrench, roles: ["resident", "admin"], feature: "maintenance" },
        { href: "/services/my-requests", label: "Mis Solicitudes", icon: ClipboardList, roles: ["resident", "admin"], feature: "maintenance" },
        { href: "/services/provider-dashboard", label: "Panel Proveedor", icon: Briefcase, roles: ["resident", "admin"], feature: "maintenance" },
        { href: "/resident/cases", label: "Mis Casos CoCo", icon: Bot, roles: ["resident", "admin"], feature: "coco_ai" },
        { href: "/resident/invitations", label: "Mis Invitaciones", icon: QrCode, roles: ["resident", "admin"] },
        { href: "/votaciones", label: "Votaciones", icon: Vote, roles: ["resident", "admin"], feature: "voting" },
      ]
    },
    {
      title: "FINANZAS PERSONALES",
      links: [
        { href: "/resident/finances", label: "Mis Gastos", icon: DollarSign, roles: ["resident", "admin"] },
        { href: "/resident/consumo", label: "Mi Consumo de Agua", icon: Waves, roles: ["resident", "admin"] },
        { href: "/expenses/solidaridad", label: "Solidaridad Vecinal", icon: Shield, roles: ["resident", "admin"] },
      ]
    },
    {
      title: "CONSERJERÍA",
      links: [
        { href: "/concierge/visitors", label: "Visitas", icon: Shield, roles: ["concierge", "admin"] },
        { href: "/concierge/packages", label: "Paquetería", icon: Package, roles: ["concierge", "admin", "resident"] },
      ]
    },
    {
      title: "ADMINISTRACIÓN",
      links: [
        { href: "/admin/finanzas", label: "Control Finanzas", icon: PieChart, roles: ["admin"] },
        { href: "/admin/units", label: "Unidades", icon: Home, roles: ["admin"] },
        { href: "/admin/consumo", label: "Control Hídrico", icon: Waves, roles: ["admin"] },
        { href: "/admin/marketplace", label: "Marketplace Admin", icon: ShoppingBag, roles: ["admin"] },
        { href: "/admin/mantenimiento", label: "Mantenimiento", icon: Wrench, roles: ["admin"], feature: "maintenance" },
        { href: "/admin/votaciones", label: "Gestión Votos", icon: BarChart3, roles: ["admin"], feature: "voting" },
        { href: "/admin/operations", label: "Centro Operativo", icon: Activity, roles: ["admin"] },
        { href: "/admin/users", label: "Usuarios", icon: Users, roles: ["admin"] },
        { href: "/admin/onboarding", label: "Carga Masiva de Datos", icon: Upload, roles: ["admin"], feature: "coco_ai" },
      ]
    },
    {
      title: "AJUSTES",
      links: [
        { href: "/profile", label: "Mi Perfil", icon: UserCircle, roles: ["admin", "resident", "concierge"] },
      ]
    }
  ];

  if (activeUser.email === "pedromoreno1983@gmail.com" || activeUser.email?.includes("convive")) {
    menuSections.push({
      title: "SaaS SUPERADMIN",
      links: [
        { href: "/superadmin", label: "Panel SaaS", icon: Shield, roles: ["admin"] }
      ]
    });
  }

  if (isShowcaseUser(activeUser)) {
    menuSections.unshift({
      title: "RECORRIDO COMERCIAL",
      links: [
        { href: "/showcase", label: "Como venderlo", icon: Compass, roles: ["admin", "resident", "concierge"] }
      ]
    });
  }

  const canShowLink = (link: { roles: string[]; feature?: string }) => {
    if (!link.roles.includes(activeUser.role || "resident")) return false;
    if (link.feature && (activeUser as any).features) {
      if ((activeUser as any).features[link.feature] === false) return false;
    }
    return true;
  };

  const avatarSrc = activeUser.photo || (activeUser as any).avatarUrl;
  const displayName = activeUser.name
    ? (activeUser.name.includes("@")
        ? (activeUser.name.split("@")[0].split(".")[0].charAt(0).toUpperCase() + activeUser.name.split("@")[0].split(".")[0].slice(1))
        : activeUser.name)
    : "Usuario";

  const initials = propUser?.initials || (activeUser.name
    ? activeUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "U");

  const roleLabel = propUser?.roleLabel || ROLE_LABELS[activeUser.role || "resident"] || "Miembro";
  const roleBadgeClass = ROLE_BADGE_CLASSES[activeUser.role || "resident"] || ROLE_BADGE_CLASSES.resident;

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: "24px 18px" }}>
      {/* Brand Header */}
      <div className="mb-9 px-1">
        <Brand size={17} withMark />
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 space-y-6">
        {menuSections.map((section, sIdx) => {
          const validLinks = section.links.filter(canShowLink);
          if (validLinks.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              <div className="cc-eyebrow mb-2" style={{ padding: "0 8px" }}>
                {section.title}
              </div>
              {validLinks.map((n) => {
                const Active = n.href === activeHref || (n.href !== "/home" && activeHref.startsWith(`${n.href}/`));
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="flex items-center gap-2.5 text-[13px] mb-0.5"
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      background: Active ? "var(--cc-paper)" : "transparent",
                      border: `1px solid ${Active ? "var(--cc-line)" : "transparent"}`,
                      color: Active ? "var(--cc-ink)" : "var(--cc-ink-muted)",
                      fontWeight: Active ? 500 : 400,
                    }}
                  >
                    <Icon size={15} color={Active ? accent : "var(--cc-ink-muted)"} strokeWidth={Active ? 1.8 : 1.5} />
                    <span className="flex-1 truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User Info / Profile Card at bottom */}
      <div
        className="mt-8 flex items-center gap-2.5 rounded-xl border bg-paper"
        style={{ padding: 12, borderColor: "var(--cc-line)" }}
      >
        <div
          className="grid place-items-center font-mono text-[11px] font-semibold text-white overflow-hidden"
          style={{ width: 32, height: 32, borderRadius: 999, background: accent }}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate">{displayName}</div>
          <span className={clsx("inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border", roleBadgeClass)}>
            {roleLabel}
          </span>
        </div>
        <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors p-1" title="Cerrar sesión">
          <LogOut size={13} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? "Cerrar menú" : "Abrir menú"}
        className="fixed left-3 z-50 rounded-lg border border-subtle bg-surface p-2.5 shadow-sm cc-text-primary lg:hidden"
        style={{ top: isDemoUser ? "48px" : "12px" }}
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
          className="fixed inset-y-0 left-0 z-40 flex h-dvh w-[240px] flex-col border-r border-subtle bg-surface shadow-xl lg:hidden"
          style={{ background: "var(--cc-paper-warm)" }}
        >
          {sidebarContent}
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className="relative z-10 hidden lg:flex h-screen w-[240px] flex-col border-r border-subtle bg-surface shrink-0"
        style={{ background: "var(--cc-paper-warm)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
