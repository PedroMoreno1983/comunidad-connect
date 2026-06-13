"use client";

import { useAuth } from "@/lib/authContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CoCo from "@/components/CoCo/CoCo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AdminShell } from "@/components/cc/AdminShell";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardShell>{children}</DashboardShell>;
}

function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
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
            const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
            router.replace(`/login${next}`);
        }
    }, [loading, pathname, user, router]);

    useEffect(() => {
        const routeTitles: Record<string, string> = {
            '/home': 'Inicio',
            '/agent-center': 'Agent Center',
            '/marketing/reels': 'Reels Agent',
            '/marketplace': 'Marketplace',
            '/amenities': 'Reservas de Instalaciones',
            '/expenses': 'Gastos Comunes',
            '/votaciones': 'Votaciones',
            '/feed': 'Avisos y Comunicaciones',
            '/chat': 'CoCo AI Chat',
            '/social': 'Red Social',
            '/directorio': 'Directorio de Vecinos',
            '/profile': 'Mi Perfil',
            '/showcase': 'Lienzo de Diseño',
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
            : 'Convive Connect - Tu edificio, más humano que nunca';
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
    const communityUser = user as typeof user & { condoName?: string; communityName?: string };
    const buildingName = communityUser.condoName || communityUser.communityName || "Mi Edificio";


    // Admin, Concierge, & Resident wrapped in responsive AdminShell layout
    const roleMapped = user.role === "concierge" ? "conserje" : user.role === "resident" ? "resident" : "admin";

    return (
        <div className="min-h-screen" style={{ background: "var(--cc-ivory)" }}>
            <ErrorBoundary name="AdminShell Wrapper">
                <AdminShell
                    activeHref={pathname}
                    role={roleMapped}
                    user={{
                        name: user.name,
                        initials,
                        roleLabel: roleLabels[user.role] || "Miembro",
                    }}
                    building={buildingName}
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
