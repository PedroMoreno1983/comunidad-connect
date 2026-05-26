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
      className="flex justify-between items-center border-b"
      style={{ padding: "20px 32px", borderColor: "var(--cc-line)" }}
    >
      <div className="flex items-center gap-3.5">
        <Tag tone="copper" solid dot>
          {building} · {roleLabel}
        </Tag>
        <div className="text-[12px]" style={{ color: "var(--cc-ink-tertiary)" }}>
          {rightSubtitle}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center gap-2.5 rounded-md bg-paper"
          style={{ padding: "8px 14px", border: "1px solid var(--cc-line)", width: 320 }}
        >
          <Search size={14} color="var(--cc-ink-tertiary)" />
          <span className="flex-1 text-[12px]" style={{ color: "var(--cc-ink-tertiary)" }}>
            {searchPlaceholder}
          </span>
          <span
            className="font-mono text-[10px]"
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
            <Plus size={13} /> {cta.label}
          </Button>
        )}
      </div>
    </header>
  );
}
