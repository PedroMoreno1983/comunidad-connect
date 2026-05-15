"use client";

import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/authContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import CoCo from "@/components/CoCo/CoCo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useDemoRestrictions } from "@/hooks/useDemoRestrictions";
import { AlertCircle } from "lucide-react";
import { AppProviders } from "@/components/AppProviders";

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

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [loading, user, router]);

    if (loading || !user) return null;

    return (
        <div className="cc-dashboard grid h-dvh bg-transparent" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
            <AnimatedBackground />
            <ErrorBoundary name="Sidebar">
                <Sidebar />
            </ErrorBoundary>
            <main className="relative z-10 flex min-w-0 flex-col overflow-y-auto">
                {/* Demo Banner */}
                {isDemoUser && (
                    <div className="sticky top-0 z-40 flex min-h-10 items-center justify-center gap-2 border-b border-slate-800 bg-slate-950 px-16 py-2 text-[11px] font-semibold leading-tight text-white sm:px-20 sm:text-xs lg:px-4">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-brand-300 sm:h-4 sm:w-4" />
                        <span className="text-center sm:hidden">Demo protegida: envíos reales deshabilitados.</span>
                        <span className="hidden text-center sm:inline">{demoMessage}</span>
                    </div>
                )}
                
                {/* Main content */}
                <div className="relative flex-1 p-4 pb-28 pt-8 sm:p-5 sm:pb-28 lg:p-6 lg:pb-28 lg:pr-28">
                    <div key={pathname} className="min-h-full">
                        <ErrorBoundary name={`Contenido ${pathname}`} resetKey={pathname}>
                            {children}
                        </ErrorBoundary>
                    </div>
                </div>
            </main>
            <ErrorBoundary name="CoCo Widget">
                <CoCo />
            </ErrorBoundary>
        </div>
    );
}
