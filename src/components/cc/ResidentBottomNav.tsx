"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Calendar, CreditCard, Home, Users } from "lucide-react";
import { clsx } from "clsx";

const items = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/expenses", label: "Pagar", icon: CreditCard },
  { href: "/amenities", label: "Reservas", icon: Calendar },
  { href: "/feed", label: "Comunidad", icon: Users },
] as const;

export function ResidentBottomNav() {
  const pathname = usePathname();

  const openCoco = () => {
    window.dispatchEvent(new CustomEvent("coco:compose", {
      detail: { message: "Hola CoCo, necesito ayuda con mi comunidad." },
    }));
  };

  return (
    <nav
      aria-label="Navegación principal del residente"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(26,22,17,0.08)] backdrop-blur lg:hidden"
      style={{ borderColor: "var(--cc-line)" }}
    >
      {items.map(item => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold",
              active ? "text-[var(--cc-copper)]" : "cc-text-secondary"
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={openCoco}
        aria-label="Abrir asistente CoCo"
        className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[var(--cc-sage)]"
      >
        <Bot className="h-5 w-5" />
        CoCo
      </button>
    </nav>
  );
}
