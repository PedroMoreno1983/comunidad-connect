import { NextRequest, NextResponse } from "next/server";
import { enforceDistributedRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";

function cleanText(value: unknown, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: NextRequest) {
  const limited = await enforceDistributedRateLimit(request, "solidarity.fund.get", { limit: 100, windowMs: 60_000 });
  if (limited) return limited;

  const profile = await getAuthenticatedAgentProfile();
  if (!profile?.community_id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const [{ data: storedFund, error: fundError }, { data: ledger, error: ledgerError }] = await Promise.all([
      admin.from("solidarity_funds").select("*").eq("community_id", profile.community_id).maybeSingle(),
      admin.from("solidarity_ledger").select("*").eq("community_id", profile.community_id).order("created_at", { ascending: false }),
    ]);

    if (fundError || ledgerError) {
      console.error("[solidarity] fund read failed", fundError || ledgerError);
      return NextResponse.json({ error: "No se pudo cargar el fondo." }, { status: 500 });
    }

    const fund = storedFund || {
      id: null,
      community_id: profile.community_id,
      balance: 0,
      updated_at: null,
    };
    return NextResponse.json({ fund, ledger: ledger || [] });
  } catch (error) {
    console.error("[solidarity] GET fund failed", error);
    return NextResponse.json({ error: "No se pudo cargar el fondo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await enforceDistributedRateLimit(request, "solidarity.fund.round_up", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const profile = await getAuthenticatedAgentProfile();
  if (!profile?.community_id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const amount = Number(body.amount);
    const type = cleanText(body.type);
    const expenseId = cleanText(body.expenseId);

    if (!Number.isFinite(amount) || amount <= 0 || amount > 999) {
      return NextResponse.json({ error: "El redondeo debe estar entre $1 y $999." }, { status: 400 });
    }
    if (type !== "round_up" || !expenseId) {
      return NextResponse.json({ error: "Solo se permiten redondeos asociados a un gasto pagado." }, { status: 400 });
    }

    const { data: newBalance, error } = await getSupabaseAdmin().rpc(
      "apply_verified_solidarity_round_up",
      {
        p_community_id: profile.community_id,
        p_user_id: profile.id,
        p_expense_id: expenseId,
        p_amount: amount,
      },
    );

    if (error) {
      console.error("[solidarity] verified round-up failed", error);
      return NextResponse.json({ error: "El gasto no está pagado, no te pertenece o el redondeo ya fue registrado." }, { status: 409 });
    }
    return NextResponse.json({ success: true, newBalance: Number(newBalance) });
  } catch (error) {
    console.error("[solidarity] POST round-up failed", error);
    return NextResponse.json({ error: "No se pudo registrar el redondeo." }, { status: 500 });
  }
}
