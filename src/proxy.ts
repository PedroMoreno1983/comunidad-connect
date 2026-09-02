import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSuperAdminEmail } from "@/lib/security/superadmin";
import { resolveProductCapabilities } from "@/lib/productCapabilities";
import { ACCESS_DENIED_QUERY, ACCESS_DENIED_VALUE, homePathForRole, isDashboardPathAllowedForRole } from "@/lib/roleAccess";

const PROTECTED_DASHBOARD_PREFIXES = [
  "/admin",
  "/agent-center",
  "/amenities",
  "/chat",
  "/comunicaciones",
  "/concierge",
  "/convivencia",
  "/directorio",
  "/estacionamientos",
  "/expenses",
  "/feed",
  "/home",
  "/marketing",
  "/marketplace",
  "/notifications",
  "/payment-sandbox",
  "/privacy-center",
  "/profile",
  "/resident",
  "/services",
  "/social",
  "/staff",
  "/superadmin",
  "/training",
  "/votaciones",
];

function isProtectedDashboardPath(pathname: string) {
  return PROTECTED_DASHBOARD_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function contentSecurityPolicy(nonce: string) {
  const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval} blob: https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://ui-avatars.com https://*.supabase.co https://www.google-analytics.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.resend.com https://api.twilio.com https://www.google-analytics.com https://region1.google-analytics.com",
    "media-src 'self' data: blob: https://*.supabase.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function secureResponse(response: NextResponse, nonce: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  return response;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestHeaders = new Headers(req.headers);
  const csp = contentSecurityPolicy(nonce);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const capabilities = resolveProductCapabilities(process.env);
  const alwaysHidden = pathname === "/showcase"
    || pathname.startsWith("/convive-connect");
  const unavailableIntegration = (
    pathname.startsWith("/marketing/reels")
    || pathname.startsWith("/api/marketing/reels")
  ) && !capabilities.marketingReels;

  if (alwaysHidden || unavailableIntegration) {
    return secureResponse(new NextResponse(null, {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    }), nonce);
  }

  const res = secureResponse(NextResponse.next({ request: { headers: requestHeaders } }), nonce);

  if (!isProtectedDashboardPath(pathname)) return res;

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
    return secureResponse(NextResponse.redirect(loginUrl), nonce);
  }

  if (pathname.startsWith("/superadmin")) {
    if (isSuperAdminEmail(email)) return res;
    return secureResponse(NextResponse.redirect(new URL("/home", req.url)), nonce);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = typeof profile?.role === "string" ? profile.role : "resident";

  if (pathname.startsWith("/comunicaciones") && role === "resident") {
    return secureResponse(NextResponse.redirect(new URL("/feed", req.url)), nonce);
  }
  if (pathname.startsWith("/feed") && role !== "resident") {
    return secureResponse(NextResponse.redirect(new URL("/comunicaciones", req.url)), nonce);
  }

  if (!isDashboardPathAllowedForRole(pathname, role)) {
    const home = new URL(homePathForRole(role), req.url);
    home.searchParams.set(ACCESS_DENIED_QUERY, ACCESS_DENIED_VALUE);
    return secureResponse(NextResponse.redirect(home), nonce);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
