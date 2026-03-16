import { NextResponse } from "next/server";

import { listImportRuns } from "@/lib/ingestion/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") ?? undefined;
  const runs = await listImportRuns(companyId);

  return NextResponse.json({ runs });
}
