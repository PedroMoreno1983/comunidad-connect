"use client";

import { AppProviders } from "@/components/AppProviders";
import { ThemeProviders } from "@/components/ThemeProviders";

export { AppProviders } from "@/components/AppProviders";
export { ThemeProviders } from "@/components/ThemeProviders";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProviders>
            <AppProviders>{children}</AppProviders>
        </ThemeProviders>
    );
}
