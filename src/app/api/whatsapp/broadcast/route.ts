import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { sendWhatsAppNotificationForUser } from "@/lib/server/whatsappNotify";

/**
 * Aviso por WhatsApp a los residentes de una comunidad.
 *
 * Sale como plantilla, no como texto libre: un aviso lo inicia la
 * administración, y fuera de la ventana de 24 horas WhatsApp solo acepta
 * plantilla aprobada. El detalle largo del aviso no cabe ahí, así que el
 * título es lo que viaja y el resto queda en la plataforma.
 */

/**
 * WhatsApp limita cuántos destinatarios nuevos admite un remitente por día
 * (250 en el tramo inicial). Pasarse hace que Meta empiece a rechazar y baja la
 * calificación de calidad del número, así que se corta antes.
 */
const MAX_RECIPIENTS_PER_BROADCAST = 200;

type BroadcastRecipient = {
    id: string;
    name: string | null;
};

export async function POST(request: NextRequest) {
    // Un aviso masivo es caro y molesto si se dispara dos veces: el límite es bajo a propósito.
    const limited = enforceRateLimit(request, "whatsapp.broadcast", { limit: 3, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (profile.role !== "admin" || !profile.community_id) {
        return NextResponse.json(
            { error: "Solo la administración de una comunidad puede enviar avisos." },
            { status: 403 },
        );
    }

    let payload: { title?: unknown; body?: unknown; dryRun?: unknown };
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
    }

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const dryRun = payload.dryRun === true;

    if (!title) {
        return NextResponse.json({ error: "El aviso necesita un título." }, { status: 400 });
    }
    // La plantilla aprobada tiene un solo hueco: si el título no cabe, Meta rechaza el envío.
    if (title.length > 120) {
        return NextResponse.json(
            { error: "El título no puede pasar de 120 caracteres: es lo que viaja en la plantilla." },
            { status: 400 },
        );
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from("profiles")
        .select("id, name")
        .eq("community_id", profile.community_id)
        .eq("whatsapp_enabled", true)
        .not("phone_number", "is", null)
        .limit(MAX_RECIPIENTS_PER_BROADCAST + 1);

    if (error) {
        return NextResponse.json({ error: "No se pudo listar destinatarios." }, { status: 500 });
    }

    const all = (data || []) as BroadcastRecipient[];
    const truncated = all.length > MAX_RECIPIENTS_PER_BROADCAST;
    const recipients = all.slice(0, MAX_RECIPIENTS_PER_BROADCAST);

    // Permite ver a cuántos llegaría antes de gastar mensajes.
    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            recipients: recipients.length,
            truncated,
            limit: MAX_RECIPIENTS_PER_BROADCAST,
        });
    }

    if (recipients.length === 0) {
        return NextResponse.json({
            sent: 0,
            skipped: 0,
            failed: 0,
            recipients: 0,
            detail: "Ningún residente de la comunidad tiene WhatsApp activado con teléfono cargado.",
        });
    }

    const summary = { sent: 0, skipped: 0, failed: 0 };
    const failures: { userId: string; reason: string }[] = [];

    // Secuencial y no en paralelo: Twilio limita la tasa por remitente, y un
    // Promise.all de doscientos envíos se traduce en rechazos por throttling.
    for (const recipient of recipients) {
        const result = await sendWhatsAppNotificationForUser({
            userId: recipient.id,
            title,
            body,
            type: "info",
            communityId: profile.community_id,
            actorId: profile.id,
            templateKey: "community_notice",
            templateVariables: { "1": title },
            metadata: { source: "api.whatsapp.broadcast" },
        });

        if (result.status === "sent" || result.status === "queued") summary.sent += 1;
        else if (result.status === "skipped") summary.skipped += 1;
        else {
            summary.failed += 1;
            if (failures.length < 10) {
                failures.push({ userId: recipient.id, reason: result.reason || "error desconocido" });
            }
        }
    }

    return NextResponse.json({
        ...summary,
        recipients: recipients.length,
        truncated,
        failures,
    });
}
