import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/departments", "/api/analytics"];

function decodeBase64(value: string) {
  try {
    return atob(value);
  } catch {
    return "";
  }
}

export function proxy(request: NextRequest) {
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Basic ")) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="DataWise People Analytics"',
      },
    });
  }

  const decodedCredentials = decodeBase64(authorization.slice(6));
  const [providedUsername, providedPassword] = decodedCredentials.split(":");

  if (providedUsername !== username || providedPassword !== password) {
    return new NextResponse("Invalid credentials.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="DataWise People Analytics"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/departments/:path*", "/api/analytics/:path*"],
};
