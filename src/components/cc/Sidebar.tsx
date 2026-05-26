/* src/components/cc/Sidebar.tsx ─────────────────────────────── */
"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home, Users, Bell, Wrench, Receipt, Calendar, CheckSquare,
  ShoppingBag, MapPin, MessageSquare, Settings, Car
} from "lucide-react";
import { Brand } from "./Brand";

type Role = "admin" | "conserje" | "resident";

const ACCENT: Record<Role, string> = {
  admin:    "var(--cc-copper)",
  conserje: "var(--cc-amber)",
  resident: "var(--cc-sage)",
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number;
  group: "primary" | "community";
};

const NAV_ADMIN: NavItem[] = [
  { label: "Resumen",         href: "/admin",            icon: Home,        group: "primary" },
  { label: "Residentes",      href: "/admin/residentes", icon: Users,       group: "primary" },
  { label: "Comunicaciones",  href: "/comunicaciones",   icon: Bell,        group: "primary", badge: 4 },
  { label: "Solicitudes",     href: "/services",         icon: Wrench,      group: "primary", badge: 12 },
  { label: "Gastos comunes",  href: "/expenses",         icon: Receipt,     group: "primary" },
  { label: "Reservas",        href: "/amenities",        icon: Calendar,    group: "primary" },
  { label: "Votaciones",      href: "/votaciones",       icon: CheckSquare, group: "primary" },
  { label: "Marketplace",     href: "/marketplace",      icon: ShoppingBag, group: "community" },
  { label: "Directorio",      href: "/directorio",       icon: MapPin,      group: "community" },
  { label: "Social",          href: "/social",           icon: MessageSquare, group: "community" },
];

const NAV_CONSERJE: NavItem[] = [
  { label: "Recepción",         href: "/concierge",                  icon: Home,    group: "primary" },
  { label: "Visitas",           href: "/concierge/visitas",          icon: Users,   group: "primary", badge: 3 },
  { label: "Encomiendas",       href: "/concierge/encomiendas",      icon: ShoppingBag, group: "primary", badge: 7 },
  { label: "Estacionamientos",  href: "/concierge/estacionamientos", icon: Car,     group: "primary" },
  { label: "Incidencias",       href: "/concierge/incidencias",      icon: Wrench,  group: "primary" },
  { label: "Bitácora",          href: "/concierge/bitacora",         icon: Receipt, group: "primary" },
];

type SidebarProps = {
  role?: Role;
  activeHref: string;
  user: { name: string; initials: string; roleLabel: string };
};

export function Sidebar({ role = "admin", activeHref, user }: SidebarProps) {
  const accent = ACCENT[role];
  const nav = role === "conserje" ? NAV_CONSERJE : NAV_ADMIN;
  const primary = nav.filter((n) => n.group === "primary");
  const community = nav.filter((n) => n.group === "community");

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 240,
        background: "var(--cc-paper-warm)",
        borderRight: "1px solid var(--cc-line)",
        padding: "24px 18px",
      }}
    >
      <div className="mb-9">
        <Brand size={17} withMark />
      </div>

      <NavGroup label={role === "conserje" ? "Conserjería" : "Operación"} items={primary} activeHref={activeHref} accent={accent} />

      {community.length > 0 && (
        <div className="mt-6">
          <NavGroup label="Comunidad" items={community} activeHref={activeHref} accent={accent} />
        </div>
      )}

      <div
        className="mt-auto flex items-center gap-2.5 rounded-xl border bg-paper"
        style={{ padding: 12, borderColor: "var(--cc-line)" }}
      >
        <div
          className="grid place-items-center font-mono text-[11px] font-semibold text-white"
          style={{ width: 32, height: 32, borderRadius: 999, background: accent }}
        >
          {user.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate">{user.name}</div>
          <div className="text-[10px]" style={{ color: "var(--cc-ink-tertiary)" }}>{user.roleLabel}</div>
        </div>
        <Settings size={14} color="var(--cc-ink-tertiary)" />
      </div>
    </aside>
  );
}

function NavGroup({
  label, items, activeHref, accent,
}: { label: string; items: NavItem[]; activeHref: string; accent: string }) {
  return (
    <>
      <div
        className="cc-eyebrow"
        style={{ padding: "0 8px", marginBottom: 8 }}
      >
        {label}
      </div>
      {items.map((n) => {
        const Active = n.href === activeHref;
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
            <Icon size={15} color={Active ? accent : "var(--cc-ink-muted)"} strokeWidth={1.6} />
            <span className="flex-1">{n.label}</span>
            {n.badge && (
              <span
                className="font-mono"
                style={{
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: accent,
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {n.badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
