import { NextResponse } from "next/server";

import { getDepartmentDashboard } from "@/lib/analytics/department-summary";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId") ?? undefined;
    const dashboard = await getDepartmentDashboard(companyId);

    if (!dashboard) {
      return NextResponse.json(
        { error: "No department dashboard is available." },
        { status: 404 },
      );
    }

    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load department dashboard.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
