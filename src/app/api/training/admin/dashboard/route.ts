import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type {
    TrainingAssignmentRecord,
    TrainingAttemptRecord,
    TrainingComplianceDashboard,
    TrainingStaffMember,
} from '@/lib/types';

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.admin.dashboard', { limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede revisar el cumplimiento.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const [staffResult, assignmentResult, moduleResult, versionResult, certificateResult] = await Promise.all([
        supabase.from('profiles').select('id,name,email,role').eq('community_id', profile.community_id).in('role', ['admin', 'concierge']).order('name'),
        supabase.from('training_assignments').select('id,module_id,user_id,community_id,assigned_by,module_version,mandatory,due_at,status,assigned_at,completed_at,updated_at').eq('community_id', profile.community_id).neq('status', 'cancelled').order('assigned_at', { ascending: false }),
        supabase.from('training_modules').select('id,title,target_audience').or(`community_id.is.null,community_id.eq.${profile.community_id}`),
        supabase.from('training_module_versions').select('id,module_id,version_number,change_summary,quality_score,created_at,created_by').or(`community_id.is.null,community_id.eq.${profile.community_id}`).order('created_at', { ascending: false }),
        supabase.from('training_certificates').select('id,attempt_id,module_id,user_id,community_id,certificate_number,issued_at,revoked_at').eq('community_id', profile.community_id),
    ]);
    const error = staffResult.error || assignmentResult.error || moduleResult.error || versionResult.error || certificateResult.error;
    if (error) {
        console.error('[training/admin/dashboard] Read failed:', error.message);
        return NextResponse.json({ error: 'No se pudo cargar el panel de cumplimiento.' }, { status: 500 });
    }

    const attemptRows: TrainingAttemptRecord[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error: attemptError } = await supabase.from('training_attempts')
            .select('id,module_id,user_id,community_id,assignment_id,module_version,attempt_number,status,score,passed,completion_source,started_at,completed_at,updated_at')
            .eq('community_id', profile.community_id)
            .order('id')
            .range(offset, offset + 999);
        if (attemptError) return NextResponse.json({ error: 'No se pudieron cargar los intentos.' }, { status: 500 });
        attemptRows.push(...(data || []) as TrainingAttemptRecord[]);
        if (!data || data.length < 1000) break;
    }
    const staff = (staffResult.data || []) as TrainingStaffMember[];
    const certificateByAttempt = new Map((certificateResult.data || []).map(certificate => [certificate.attempt_id, certificate]));
    const attempts = attemptRows.map(attempt => ({ ...attempt, certificate: certificateByAttempt.get(attempt.id) || null }))
        .sort((a, b) => b.attempt_number - a.attempt_number);
    const moduleByAttempt = new Map(attempts.map(attempt => [attempt.id, attempt.module_id]));
    const learningByModule = new Map<string, { module_id: string; firstTryCorrect: number; firstTryTotal: number; delayedCorrect: number; delayedTotal: number }>();
    const metricFor = (moduleId: string) => {
        let metric = learningByModule.get(moduleId);
        if (!metric) {
            metric = { module_id: moduleId, firstTryCorrect: 0, firstTryTotal: 0, delayedCorrect: 0, delayedTotal: 0 };
            learningByModule.set(moduleId, metric);
        }
        return metric;
    };
    for (let start = 0; start < attempts.length; start += 50) {
        const ids = attempts.slice(start, start + 50).map(attempt => attempt.id);
        let offset = 0;
        while (ids.length) {
            const { data: responses, error: responseError } = await supabase.from('training_activity_responses')
                .select('attempt_id,slide_id,response_number,is_correct')
                .in('attempt_id', ids)
                .order('id')
                .range(offset, offset + 999);
            if (responseError) return NextResponse.json({ error: 'No se pudo cargar la evidencia de aprendizaje.' }, { status: 500 });
            for (const response of responses || []) {
                if (response.response_number !== 1) continue;
                const moduleId = moduleByAttempt.get(response.attempt_id);
                if (!moduleId) continue;
                const metric = metricFor(moduleId);
                metric.firstTryTotal++;
                if (response.is_correct) metric.firstTryCorrect++;
            }
            if (!responses || responses.length < 1000) break;
            offset += 1000;
        }
    }
    for (let offset = 0; ; offset += 1000) {
        const { data: reviews, error: reviewError } = await supabase.from('training_retention_checks')
            .select('module_id,is_correct')
            .eq('community_id', profile.community_id)
            .order('id')
            .range(offset, offset + 999);
        if (reviewError) return NextResponse.json({ error: 'No se pudo cargar el repaso diferido.' }, { status: 500 });
        for (const review of reviews || []) {
            const metric = metricFor(review.module_id);
            metric.delayedTotal++;
            if (review.is_correct) metric.delayedCorrect++;
        }
        if (!reviews || reviews.length < 1000) break;
    }
    const staffById = new Map(staff.map(member => [member.id, member]));
    const moduleById = new Map((moduleResult.data || []).map(module => [module.id, module]));
    const latestAttemptByAssignment = new Map<string, TrainingAttemptRecord>();
    for (const attempt of attempts) {
        if (attempt.assignment_id && !latestAttemptByAssignment.has(attempt.assignment_id)) {
            latestAttemptByAssignment.set(attempt.assignment_id, attempt);
        }
    }
    const assignments = (assignmentResult.data || []).map(item => ({
        ...item,
        user: staffById.get(item.user_id) || null,
        module: moduleById.get(item.module_id) || null,
        latest_attempt: latestAttemptByAssignment.get(item.id) || null,
    })) as TrainingAssignmentRecord[];
    const now = Date.now();
    const completed = assignments.filter(item => item.status === 'completed').length;
    const inProgress = assignments.filter(item => item.status === 'in_progress').length;
    const overdue = assignments.filter(item => item.status !== 'completed' && item.due_at && new Date(item.due_at).getTime() < now).length;
    const assigned = assignments.length;
    const dashboard: TrainingComplianceDashboard = {
        summary: {
            assigned,
            completed,
            inProgress,
            overdue,
            completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
        },
        staff,
        assignments,
        versions: (versionResult.data || []) as TrainingComplianceDashboard['versions'],
        learning: [...learningByModule.values()],
    };
    return NextResponse.json(dashboard);
}
