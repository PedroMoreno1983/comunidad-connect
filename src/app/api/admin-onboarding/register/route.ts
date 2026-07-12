import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceDistributedRateLimit } from "@/lib/security/rateLimit";
import { sendWelcomeEmail, resend, FROM_EMAIL, SUPERADMIN_EMAIL, emailWrapper } from "@/lib/email";
import { PUBLIC_SITE_URL } from "@/lib/config";

type GeocodeSelection = {
    label?: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
    source?: string;
};

function cleanText(value: unknown, max = 200) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanEmail(value: unknown) {
    return cleanText(value, 180).toLowerCase();
}

function cleanUnitCount(value: unknown) {
    const count = Number(value);
    if (!Number.isFinite(count)) return 0;
    return Math.max(0, Math.min(800, Math.floor(count)));
}

function isEmail(value: string) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function sendOnboardingEmails(input: {
    fullName: string;
    email: string;
    communityName: string;
    address: string;
    planId: string;
}) {
    const safeName = escapeHtml(input.fullName);
    const safeCommunity = escapeHtml(input.communityName);
    const safeAddress = escapeHtml(input.address || "Sin dirección informada");
    const safePlan = escapeHtml(input.planId || "Por definir");

    await Promise.allSettled([
        sendWelcomeEmail({
            to: input.email,
            residentName: input.fullName,
            unitName: "Administración",
            condoName: input.communityName,
        }),
        resend.emails.send({
            from: FROM_EMAIL,
            to: [SUPERADMIN_EMAIL],
            subject: `Nuevo edificio: ${input.communityName}`,
            html: emailWrapper(`
                <h1 style="margin:0 0 16px;font-size:24px;color:#1e293b">Nuevo edificio registrado</h1>
                <p><strong>Condominio:</strong> ${safeCommunity}</p>
                <p><strong>Dirección:</strong> ${safeAddress}</p>
                <p><strong>Plan:</strong> ${safePlan}</p>
                <p><strong>Administrador:</strong> ${safeName} &lt;${escapeHtml(input.email)}&gt;</p>
                <p><a href="${PUBLIC_SITE_URL}/superadmin">Abrir SuperAdmin</a></p>
            `, "Nuevo edificio registrado"),
        }),
    ]);
}

function isExistingAuthUserError(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const row = error as { message?: unknown; status?: unknown; code?: unknown };
    const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
    const status = typeof row.status === "number" ? row.status : Number(row.status);
    const code = typeof row.code === "string" ? row.code.toLowerCase() : "";

    return (
        status === 422
        || code.includes("user_already")
        || message.includes("already been registered")
        || message.includes("already registered")
        || message.includes("already exists")
    );
}

function selectedAddressFrom(value: unknown): GeocodeSelection | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
        label: cleanText(row.label, 300),
        latitude,
        longitude,
        placeId: cleanText(row.placeId, 180),
        source: cleanText(row.source, 60),
    };
}

async function insertCommunity(payload: Record<string, unknown>) {
    const admin = getSupabaseAdmin();
    let { data, error } = await admin
        .from("communities")
        .insert(payload)
        .select("id,admin_code")
        .single();

    const errorMessage = error?.message || "";
    const canRetryWithoutGeocode = errorMessage
        && ["address_latitude", "address_longitude", "address_place_id", "address_geocoding_source"]
            .some(column => errorMessage.includes(column));

    if (canRetryWithoutGeocode) {
        const retryPayload = { ...payload };
        delete retryPayload.address_latitude;
        delete retryPayload.address_longitude;
        delete retryPayload.address_place_id;
        delete retryPayload.address_geocoding_source;
        const retry = await admin
            .from("communities")
            .insert(retryPayload)
            .select("id,admin_code")
            .single();
        data = retry.data;
        error = retry.error;
    }

    if (error) throw error;
    if (!data?.id || !data.admin_code) throw new Error("No se pudo crear la comunidad.");
    return { id: String(data.id), adminCode: String(data.admin_code) };
}

async function createSeedUnits(communityId: string, count: number) {
    if (count <= 0) return;

    const rows = Array.from({ length: count }, (_item, index) => {
        const number = String(index + 1).padStart(3, "0");
        return {
            community_id: communityId,
            tower: "A",
            number,
            floor: Math.max(1, Math.ceil((index + 1) / 10)),
            type: "apartment",
        };
    });

    const { error } = await getSupabaseAdmin().from("units").insert(rows);
    if (error) throw error;
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, "admin_onboarding.register", { limit: 5, windowMs: 60_000 });
    if (limited) return limited;

    let createdCommunityId: string | null = null;
    let createdUserId: string | null = null;

    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const fullName = cleanText(body.fullName, 140);
        const email = cleanEmail(body.email);
        const password = cleanText(body.password, 200);
        const communityName = cleanText(body.communityName, 180);
        const address = cleanText(body.address, 300);
        const planId = cleanText(body.planId, 80);
        const units = cleanUnitCount(body.units);
        const selectedAddress = selectedAddressFrom(body.selectedAddress);

        if (!fullName) return NextResponse.json({ error: "Ingresa tu nombre." }, { status: 400 });
        if (!isEmail(email)) return NextResponse.json({ error: "Email invalido." }, { status: 400 });
        if (password.length < 6) return NextResponse.json({ error: "La contrasena debe tener al menos 6 caracteres." }, { status: 400 });
        if (!communityName) return NextResponse.json({ error: "Ingresa el nombre del edificio." }, { status: 400 });

        const communityPayload: Record<string, unknown> = {
            name: communityName,
            subscription_status: "trialing",
        };
        if (address) communityPayload.address = address;
        if (planId) communityPayload.tier_id = planId;
        if (selectedAddress) {
            communityPayload.address_latitude = selectedAddress.latitude;
            communityPayload.address_longitude = selectedAddress.longitude;
            communityPayload.address_place_id = selectedAddress.placeId;
            communityPayload.address_geocoding_source = selectedAddress.source;
        }

        const community = await insertCommunity(communityPayload);
        const communityId = community.id;
        createdCommunityId = communityId;

        const admin = getSupabaseAdmin();
        const { data: userData, error: userError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: fullName,
                invite_code: community.adminCode,
                department_number: "Administración",
            },
        });
        if (isExistingAuthUserError(userError)) {
            await admin.from("communities").delete().eq("id", communityId);
            createdCommunityId = null;
            const loginUrl = `/login?next=%2Fadmin%2Fonboarding&email=${encodeURIComponent(email)}`;
            return NextResponse.json({
                code: "EMAIL_ALREADY_REGISTERED",
                error: "Este correo ya tiene una cuenta. Inicia sesion para continuar con la carga inteligente del edificio.",
                loginUrl,
            }, { status: 409 });
        }
        if (userError) throw userError;
        const userId = userData.user?.id;
        if (!userId) throw new Error("No se pudo crear el usuario administrador.");
        createdUserId = userId;

        const { error: profileError } = await admin
            .from("profiles")
            .upsert({
                id: userId,
                email,
                name: fullName,
                full_name: fullName,
                role: "admin",
                community_id: communityId,
            }, { onConflict: "id" });
        if (profileError) throw profileError;

        await createSeedUnits(communityId, units);

        await sendOnboardingEmails({ fullName, email, communityName, address, planId });

        createdCommunityId = null;
        createdUserId = null;

        return NextResponse.json({ ok: true, communityId, userId });
    } catch (error: unknown) {
        const admin = getSupabaseAdmin();
        if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
        if (createdCommunityId) await admin.from("communities").delete().eq("id", createdCommunityId);
        const message = error instanceof Error ? error.message : "No se pudo registrar el edificio.";
        console.error("[admin-onboarding/register]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
