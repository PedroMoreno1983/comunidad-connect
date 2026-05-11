import type { ServiceProvider } from "@/lib/types";

export const demoProvidersStorageKey = "cc_demo_service_providers";

export function getDemoCreatedProviders(): ServiceProvider[] {
    if (typeof window === "undefined") return [];

    try {
        const providers = JSON.parse(window.localStorage.getItem(demoProvidersStorageKey) || "[]") as ServiceProvider[];
        return providers.filter(provider => provider.id?.startsWith("demo-provider-created-"));
    } catch {
        return [];
    }
}

export function saveDemoCreatedProvider(provider: ServiceProvider) {
    if (typeof window === "undefined") return;

    const existing = getDemoCreatedProviders().filter(item => item.id !== provider.id);
    window.localStorage.setItem(demoProvidersStorageKey, JSON.stringify([provider, ...existing].slice(0, 20)));
}

export function mergeDemoCreatedProviders(providers: ServiceProvider[]) {
    const merged = new Map<string, ServiceProvider>();

    [...getDemoCreatedProviders(), ...providers].forEach(provider => {
        const key = provider.id || provider.email || provider.name;
        if (!merged.has(key)) merged.set(key, provider);
    });

    return Array.from(merged.values());
}
