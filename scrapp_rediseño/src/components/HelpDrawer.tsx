import { X } from "lucide-react";
import React from "react";

type HelpDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function HelpDrawer({ open, onClose, title = "Ayuda", children }: HelpDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-[var(--bg-card)] shadow-xl border-l transition-transform duration-300
        ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border-color)" }}>
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-56px)]">{children}</div>
      </aside>
    </>
  );
}
