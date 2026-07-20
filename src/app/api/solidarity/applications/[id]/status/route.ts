import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import type { SolidarityResolutionResult } from "@/lib/types";

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

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "solidarity.applications.status", {
    limit: 50,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id: applicationId } = await props.params;

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
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Solo la administración puede resolver solicitudes" },
        { status: 403 }
      );
    }

    const body: Record<string, unknown> = await request.json();
    const status = typeof body.status === "string" ? body.status : "";
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    const requestedAmount = body.amountApproved === undefined || body.amountApproved === null
      ? null
      : Number(body.amountApproved);
    if (status === "approved" && requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      return NextResponse.json({ error: "Monto aprobado inválido" }, { status: 400 });
    }

    const { data: resolutionData, error: resolutionError } = await supabaseAdmin.rpc(
      "resolve_solidarity_application",
      {
        p_community_id: profile.community_id,
        p_application_id: applicationId,
        p_status: status,
        p_amount_approved: status === "approved" ? requestedAmount : null,
      }
    );

    if (resolutionError) {
      console.error("[solidarity application] atomic resolution failed", resolutionError);
      if (resolutionError.message.includes("application-not-found")) {
        return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
      }
      if (resolutionError.message.includes("application-already-resolved")) {
        return NextResponse.json({ error: "Esta solicitud ya fue resuelta anteriormente" }, { status: 409 });
      }
      if (resolutionError.message.includes("invalid-approved-amount")) {
        return NextResponse.json({ error: "El monto aprobado no es válido" }, { status: 400 });
      }
      if (resolutionError.message.includes("insufficient-or-missing-fund")) {
        return NextResponse.json({ error: "El fondo no existe o no tiene saldo suficiente" }, { status: 400 });
      }
      return NextResponse.json({ error: "No se pudo resolver la solicitud" }, { status: 500 });
    }

    const resolution = (resolutionData?.[0] ?? null) as SolidarityResolutionResult | null;
    if (!resolution) {
      return NextResponse.json({ error: "No se pudo confirmar la resolución" }, { status: 500 });
    }

    const approved = status === "approved";
    const amount = Number(resolution.approved_amount || 0);
    const notification = approved
      ? {
          type: "success",
          title: "Solicitud de apoyo aprobada",
          body: `Tu solicitud de subsidio por $${amount.toLocaleString("es-CL")} ha sido aprobada. Puedes revisar los próximos pasos en Solidaridad Vecinal.`,
        }
      : {
          type: "alert",
          title: "Solicitud de apoyo rechazada",
          body: "Tu solicitud fue revisada y no fue aprobada en esta ocasión. Comunícate con Administración si necesitas más información.",
        };

    const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
      user_id: resolution.user_id,
      type: notification.type,
      category: "payment",
      title: notification.title,
      body: notification.body,
      link: "/expenses/solidaridad",
      community_id: profile.community_id,
    });
    if (notifyError) {
      console.error("[solidarity application] notification failed", notifyError);
    }

    return NextResponse.json({ success: true, status, approvedAmount: amount });
  } catch (error) {
    console.error("[solidarity application] resolution failed", error);
    return NextResponse.json({ error: "No se pudo resolver la solicitud" }, { status: 500 });
  }
}
