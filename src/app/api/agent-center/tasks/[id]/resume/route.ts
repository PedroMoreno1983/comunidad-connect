import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getRecentAgentTasks } from '@/lib/agent-center/taskEngine';
import { resumeOperationalTask } from '@/lib/agent-center/taskPlaybooks';

export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id)
        return NextResponse.json({ error: 'Solo administración puede retomar tareas.' }, { status: 403 });
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 });
    try {
        const result = await resumeOperationalTask(profile, id);
        return NextResponse.json({ result, tasks: await getRecentAgentTasks(profile) });
    } catch (error) {
        console.error('[agent task resume]', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo retomar la tarea.' }, { status: 409 });
    }
}
