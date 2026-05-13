"use client";

import { ToastProviderComponent } from "@/components/ui/Toast";
import { AuthProvider } from "@/lib/authContext";
import { NotificationProvider } from "@/lib/notificationContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <NotificationProvider>
                <ToastProviderComponent>
                    {children}
                </ToastProviderComponent>
            </NotificationProvider>
        </AuthProvider>
    );
}
