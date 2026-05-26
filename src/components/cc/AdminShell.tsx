/* src/components/cc/AdminShell.tsx ──────────────────────────── */
"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type AdminShellProps = {
  activeHref: string;
  role?: "admin" | "conserje" | "resident";
  user: { name: string; initials: string; roleLabel: string };
  building: string;
  rightSubtitle: string;
  cta?: { label: string; onClick?: () => void; href?: string };
  children: React.ReactNode;
};

/**
 * Premium dashboard chrome: warm ivory canvas with a paper-warm sidebar.
 * Use as a wrapper for any /admin, /concierge, or /(dashboard) page.
 */
export function AdminShell({
  activeHref,
  role = "admin",
  user,
  building,
  rightSubtitle,
  cta,
  children,
}: AdminShellProps) {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--cc-ivory)" }}>
      <Sidebar role={role} activeHref={activeHref} user={user} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          building={building}
          roleLabel={user.roleLabel}
          rightSubtitle={rightSubtitle}
          cta={cta}
        />
        <div className="flex-1 overflow-auto" style={{ padding: "28px 32px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
