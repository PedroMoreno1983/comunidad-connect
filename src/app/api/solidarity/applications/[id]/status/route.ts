import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceRateLimit } from "@/lib/security/rateLimit";

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
  const params = await props.params;
  const limited = enforceRateLimit(request, "solidarity.applications.status", { limit: 50, windowMs: 60_000 });
  if (limited) return limited;

  const { id: applicationId } = params;

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
      return NextResponse.json({ error: "Solo la administración puede resolver solicitudes" }, { status: 403 });
    }

    const { status, amountApproved } = await request.json();

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    // 1. Fetch application details
    const { data: app, error: appError } = await supabaseAdmin
      .from("solidarity_applications")
      .select("*")
      .eq("id", applicationId)
      .eq("community_id", profile.community_id)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    if (app.status !== "pending") {
      return NextResponse.json({ error: "Esta solicitud ya fue resuelta anteriormente" }, { status: 400 });
    }

    const approvedAmount = status === "approved" ? Number(amountApproved || app.amount_requested) : 0.00;

    if (status === "approved") {
      // 2. Fetch current balance
      const { data: fund, error: fundFetchError } = await supabaseAdmin
        .from("solidarity_funds")
        .select("balance")
        .eq("community_id", profile.community_id)
        .single();

      if (fundFetchError || !fund) {
        return NextResponse.json({ error: "Fondo solidario no configurado para esta comunidad" }, { status: 500 });
      }

      if (Number(fund.balance) < approvedAmount) {
        return NextResponse.json({ error: "Fondos insuficientes en el pozo solidario" }, { status: 400 });
      }

      const newBalance = Number(fund.balance) - approvedAmount;

      // 3. Update fund balance
      const { error: updateFundError } = await supabaseAdmin
        .from("solidarity_funds")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("community_id", profile.community_id);

      if (updateFundError) {
        return NextResponse.json({ error: "Error al debitar fondos: " + updateFundError.message }, { status: 500 });
      }

      // 4. Update application status
      const { error: updateAppError } = await supabaseAdmin
        .from("solidarity_applications")
        .update({
          status: "approved",
          amount_approved: approvedAmount,
          resolved_at: new Date().toISOString()
        })
        .eq("id", applicationId);

      if (updateAppError) {
        return NextResponse.json({ error: "Error al actualizar solicitud: " + updateAppError.message }, { status: 500 });
      }

      // 5. Log to ledger (anonymized!)
      const categoryLabels: Record<string, string> = {
        unemployment: "Subsidio por cesantía temporal",
        pensioner: "Subsidio de tercera edad",
        medical: "Subsidio por emergencia médica catastrófica",
        emergency: "Subsidio por emergencia familiar severa",
      };
      const categoryLabel = categoryLabels[app.category] || "Apoyo mutuo de emergencia";
      const ledgerDescription = `${categoryLabel} aplicado a cubrir saldo de gasto común de una Unidad Anónima (Programa Solidario). Subsidio de $${approvedAmount.toLocaleString("es-CL")} CLP`;

      const { error: ledgerError } = await supabaseAdmin
        .from("solidarity_ledger")
        .insert({
          community_id: profile.community_id,
          entry_type: "subsidize",
          amount: approvedAmount,
          hours: 0.0,
          description: ledgerDescription
        });

      if (ledgerError) {
        console.error("[solidarity] failed to log subsidize to ledger:", ledgerError);
      }

      // 6. Send notification to resident
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: app.user_id,
          type: "success",
          category: "payment",
          title: "Solicitud de apoyo aprobada",
          body: `Tu solicitud de subsidio por $${approvedAmount.toLocaleString("es-CL")} ha sido aprobada. Se aplicará a tu gasto común y puedes programar tus horas de retribución en el módulo Solidaridad Vecinal.`,
          link: "/expenses/solidaridad",
          community_id: profile.community_id
        });

      if (notifyError) {
        console.error("[solidarity] failed to send success notification:", notifyError);
      }

    } else {
      // Reject application
      const { error: updateAppError } = await supabaseAdmin
        .from("solidarity_applications")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString()
        })
        .eq("id", applicationId);

      if (updateAppError) {
        return NextResponse.json({ error: updateAppError.message }, { status: 500 });
      }

      // Send notification to resident
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: app.user_id,
          type: "alert",
          category: "payment",
          title: "Solicitud de apoyo rechazada",
          body: `Tu solicitud de subsidio ha sido revisada por la administración y no fue aprobada en esta ocasión. Comunícate con Administración si tienes dudas.`,
          link: "/expenses/solidaridad",
          community_id: profile.community_id
        });

      if (notifyError) {
        console.error("[solidarity] failed to send rejection notification:", notifyError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[solidarity] PATCH application failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
