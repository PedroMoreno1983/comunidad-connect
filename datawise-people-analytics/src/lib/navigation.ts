import type { LucideIcon } from "lucide-react";
import { BarChart3, Building2, ShieldAlert, Upload } from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard Ejecutivo",
    description: "Lectura ejecutiva de salud organizacional, riesgo y tendencias.",
    icon: BarChart3
  },
  {
    href: "/people",
    label: "Alertas de Personas",
    description: "Cola priorizada por colaborador, manager y siguiente accion.",
    icon: ShieldAlert
  },
  {
    href: "/departments",
    label: "Vista por Equipos",
    description: "Tabla de salud por area y lente operativo para managers.",
    icon: Building2
  },
  {
    href: "/upload",
    label: "Carga de Datos",
    description: "Flujo gobernado de CSV/XLSX hacia el modelo analitico.",
    icon: Upload
  }
];
