import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { enforceDistributedRateLimit, enforceRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { insertCommunityNotification } from "@/lib/server/data/notifications";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.tasks.get", { limit: 100, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!profile.community_id) {
      return NextResponse.json({ error: "Tu cuenta no está asociada a una comunidad." }, { status: 403 });
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
      console.error('[solidarity tasks] query failed', tasksError);
      return NextResponse.json({ error: 'No se pudieron cargar las tareas.' }, { status: 500 });
    }

    return NextResponse.json(tasks || []);
  } catch (error) {
    console.error("[solidarity] GET tasks failed:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar las tareas." },
      { status: 500 }
    );
  }
}

// Reserve a task
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "solidarity.tasks.reserve", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!profile.community_id) {
      return NextResponse.json({ error: "Tu cuenta no está asociada a una comunidad." }, { status: 403 });
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
        reserved_by: profile.id,
        reserved_at: new Date().toISOString()
      })
      .eq("id", taskId)
      .select("*")
      .single();

    if (updateError) {
      console.error('[solidarity tasks] reserve failed', updateError);
      return NextResponse.json({ error: 'No se pudo reservar la tarea.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error("[solidarity] POST reserve task failed:", error);
    return NextResponse.json(
      { error: "No se pudo reservar la tarea." },
      { status: 500 }
    );
  }
}

// Complete and verify task with PIN
export async function PUT(request: NextRequest) {
  const limited = await enforceDistributedRateLimit(request, "solidarity.tasks.verify", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!profile.community_id) {
      return NextResponse.json({ error: "Tu cuenta no está asociada a una comunidad." }, { status: 403 });
    }

    // Staff check: only admin or concierge can verify tasks
    if (profile.role !== "admin" && profile.role !== "concierge") {
      return NextResponse.json({ error: "Solo conserjes o administradores pueden verificar tareas" }, { status: 403 });
    }

    const { taskId, pinCode } = await request.json();

    if (!taskId || typeof pinCode !== "string" || !/^\d{4}$/.test(pinCode)) {
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

    const storedPin = Buffer.from(String(task.pin_code));
    const suppliedPin = Buffer.from(pinCode);
    if (storedPin.length !== suppliedPin.length || !timingSafeEqual(storedPin, suppliedPin)) {
      return NextResponse.json({ error: "Código PIN de supervisor incorrecto" }, { status: 403 });
    }

    // 2. Complete and verify
    const { error: updateError } = await supabaseAdmin
      .from("solidarity_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        verified_by: profile.id
      })
      .eq("id", taskId);

    if (updateError) {
      console.error('[solidarity tasks] completion failed', updateError);
      return NextResponse.json({ error: 'No se pudo completar la tarea.' }, { status: 500 });
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
      const { error: notifyError } = await insertCommunityNotification(supabaseAdmin, {
          userId: task.reserved_by,
          type: "success",
          category: "reservation",
          title: "Horas de retribución verificadas",
          body: `Se han verificado tus ${task.hours} horas de retribución por la tarea "${task.title}". ¡Gracias por tu aporte a la comunidad!`,
          link: "/expenses/solidaridad",
          communityId: profile.community_id
        });

      if (notifyError) {
        console.error("[solidarity] failed to notify worker:", notifyError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[solidarity] PUT verify task failed:", error);
    return NextResponse.json(
      { error: "No se pudo completar la tarea." },
      { status: 500 }
    );
  }
}
