export function getSuperAdminEmails() {
    return (process.env.SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAIL || "")
        .split(",")
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);
}

export function hasSuperAdminConfig() {
    return getSuperAdminEmails().length > 0;
}

export function isSuperAdminEmail(email?: string | null) {
    if (!email) return false;
    return getSuperAdminEmails().includes(email.toLowerCase());
}
