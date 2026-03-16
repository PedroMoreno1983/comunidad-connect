import { NextResponse } from "next/server";

import { getEnvStatus } from "@/lib/validations/env";

export function GET() {
  const envStatus = getEnvStatus();

  return NextResponse.json({
    status: "ok",
    app: "DataWise People Analytics",
    phase: "Current MVP",
    databaseConfigured: envStatus.success,
    timestamp: new Date().toISOString(),
    envIssues: envStatus.success ? [] : envStatus.error.flatten().fieldErrors
  });
}
