import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSuperAdminEmail } from "@/lib/security/superadmin";
import { resolveProductCapabilities } from "@/lib/productCapabilities";

const PROTECTED_DASHBOARD_PREFIXES = [
  "/admin",
  "/agent-center",
  "/amenities",
  "/chat",
  "/comunicaciones",
  "/concierge",
  "/convivencia",
  "/directorio",
  "/expenses",
  "/feed",
  "/home",
  "/marketing",
  "/marketplace",
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
    "upgrade-insecure-requests",
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
  let allowed = true;

  if (pathname.startsWith("/comunicaciones") && role === "resident") {
    return secureResponse(NextResponse.redirect(new URL("/feed", req.url)), nonce);
  }

  if (pathname.startsWith("/agent-center")) {
    allowed = role === "admin";
  } else if (pathname.startsWith("/resident/training")) {
    allowed = role === "admin" || role === "concierge";
  } else if (pathname.startsWith("/comunicaciones")) {
    allowed = role === "admin" || role === "concierge";
  } else if (pathname.startsWith("/staff")) {
    allowed = role === "admin" || role === "concierge";
  } else if (pathname.startsWith("/admin")) {
    allowed = role === "admin";
  } else if (pathname.startsWith("/concierge")) {
    allowed = role === "concierge" || role === "admin";
  } else if (pathname.startsWith("/resident")) {
    allowed = role === "resident" || role === "admin";
  }

  if (!allowed) return secureResponse(NextResponse.redirect(new URL("/home", req.url)), nonce);

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
