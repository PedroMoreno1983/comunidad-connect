import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { hasSuperAdminConfig, isSuperAdminEmail } from "@/lib/security/superadmin";

export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, "superadmin.access", { limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    if (!hasSuperAdminConfig()) {
        return NextResponse.json({ allowed: false }, { status: 503 });
    }

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !isSuperAdminEmail(user.email)) {
        return NextResponse.json({ allowed: false }, { status: 403 });
    }

    return NextResponse.json({ allowed: true });
}
