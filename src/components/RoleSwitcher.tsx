"use client";

import { useAuth } from "@/lib/authContext";
import { ShieldCheck, User, KeyRound, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function RoleSwitcher() {
    const { user, login, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Solo mostrar en desarrollo y en el cliente
    if (!mounted || typeof window === 'undefined') return null;

    // Solo mostrar en desarrollo (o mientras estemos en esta fase de pruebas)
    if (process.env.NODE_ENV === 'production' && !window.location.hostname.includes('localhost')) {
        return null;
    }

    const roles = [
        { id: 'admin', label: 'Admin', icon: ShieldCheck, color: 'blue' },
        { id: 'resident', label: 'Residente', icon: User, color: 'indigo' },
        { id: 'concierge', label: 'Conserje', icon: KeyRound, color: 'emerald' },
    ];

    const handleSwitch = (role: string) => {
        login(role);
        setIsOpen(false);
        // Force refresh to clear any state and redirect via layout effect
        window.location.href = '/home';
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999]">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="mb-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col gap-2 min-w-[180px]"
                    >
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1">Simular Perfil</p>
                        {roles.map((r) => {
                            const Icon = r.icon;
                            const isActive = user?.role === r.id;

                            return (
                                <button
                                    key={r.id}
                                    onClick={() => handleSwitch(r.id)}
                                    className={`
                                        flex items-center gap-3 px-4 py-3 rounded-2xl transition-all
                                        ${isActive
                                            ? `bg-${r.color}-500 text-white shadow-lg shadow-${r.color}-500/20`
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}
                                    `}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span className="text-sm font-bold">{r.label}</span>
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    h-14 w-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90
                    ${isOpen ? 'bg-slate-900 text-white rotate-180' : 'bg-blue-600 text-white hover:bg-blue-700'}
                `}
            >
                <RefreshCw className={`h-6 w-6 ${isOpen ? 'animate-pulse' : ''}`} />
            </button>
        </div>
    );
}
