"use client";

import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [showMenu, setShowMenu] = useState(false);
    const [mounted, setMounted] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);

    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const themes = [
        { id: 'light' as const, icon: Sun, label: 'Claro' },
        { id: 'dark' as const, icon: Moon, label: 'Oscuro' },
        { id: 'system' as const, icon: Monitor, label: 'Sistema' },
    ];

    if (!mounted) return null;

    return (
        <div ref={menuRef} className="relative">
            {/* Toggle Button */}
            <motion.button
                onClick={() => setShowMenu(!showMenu)}
                className="relative p-2.5 rounded-xl bg-elevated hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                whileTap={{ scale: 0.95 }}
                aria-label="Cambiar tema"
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={resolvedTheme}
                        initial={{ y: -20, opacity: 0, rotate: -90 }}
                        animate={{ y: 0, opacity: 1, rotate: 0 }}
                        exit={{ y: 20, opacity: 0, rotate: 90 }}
                        transition={{ duration: 0.2 }}
                    >
                        {resolvedTheme === 'dark' ? (
                            <Moon className="h-5 w-5 text-indigo-400" />
                        ) : (
                            <Sun className="h-5 w-5 text-amber-500" />
                        )}
                    </motion.div>
                </AnimatePresence>
            </motion.button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {showMenu && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-40 py-2 bg-surface rounded-xl shadow-xl border border-subtle z-50"
                    >
                        {themes.map(({ id, icon: Icon, label }) => (
                            <button
                                key={id}
                                onClick={() => {
                                    setTheme(id);
                                    setShowMenu(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${theme === id
                                    ? 'text-role-admin-fg bg-role-admin-bg'
                                    : 'cc-text-secondary hover:bg-elevated'
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="font-medium">{label}</span>
                                {theme === id && (
                                    <motion.div
                                        layoutId="theme-check"
                                        className="ml-auto w-2 h-2 rounded-full bg-indigo-500"
                                    />
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Compact toggle for sidebar
export function ThemeToggleCompact() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    };

    if (!mounted) return null;

    return (
        <motion.button
            onClick={toggleTheme}
            className="relative w-14 h-8 rounded-full bg-slate-200 dark:bg-slate-700 p-1 transition-colors"
            whileTap={{ scale: 0.95 }}
            aria-label="Cambiar tema"
        >
            <motion.div
                className="absolute w-6 h-6 rounded-full bg-surface shadow-md flex items-center justify-center"
                animate={{ x: resolvedTheme === 'dark' ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={resolvedTheme}
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{ duration: 0.2 }}
                    >
                        {resolvedTheme === 'dark' ? (
                            <Moon className="h-3.5 w-3.5 text-indigo-400" />
                        ) : (
                            <Sun className="h-3.5 w-3.5 text-amber-500" />
                        )}
                    </motion.div>
                </AnimatePresence>
            </motion.div>
        </motion.button>
    );
}
