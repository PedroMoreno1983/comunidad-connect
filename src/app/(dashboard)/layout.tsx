"use client";

import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/authContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import CoCo from "@/components/CoCo/CoCo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useDemoRestrictions } from "@/hooks/useDemoRestrictions";
import { AlertCircle } from "lucide-react";

export default function DashboardLayout({
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
                    <div className="sticky top-0 z-50 flex min-h-12 items-center justify-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 pl-20 text-xs font-semibold text-white lg:min-h-0 lg:pl-4">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-brand-300" />
                        <span className="text-center">{demoMessage}</span>
                    </div>
                )}
                
                {/* Main content with page transition */}
                <div className="relative flex-1 p-4 pb-28 pt-20 lg:p-6 lg:pb-28 lg:pr-28">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        >
                            <ErrorBoundary name={`Contenido ${pathname}`} resetKey={pathname}>
                                {children}
                            </ErrorBoundary>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
            <ErrorBoundary name="CoCo Widget">
                <CoCo />
            </ErrorBoundary>
        </div>
    );
}
