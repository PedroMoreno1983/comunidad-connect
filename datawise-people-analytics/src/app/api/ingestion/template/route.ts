import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { buildCsvTemplate } from "@/lib/ingestion/templates";
import { datasetSchema } from "@/lib/validations/ingestion";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = datasetSchema.parse(searchParams.get("dataset"));
    const template = buildCsvTemplate(dataset);

    return new NextResponse(template.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${template.fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "El dataset solicitado para la plantilla no es valido.",
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudo generar la plantilla.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
