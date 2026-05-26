"use client";

import { useAuth } from "@/lib/authContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CoCo from "@/components/CoCo/CoCo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useDemoRestrictions } from "@/hooks/useDemoRestrictions";
import { AlertCircle } from "lucide-react";
import { AppProviders } from "@/components/AppProviders";
import { AdminShell } from "@/components/cc/AdminShell";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppProviders>
            <DashboardShell>{children}</DashboardShell>
        </AppProviders>
    );
}

function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const { isDemoUser, demoMessage } = useDemoRestrictions();
    const [timeString, setTimeString] = useState("");

    // Hydration-safe clock
    useEffect(() => {
        const updateTime = () => {
            setTimeString(
                new Date().toLocaleString("es-CL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                })
            );
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [loading, user, router]);

    useEffect(() => {
        const routeTitles: Record<string, string> = {
            '/home': 'Inicio',
            '/marketplace': 'Marketplace',
            '/amenities': 'Reservas de Instalaciones',
            '/expenses': 'Gastos Comunes',
            '/votaciones': 'Votaciones',
            '/feed': 'Avisos y Comunicaciones',
            '/chat': 'CoCo AI Chat',
            '/social': 'Red Social',
            '/directorio': 'Directorio de Vecinos',
            '/profile': 'Mi Perfil',
            '/services': 'Solicitudes de Servicio',
            '/concierge/visitors': 'Registro de Visitas',
            '/concierge/packages': 'Encomiendas y Paquetes',
            '/admin/users': 'Usuarios y Accesos',
            '/admin/units': 'Departamentos y Copropiedad',
            '/admin/consumo': 'Consumo de Agua e IoT',
            '/admin/finanzas': 'Gastos Comunes y Facturación',
            '/admin/mantenimiento': 'Operaciones e Incidencias',
            '/admin/votaciones': 'Votaciones y Encuestas',
            '/admin/training': 'Capacitación y Cursos IA',
            '/superadmin': 'Consola SuperAdmin',
        };

        const currentTitle = routeTitles[pathname] || '';
        document.title = currentTitle 
            ? `${currentTitle} | Convive Connect` 
            : 'Convive Connect — Tu edificio, más humano que nunca';
    }, [pathname]);

    if (loading || !user) return null;

    const initials = user.name
        ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
        : "U";

    const roleLabels: Record<string, string> = {
        admin: "Administrador",
        concierge: "Conserjería",
        resident: "Residente",
    };

    // Demo Banner element
    const demoBanner = isDemoUser && (
        <div className="sticky top-0 z-40 flex min-h-10 items-center justify-center gap-2 border-b border-slate-800 bg-slate-950 px-16 py-2 text-[11px] font-semibold leading-tight text-white sm:px-20 sm:text-xs lg:px-4">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-[#B5664E] sm:h-4 sm:w-4" />
            <span className="text-center sm:hidden">Demo protegida: envíos reales deshabilitados.</span>
            <span className="hidden text-center sm:inline">{demoMessage}</span>
        </div>
    );

    // Admin, Concierge, & Resident wrapped in responsive AdminShell layout
    const roleMapped = user.role === "concierge" ? "conserje" : user.role === "resident" ? "resident" : "admin";

    return (
        <div className="min-h-screen" style={{ background: "var(--cc-ivory)" }}>
            {demoBanner}
            <ErrorBoundary name="AdminShell Wrapper">
                <AdminShell
                    activeHref={pathname}
                    role={roleMapped}
                    user={{
                        name: user.name,
                        initials,
                        roleLabel: roleLabels[user.role] || "Miembro",
                    }}
                    building={(user as any).condoName || (user as any).communityName || "Mi Edificio"}
                    rightSubtitle={timeString}
                >
                    <ErrorBoundary name={`Contenido ${pathname}`} resetKey={pathname}>
                        {children}
                    </ErrorBoundary>
                </AdminShell>
            </ErrorBoundary>
            <ErrorBoundary name="CoCo Widget">
                <CoCo />
            </ErrorBoundary>
        </div>
    );
}
