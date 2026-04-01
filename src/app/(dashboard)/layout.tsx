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
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const { isDemoUser, demoMessage } = useDemoRestrictions();

    useEffect(() => {
        if (!user) {
            router.push('/');
        }
    }, [user, router]);

    if (!user) return null;

    return (
        <div className="flex h-screen bg-transparent text-slate-900 dark:text-slate-100 overflow-hidden relative">
            <AnimatedBackground />
            <ErrorBoundary name="Sidebar">
                <Sidebar />
            </ErrorBoundary>
            <main className="flex-1 overflow-y-auto relative z-10 flex flex-col">
                {/* Demo Banner */}
                {isDemoUser && (
                    <div className="bg-indigo-600 dark:bg-indigo-800 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium z-50 sticky top-0 shadow-md">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-center">{demoMessage}</span>
                    </div>
                )}
                
                {/* Main content with page transition */}
                <div className="relative p-4 lg:p-8 flex-1">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        >
                            <ErrorBoundary name="Content">
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
