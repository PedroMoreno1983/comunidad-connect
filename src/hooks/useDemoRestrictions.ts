"use client";

import { useAuth } from "@/lib/authContext";

export function useDemoRestrictions() {
    const { user } = useAuth();
    const isDemoUser = user?.email?.includes("demo") || false;

    return {
        isDemoUser,
    };
}
