import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceRateLimit } from "@/lib/security/rateLimit";

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_EMBEDDING_MODEL = process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3.5-lite";
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;

async function generateEmbedding(text: string): Promise<number[] | null> {
    if (!VOYAGE_API_KEY) {
        throw new Error("VOYAGE_API_KEY not configured");
    }

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${VOYAGE_API_KEY.trim()}`,
        },
        body: JSON.stringify({
            input: [text],
            model: VOYAGE_EMBEDDING_MODEL.trim(),
            input_type: "document", // 'document' type is optimized for indexing
            output_dimension: 1024,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Voyage API returned ${response.status}: ${body}`);
    }

    const payload = await response.json();
    return payload?.data?.[0]?.embedding ?? null;
}

// POST /api/marketplace-items/embed
// Designed to be triggered by a Supabase Database Webhook on INSERT/UPDATE
export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, "marketplace.embed", { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    try {
        // --- Auth gate: validate internal webhook secret ---
        if (WEBHOOK_SECRET) {
            const token = req.headers.get("authorization")?.replace("Bearer ", "");
            if (token !== WEBHOOK_SECRET) {
                return NextResponse.json({ error: "No autorizado" }, { status: 401 });
            }
        } else if (process.env.NODE_ENV === "production") {
            return NextResponse.json({ error: "WHATSAPP_WEBHOOK_SECRET no configurado" }, { status: 500 });
        }

        const body = await req.json();
        
        // Supabase Webhook payload has { type: 'INSERT'|'UPDATE'|'DELETE', record: {...}, old_record: {...} }
        const type = body.type; // INSERT, UPDATE, etc.
        
        // If it's a DELETE event, skip processing
        if (type === "DELETE") {
            return NextResponse.json({ skipped: true, reason: "DELETE event" });
        }

        // Extract record. Webhooks put new data under 'record', fallback to root for direct calls
        const record = body.record || body;
        const id = record.id;

        if (!id) {
            return NextResponse.json({ error: "Missing record id" }, { status: 400 });
        }

        // Format document text for Voyage embedding
        const text = [
            record.title,
            record.category,
            record.description,
            record.price ? `Precio ${record.price}` : "",
        ].filter(Boolean).join("\n");

        if (!text.trim()) {
            return NextResponse.json({ skipped: true, reason: "No descriptive text to embed" });
        }

        // Generate embedding vector
        const embedding = await generateEmbedding(text);
        
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error("Generated embedding is invalid or empty");
        }

        // Save embedding vector in the database (Service Role bypasses RLS)
        const adminClient = getSupabaseAdmin();
        const { error: updateError } = await adminClient
            .from("marketplace_items")
            .update({ embedding_voyage: embedding })
            .eq("id", id);

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({ success: true, id });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        console.error("[Embed Pipeline] Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
