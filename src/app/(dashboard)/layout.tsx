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
        <div className="cc-dashboard flex h-screen bg-transparent overflow-hidden relative">
            <AnimatedBackground />
            <ErrorBoundary name="Sidebar">
                <Sidebar />
            </ErrorBoundary>
            <main className="flex-1 overflow-y-auto relative z-10 flex flex-col">
                {/* Demo Banner */}
                {isDemoUser && (
                    <div className="sticky top-0 z-50 flex min-h-9 items-center justify-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5 pl-16 text-[11px] font-semibold leading-tight text-white sm:min-h-10 sm:px-4 sm:pl-20 sm:text-xs lg:min-h-0 lg:pl-4">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-brand-300 sm:h-4 sm:w-4" />
                        <span className="text-center sm:hidden">Demo protegida: envíos reales deshabilitados.</span>
                        <span className="hidden text-center sm:inline">{demoMessage}</span>
                    </div>
                )}
                
                {/* Main content */}
                <div className="relative flex-1 p-4 pb-28 pt-24 sm:pt-20 lg:p-6 lg:pb-28 lg:pr-28">
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
