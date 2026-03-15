"use client";

import { motion } from "framer-motion";

export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            {/* Base Background */}
            <div className="absolute inset-0 bg-slate-50 dark:bg-[#060913] transition-colors duration-700" />

            {/* Optimized Animated Orbs (less blur, no mix-blend for better performance) */}
            <motion.div
                animate={{
                    opacity: [0.1, 0.2, 0.1],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "linear",
                }}
                className="absolute top-[-10%] right-[-5%] w-[60vw] h-[60vw] bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-[80px]"
            />

            <motion.div
                animate={{
                    opacity: [0.1, 0.15, 0.1],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear",
                    delay: 2,
                }}
                className="absolute bottom-[-10%] left-[-5%] w-[70vw] h-[70vw] bg-emerald-500/10 dark:bg-emerald-600/10 rounded-full blur-[80px]"
            />

            {/* Subtle Grid Overlay */}
            <div
                className="absolute inset-0 opacity-[0.01] dark:opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 0h1v1H0z' fill='%239C92AC'/%3E%3C/svg%3E")`,
                }}
            />
        </div>
    );
}
