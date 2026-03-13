"use client";

import { ThemeProvider } from "next-themes";
import { ToastProviderComponent } from "@/components/ui/Toast";
import { AuthProvider } from "@/lib/authContext";
import { NotificationProvider } from "@/lib/notificationContext";
import { RoleSwitcher } from "@/components/RoleSwitcher";

export function Providers({ children }: { children: React.ReactNode }) {
    console.log("[Providers Debug] Rendering Providers component!");
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AuthProvider>
                <NotificationProvider>
                    <ToastProviderComponent>
                        {children}
                        <RoleSwitcher />
                    </ToastProviderComponent>
                </NotificationProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
