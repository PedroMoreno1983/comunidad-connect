import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  inferFileTypeFromName,
  parseUploadedFile,
} from "@/lib/ingestion/file-parser";
import { buildPreview } from "@/lib/ingestion/service";
import { uploadPreviewRequestSchema } from "@/lib/validations/ingestion";

export const runtime = "nodejs";

function toBoolean(value: FormDataEntryValue | null) {
  return value === "true";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "Adjunta un archivo CSV o XLSX antes de generar el preview." },
        { status: 400 },
      );
    }

    const inferredFileType = inferFileTypeFromName(fileEntry.name);
    const previewRequest = uploadPreviewRequestSchema.parse({
      dataset: formData.get("dataset"),
      fileType: formData.get("fileType") ?? inferredFileType,
      hasHeader: toBoolean(formData.get("hasHeader")),
    });
    const parsedUpload = await parseUploadedFile(fileEntry, {
      fileType: previewRequest.fileType,
      hasHeader: previewRequest.hasHeader,
    });
    const preview = buildPreview(previewRequest.dataset, parsedUpload);

    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "El payload del preview no es valido.",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudo generar el preview.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
