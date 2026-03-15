"use client";

import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/authContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import CoCo from "@/components/CoCo/CoCo";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

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
            <main className="flex-1 overflow-y-auto relative z-10">
                {/* Main content with page transition */}
                <div className="relative p-4 pt-20 lg:pt-8 lg:p-8">
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
