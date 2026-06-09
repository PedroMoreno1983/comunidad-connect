import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceRateLimit } from "@/lib/security/rateLimit";

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
        .select("id")
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
            .select("id")
            .single();
        data = retry.data;
        error = retry.error;
    }

    if (error) throw error;
    if (!data?.id) throw new Error("No se pudo crear la comunidad.");
    return String(data.id);
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
    const limited = enforceRateLimit(req, "admin_onboarding.register", { limit: 8, windowMs: 60_000 });
    if (limited) return limited;

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

        const admin = getSupabaseAdmin();
        const { data: userData, error: userError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name: fullName, role: "admin" },
        });
        if (userError) throw userError;
        const userId = userData.user?.id;
        if (!userId) throw new Error("No se pudo crear el usuario administrador.");

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

        const communityId = await insertCommunity(communityPayload);

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

        return NextResponse.json({ ok: true, communityId, userId });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "No se pudo registrar el edificio.";
        console.error("[admin-onboarding/register]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
