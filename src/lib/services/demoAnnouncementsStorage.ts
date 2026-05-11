import type { Announcement, User } from "@/lib/types";

const demoAnnouncementsStorageKey = "cc_demo_announcements";

export function getDemoAnnouncements(): Announcement[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(window.localStorage.getItem(demoAnnouncementsStorageKey) || "[]") as Announcement[];
    } catch {
        return [];
    }
}

export function saveDemoAnnouncements(announcements: Announcement[]) {
    if (typeof window === "undefined") return;
    const demoAnnouncements = announcements.filter(item => item.id.startsWith("demo-announcement-"));
    window.localStorage.setItem(demoAnnouncementsStorageKey, JSON.stringify(demoAnnouncements.slice(0, 50)));
}

export function createDemoAnnouncement(
    user: User,
    input: { title: string; content: string; priority: "info" | "alert" | "event" }
): Announcement {
    return {
        id: `demo-announcement-${Date.now()}`,
        title: input.title.trim(),
        content: input.content.trim(),
        author: user.name || "Administracion",
        priority: input.priority,
        createdAt: new Date().toISOString(),
    };
}

export function mergeDemoAnnouncements(announcements: Announcement[]) {
    const merged = new Map<string, Announcement>();
    [...getDemoAnnouncements(), ...announcements].forEach(item => {
        if (!merged.has(item.id)) merged.set(item.id, item);
    });
    return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
