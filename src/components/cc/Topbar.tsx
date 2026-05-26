/* src/components/cc/Topbar.tsx ──────────────────────────────── */
"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { Tag } from "./Tag";
import { Button } from "./Button";

type TopbarProps = {
  building: string;
  roleLabel: string;
  /** Pass current date/time formatted in es-CL. */
  rightSubtitle: string;
  /** Optional search placeholder. */
  searchPlaceholder?: string;
  /** Optional CTA on the right. */
  cta?: { label: string; onClick?: () => void; href?: string };
};

export function Topbar({
  building,
  roleLabel,
  rightSubtitle,
  searchPlaceholder = "Buscar residentes, unidades, casos…",
  cta,
}: TopbarProps) {
  return (
    <header
      className="flex justify-between items-center border-b px-4 py-4 lg:px-8 gap-4 pl-16 lg:pl-8"
      style={{ borderColor: "var(--cc-line)" }}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <Tag tone="copper" solid dot>
          <span className="truncate max-w-[120px] sm:max-w-none">
            {building} · {roleLabel}
          </span>
        </Tag>
        <div className="text-[12px] hidden sm:block truncate" style={{ color: "var(--cc-ink-tertiary)" }}>
          {rightSubtitle}
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="hidden md:flex items-center gap-2.5 rounded-md bg-paper"
          style={{ padding: "8px 14px", border: "1px solid var(--cc-line)", width: 280 }}
        >
          <Search size={14} color="var(--cc-ink-tertiary)" />
          <span className="flex-1 text-[12px] truncate" style={{ color: "var(--cc-ink-tertiary)" }}>
            {searchPlaceholder}
          </span>
          <span
            className="font-mono text-[10px] hidden lg:inline-block"
            style={{
              color: "var(--cc-ink-tertiary)",
              padding: "2px 6px",
              border: "1px solid var(--cc-line)",
              borderRadius: 4,
            }}
          >
            ⌘ K
          </span>
        </div>
        {cta && (
          <Button variant="primary" size="sm" onClick={cta.onClick}>
            <Plus size={13} /> <span className="hidden sm:inline">{cta.label}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
