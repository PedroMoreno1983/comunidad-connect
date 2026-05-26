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

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.fund.get", { limit: 100, windowMs: 60_000 });
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

    // Fetch fund balance
    let { data: fund, error: fundError } = await supabaseAdmin
      .from("solidarity_funds")
      .select("*")
      .eq("community_id", profile.community_id)
      .maybeSingle();

    if (fundError) {
      return NextResponse.json({ error: fundError.message }, { status: 500 });
    }

    // Auto-create if not seeded yet
    if (!fund) {
      const { data: newFund, error: createError } = await supabaseAdmin
        .from("solidarity_funds")
        .insert({ community_id: profile.community_id, balance: 180000.00 })
        .select("*")
        .single();
      
      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      fund = newFund;
    }

    // Fetch ledger entries
    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from("solidarity_ledger")
      .select("*")
      .eq("community_id", profile.community_id)
      .order("created_at", { ascending: false });

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    return NextResponse.json({ fund, ledger: ledger || [] });
  } catch (error) {
    console.error("[solidarity] GET fund failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.fund.contribution", { limit: 50, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id, name, unit_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const { amount, type, expenseId } = await request.json();
    const contributionAmount = Number(amount);

    if (isNaN(contributionAmount) || contributionAmount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }

    if (!type || !["round_up", "donation"].includes(type)) {
      return NextResponse.json({ error: "Tipo de aporte inválido" }, { status: 400 });
    }

    // 1. Insert contribution record
    const { error: insertError } = await supabaseAdmin
      .from("solidarity_contributions")
      .insert({
        community_id: profile.community_id,
        user_id: user.id,
        amount: contributionAmount,
        type,
        expense_id: expenseId || null
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 2. Fetch current balance
    const { data: fund, error: fundFetchError } = await supabaseAdmin
      .from("solidarity_funds")
      .select("balance")
      .eq("community_id", profile.community_id)
      .single();

    if (fundFetchError || !fund) {
      return NextResponse.json({ error: "Fondo no encontrado" }, { status: 500 });
    }

    const newBalance = Number(fund.balance) + contributionAmount;

    // 3. Update balance
    const { error: updateError } = await supabaseAdmin
      .from("solidarity_funds")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("community_id", profile.community_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 4. Log to ledger
    const displayName = profile.name || "Residente";
    const typeLabel = type === "round_up" ? "Redondeo de cuenta" : "Aporte voluntario";
    const description = `${typeLabel} de un residente de la comunidad. Aporte de $${contributionAmount.toLocaleString("es-CL")} CLP`;

    const { error: ledgerError } = await supabaseAdmin
      .from("solidarity_ledger")
      .insert({
        community_id: profile.community_id,
        entry_type: "contribution",
        amount: contributionAmount,
        hours: 0.0,
        description
      });

    if (ledgerError) {
      console.error("[solidarity] failed to log contribution to ledger:", ledgerError);
    }

    return NextResponse.json({ success: true, newBalance });
  } catch (error) {
    console.error("[solidarity] POST contribution failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
