import type { User } from "@/lib/types";

export const SHOWCASE_COMMUNITY_ID = "b392cf17-fd6b-47dd-b0b4-72b0e007824e";

export function isShowcaseUser(user: Pick<User, "communityId" | "email"> | null | undefined) {
    const email = user?.email?.toLowerCase() || "";
    return user?.communityId === SHOWCASE_COMMUNITY_ID || email.includes(".showcase@conviveconnect.com");
}
