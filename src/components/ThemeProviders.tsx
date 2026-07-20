"use client";

import { ThemeProvider } from "next-themes";

type ThemeProvidersProps = {
    children: React.ReactNode;
    nonce?: string;
};

export function ThemeProviders({ children, nonce }: ThemeProvidersProps) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
            {children}
        </ThemeProvider>
    );
}
