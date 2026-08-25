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
    if (error || !user?.email) {
        return NextResponse.json({ allowed: false }, { status: 401 });
    }

    // "You are not a superadmin" is the expected answer for almost every admin,
    // so it is a 200 with allowed:false. Returning 403 made the sidebar log a
    // failed request on every single page load and would drown any real error
    // in monitoring. Access itself is still enforced by the proxy on /superadmin.
    return NextResponse.json({ allowed: isSuperAdminEmail(user.email) });
}
