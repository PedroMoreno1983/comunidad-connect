export function isDemoModeEnabled() {
    return process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true';
}

export function isDemoEmail(email?: string | null) {
    return Boolean(email?.toLowerCase().endsWith('@demo.com'));
}
