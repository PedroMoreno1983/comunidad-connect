import type { SocialComment, SocialPost, User } from "@/lib/types";

const demoSocialPostsStorageKey = "cc_demo_social_posts";
const demoSocialCommentsStorageKey = "cc_demo_social_comments";

export function getDemoSocialPosts(): SocialPost[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(window.localStorage.getItem(demoSocialPostsStorageKey) || "[]") as SocialPost[];
    } catch {
        return [];
    }
}

export function saveDemoSocialPosts(posts: SocialPost[]) {
    if (typeof window === "undefined") return;
    const demoPosts = posts.filter(post => post.id.startsWith("demo-social-post-"));
    window.localStorage.setItem(demoSocialPostsStorageKey, JSON.stringify(demoPosts.slice(0, 50)));
}

export function createDemoSocialPost(user: User, content: string, imageUrl?: string): SocialPost {
    return {
        id: `demo-social-post-${Date.now()}`,
        author_id: user.id,
        content,
        image_url: imageUrl,
        likes_count: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        profiles: {
            name: user.name,
            avatar_url: user.photo || user.avatarUrl,
            unit_id: user.unitName || user.unitId,
        },
    };
}

export function getDemoSocialComments(postId: string): SocialComment[] {
    if (typeof window === "undefined") return [];
    try {
        const comments = JSON.parse(window.localStorage.getItem(demoSocialCommentsStorageKey) || "{}") as Record<string, SocialComment[]>;
        return comments[postId] || [];
    } catch {
        return [];
    }
}

export function saveDemoSocialComment(postId: string, comment: SocialComment) {
    if (typeof window === "undefined") return;
    try {
        const comments = JSON.parse(window.localStorage.getItem(demoSocialCommentsStorageKey) || "{}") as Record<string, SocialComment[]>;
        comments[postId] = [...(comments[postId] || []), comment].slice(-50);
        window.localStorage.setItem(demoSocialCommentsStorageKey, JSON.stringify(comments));
    } catch {
        window.localStorage.setItem(demoSocialCommentsStorageKey, JSON.stringify({ [postId]: [comment] }));
    }
}

export function createDemoSocialComment(user: User, postId: string, content: string): SocialComment {
    return {
        id: `demo-social-comment-${Date.now()}`,
        post_id: postId,
        author_id: user.id,
        content,
        created_at: new Date().toISOString(),
        profiles: {
            name: user.name,
            avatar_url: user.photo || user.avatarUrl,
        },
    };
}

export async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
    });
}
