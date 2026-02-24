"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

interface PageTransitionProps {
    children: React.ReactNode;
}

// Page transition wrapper component
export function PageTransition({ children }: PageTransitionProps) {
    const pathname = usePathname();

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1]
                }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

// Staggered list animation for cards/items
export function StaggerContainer({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            className={className}
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 0 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: 0.1
                    }
                }
            }}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            className={className}
            variants={{
                hidden: { opacity: 0, y: 20 },
                visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                        duration: 0.4,
                        ease: [0.4, 0, 0.2, 1]
                    }
                }
            }}
        >
            {children}
        </motion.div>
    );
}

// Fade in animation
export function FadeIn({
    children,
    delay = 0,
    duration = 0.5,
    className
}: {
    children: React.ReactNode;
    delay?: number;
    duration?: number;
    className?: string;
}) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay, duration, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

// Slide in from direction
export function SlideIn({
    children,
    direction = "up",
    delay = 0,
    className
}: {
    children: React.ReactNode;
    direction?: "up" | "down" | "left" | "right";
    delay?: number;
    className?: string;
}) {
    const directionOffset = {
        up: { y: 30 },
        down: { y: -30 },
        left: { x: 30 },
        right: { x: -30 }
    };

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, ...directionOffset[direction] }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
            {children}
        </motion.div>
    );
}

// Scale animation for interactive elements
export function ScaleOnHover({
    children,
    scale = 1.02,
    className
}: {
    children: React.ReactNode;
    scale?: number;
    className?: string;
}) {
    return (
        <motion.div
            className={className}
            whileHover={{ scale }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
        >
            {children}
        </motion.div>
    );
}

// Animated counter for stats
export function AnimatedNumber({
    value,
    duration = 1,
    prefix = "",
    suffix = ""
}: {
    value: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
}) {
    return (
        <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
            >
                {prefix}
                <motion.span
                    key={value}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    {value.toLocaleString('es-CL')}
                </motion.span>
                {suffix}
            </motion.span>
        </motion.span>
    );
}

// Pulse animation for notifications/alerts
export function Pulse({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            className={className}
            animate={{
                scale: [1, 1.05, 1],
            }}
            transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: "reverse"
            }}
        >
            {children}
        </motion.div>
    );
}
