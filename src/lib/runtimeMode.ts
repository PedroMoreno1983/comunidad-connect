const demoRequested = process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
const productionDemoAllowed = process.env.NEXT_PUBLIC_ALLOW_PRODUCTION_DEMO === "true";

export function isDemoModeEnabled() {
    if (!demoRequested) return false;
    if (process.env.NODE_ENV === "production" && !productionDemoAllowed) return false;
    return true;
}

export function isDemoModeRequested() {
    return demoRequested;
}

export function isDemoEmail(email?: string | null) {
    return Boolean(email?.toLowerCase().endsWith("@demo.com"));
}
