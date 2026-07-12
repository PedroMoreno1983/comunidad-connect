import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSuperAdminEmail } from "@/lib/security/superadmin";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/superadmin")) {
    if (isSuperAdminEmail(email)) return res;
    return NextResponse.redirect(new URL("/home", req.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = typeof profile?.role === "string" ? profile.role : "resident";
  const allowed = pathname.startsWith("/admin")
    ? role === "admin"
    : pathname.startsWith("/concierge")
      ? role === "concierge" || role === "admin"
      : pathname.startsWith("/resident")
        ? role === "resident" || role === "admin"
        : true;

  if (!allowed) return NextResponse.redirect(new URL("/home", req.url));

  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/concierge/:path*",
    "/resident/:path*",
    "/superadmin/:path*",
  ],
};
