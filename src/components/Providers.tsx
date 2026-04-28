"use client";

import { ThemeProvider } from "next-themes";
import { ToastProviderComponent } from "@/components/ui/Toast";
import { AuthProvider } from "@/lib/authContext";
import { NotificationProvider } from "@/lib/notificationContext";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AuthProvider>
                <NotificationProvider>
                    <ToastProviderComponent>
                        {children}
                    </ToastProviderComponent>
                </NotificationProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
