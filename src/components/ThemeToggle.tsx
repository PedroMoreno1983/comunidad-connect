"use client";

import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [showMenu, setShowMenu] = useState(false);
    const [mounted, setMounted] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

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
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="relative p-2.5 rounded-xl bg-elevated hover:bg-elevated transition-colors"
                aria-label="Cambiar tema"
            >
                {resolvedTheme === 'dark' ? (
                    <Moon className="h-5 w-5 text-brand-400" />
                ) : (
                    <Sun className="h-5 w-5 text-amber-500" />
                )}
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
                <div className="absolute right-0 mt-2 w-40 py-2 bg-surface rounded-xl shadow-xl border border-subtle z-50">
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
                            {theme === id && <span className="ml-auto h-2 w-2 rounded-full bg-brand-500" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Compact toggle for sidebar
export function ThemeToggleCompact() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleTheme}
            className="relative w-14 h-8 rounded-full bg-elevated p-1 transition-colors"
            aria-label="Cambiar tema"
        >
            <div
                className="absolute w-6 h-6 rounded-full bg-surface shadow-md flex items-center justify-center transition-transform"
                style={{ transform: `translateX(${resolvedTheme === 'dark' ? 24 : 0}px)` }}
            >
                {resolvedTheme === 'dark' ? (
                    <Moon className="h-3.5 w-3.5 text-brand-400" />
                ) : (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                )}
            </div>
        </button>
    );
}
