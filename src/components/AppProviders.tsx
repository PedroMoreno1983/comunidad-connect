"use client";

import { ToastProviderComponent } from "@/components/ui/Toast";
import { AuthProvider } from "@/lib/authContext";
import { NotificationProvider } from "@/lib/notificationContext";
import { CookieConsent } from "@/components/CookieConsent";

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <NotificationProvider>
                <ToastProviderComponent>
                    {children}
                    <CookieConsent />
                </ToastProviderComponent>
            </NotificationProvider>
        </AuthProvider>
    );
}
