import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        const variants = {
            primary: 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_8px_30px_rgb(99,102,241,0.3)] hover:shadow-[0_8px_30px_rgb(99,102,241,0.5)] border border-white/20 hover:-translate-y-1 active:scale-95',
            secondary: 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/20 hover:bg-white dark:hover:bg-slate-700 hover:-translate-y-1 active:scale-95',
            outline: 'border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95',
            ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 active:scale-95',
            danger: 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-[0_8px_30px_rgb(239,68,68,0.3)] hover:shadow-[0_8px_30px_rgb(239,68,68,0.5)] border border-white/20 hover:-translate-y-1 active:scale-95',
        };

        const sizes = {
            sm: 'h-9 px-4 text-sm rounded-xl',
            md: 'h-11 px-6 py-2.5 rounded-2xl',
            lg: 'h-14 px-8 text-lg rounded-[1.25rem]',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';
