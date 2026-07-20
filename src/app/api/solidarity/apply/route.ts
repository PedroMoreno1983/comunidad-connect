import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";

async function getSupabaseUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.apply.get", { limit: 100, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    let query = supabaseAdmin
      .from("solidarity_applications")
      .select(`
        *,
        profiles:user_id (name, email)
      `)
      .eq("community_id", profile.community_id);

    // If resident, filter to only show their own applications
    if (profile.role !== "admin") {
      query = query.eq("user_id", user.id);
    }

    const { data: applications, error: queryError } = await query.order("created_at", { ascending: false });

    if (queryError) {
      console.error('[solidarity] application query failed:', queryError);
      return NextResponse.json({ error: 'No se pudieron cargar las postulaciones.' }, { status: 500 });
    }

    return NextResponse.json(applications || []);
  } catch (error) {
    console.error("[solidarity] GET applications failed:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar las postulaciones." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.apply.post", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const { category, description, amountRequested, sensitiveConsent } = await request.json();
    const amount = Number(amountRequested);

    if (!category || !["unemployment", "pensioner", "medical", "emergency"].includes(category)) {
      return NextResponse.json({ error: "Categoría de postulación inválida" }, { status: 400 });
    }

    if (!description || description.trim().length < 10) {
      return NextResponse.json({ error: "Por favor describe brevemente tu situación" }, { status: 400 });
    }

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "El monto solicitado debe ser mayor a 0" }, { status: 400 });
    }
    if (sensitiveConsent !== true) {
      return NextResponse.json({ error: "Debes autorizar expresamente el tratamiento de los datos sensibles incluidos en la postulación." }, { status: 400 });
    }

    const { data: application, error: insertError } = await supabaseAdmin
      .from("solidarity_applications")
      .insert({
        community_id: profile.community_id,
        user_id: user.id,
        category,
        description: description.trim(),
        amount_requested: amount,
        amount_approved: 0.00,
        status: "pending",
        sensitive_consent_at: new Date().toISOString(),
        sensitive_consent_version: PRIVACY_POLICY_VERSION,
        sensitive_consent_scope: "solidarity_application"
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[solidarity] application insert failed:", insertError);
      return NextResponse.json({ error: "No se pudo registrar la postulación." }, { status: 500 });
    }

    const { error: consentError } = await supabaseAdmin.from("privacy_consent_events").insert({
      user_id: user.id,
      community_id: profile.community_id,
      consent_type: "sensitive_data",
      action: "granted",
      policy_version: PRIVACY_POLICY_VERSION,
      channel: "privacy_center",
      subject_email: profile.email,
      evidence: { scope: "solidarity_application", application_id: application.id, explicit_checkbox: true },
    });
    if (consentError) {
      await supabaseAdmin.from("solidarity_applications").delete().eq("id", application.id).eq("user_id", user.id);
      console.error("[solidarity] consent evidence failed:", consentError);
      return NextResponse.json({ error: "No se pudo guardar la evidencia de consentimiento." }, { status: 500 });
    }

    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    console.error("[solidarity] POST application failed:", error);
    return NextResponse.json(
      { error: "No se pudo registrar la postulación." },
      { status: 500 }
    );
  }
}
