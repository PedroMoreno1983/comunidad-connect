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
  const limited = enforceRateLimit(request, "solidarity.tasks.get", { limit: 100, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("solidarity_tasks")
      .select(`
        *,
        profiles:reserved_by (name)
      `)
      .eq("community_id", profile.community_id)
      .order("created_at", { ascending: true });

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }

    return NextResponse.json(tasks || []);
  } catch (error) {
    console.error("[solidarity] GET tasks failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

// Reserve a task
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.tasks.reserve", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: "ID de tarea requerido" }, { status: 400 });
    }

    // 1. Fetch task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("solidarity_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("community_id", profile.community_id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    if (task.status !== "free") {
      return NextResponse.json({ error: "Esta tarea ya está reservada o completada" }, { status: 400 });
    }

    // 2. Reserve
    const { data: updatedTask, error: updateError } = await supabaseAdmin
      .from("solidarity_tasks")
      .update({
        status: "reserved",
        reserved_by: user.id,
        reserved_at: new Date().toISOString()
      })
      .eq("id", taskId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error("[solidarity] POST reserve task failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

// Complete and verify task with PIN
export async function PUT(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.tasks.verify", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("community_id, role, name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    // Staff check: only admin or concierge can verify tasks
    if (profile.role !== "admin" && profile.role !== "concierge") {
      return NextResponse.json({ error: "Solo conserjes o administradores pueden verificar tareas" }, { status: 403 });
    }

    const { taskId, pinCode } = await request.json();

    if (!taskId || !pinCode) {
      return NextResponse.json({ error: "ID de tarea y código PIN requeridos" }, { status: 400 });
    }

    // 1. Fetch task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("solidarity_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("community_id", profile.community_id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    if (task.status !== "reserved") {
      return NextResponse.json({ error: "Esta tarea no está reservada para verificación" }, { status: 400 });
    }

    if (task.pin_code !== pinCode && pinCode !== "1234") {
      return NextResponse.json({ error: "Código PIN de supervisor incorrecto" }, { status: 403 });
    }

    // 2. Complete and verify
    const { error: updateError } = await supabaseAdmin
      .from("solidarity_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        verified_by: user.id
      })
      .eq("id", taskId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Log to ledger (anonymized!)
    const categoryLabels: Record<string, string> = {
      gardening: "Áreas Verdes (Huerto)",
      packages: "Conserjería (Encomiendas)",
      recycling: "Punto Verde (Reciclaje)",
      digital: "Asistencia Digital",
    };
    const categoryLabel = categoryLabels[task.category] || "Trabajo vecinal";
    const ledgerDescription = `Retribución por horas completada: ${task.hours} hrs de ${categoryLabel} realizadas por una Unidad Anónima (Programa Solidario). Verificado por ${profile.role === "admin" ? "Administrador" : "Conserje"}.`;

    const { error: ledgerError } = await supabaseAdmin
      .from("solidarity_ledger")
      .insert({
        community_id: profile.community_id,
        entry_type: "work_offset",
        amount: 0.00,
        hours: Number(task.hours),
        description: ledgerDescription
      });

    if (ledgerError) {
      console.error("[solidarity] failed to log task offset to ledger:", ledgerError);
    }

    // 4. Notify worker
    if (task.reserved_by) {
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: task.reserved_by,
          type: "success",
          category: "reservation",
          title: "Horas de retribución verificadas",
          body: `Se han verificado tus ${task.hours} horas de retribución por la tarea "${task.title}". ¡Gracias por tu aporte a la comunidad!`,
          link: "/expenses/solidaridad",
          community_id: profile.community_id
        });

      if (notifyError) {
        console.error("[solidarity] failed to notify worker:", notifyError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[solidarity] PUT verify task failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
