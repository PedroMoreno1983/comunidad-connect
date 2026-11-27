"use client";

import { PersonalBills } from "@/components/utilities/PersonalBills";
import { useAuth } from "@/lib/authContext";

export default function ResidentServicesPage() {
    const { user } = useAuth();
    return user ? <PersonalBills key={user.id} canReceiveReminders={Boolean(user.communityId)} /> : null;
}
