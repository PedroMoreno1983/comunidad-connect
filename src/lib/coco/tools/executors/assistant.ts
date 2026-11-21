import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: assistant. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { runCreateUnit, runDistributeEqually, runSetUnitAlicuota } from '../../alicuotaTools';
import { createCommitteeReport } from '../../committeeReport';
import { listCommunityAgenda } from '../../communityAgenda';
import { publishCommunityDocument, searchCommunityDocuments } from '../../communityDocuments';
import { enqueueDelegatedTask, kickDelegatedTasks, parseDelegateNotice } from '../../delegatedTasks';
import { sendConfirmedEmailDraft } from '../../emailDraft';
import { readOfficialPage, searchPublicWeb } from '../../externalInfo';
import { createCalendarEvent, listCalendar, listGmail, sendGmail, withAdminGoogle } from '../../googleApi';
import { LEGAL_DRAFT_ADMIN_ONLY_MESSAGE, canDraftLegalDocuments } from '../../legalDraftMarker';
import { prepareLegalDraft } from '../../legalDrafts';
import { forgetCommunityFact, rememberCommunityFact, rememberFact } from '../../memory';
import { researchChileanLaw, type NormaResearchInput } from '../../normaResearch';
import { consultOfficialLegalSource } from '../../officialLegalSources';
import { platformGuide } from '../../platformMap';
import { resumeCoCoTask } from '../../resumeTask';
import { createRoutine, deleteRoutine, listRoutines, pauseRoutine } from '../../routineRunner';
import { coordinateSpecialists } from '../../specialistHandoff';
import { cancelCoCoReminder, createCoCoReminder, listCoCoReminders } from '@/lib/agent-center/cocoReminders';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, isStaff, scopedCommunity, scopedUnit } from '../shared';

export async function executeAssistantTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            case 'send_whatsapp_notification': {
                const secret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
                if (!secret) {
                    return {
                        success: false,
                        skipped: true,
                        error: 'WhatsApp interno no está configurado: falta WHATSAPP_WEBHOOK_SECRET.',
                    };
                }

                // Find all profiles for this unit
                if (!isStaff(userCtx)) return forbidden('Solo conserjería o administración pueden enviar WhatsApp a una unidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad destino.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('id, name')
                    .eq('community_id', communityId)
                    .eq('unit_id', unitId);
                
                if (!profiles || profiles.length === 0) {
                    return { error: 'No se encontraron residentes registrados con WhatsApp para ese departamento.' };
                }

                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : PUBLIC_SITE_URL;
                
                let successCount = 0;
                let skippedCount = 0;
                let failedCount = 0;
                for (const p of profiles) {
                    const res = await fetch(`${baseUrl}/api/whatsapp-notify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${secret}`
                        },
                        body: JSON.stringify({
                            user_id: p.id,
                            title: 'Notificación de CoCo',
                            body: input.message,
                            type: 'info'
                        })
                    });
                    const delivery = await res.json().catch(() => ({})) as { success?: boolean; skipped?: boolean };
                    if (res.ok && delivery.success) successCount++;
                    else if (res.ok && delivery.skipped) skippedCount++;
                    else failedCount++;
                }
                
                return { 
                    success: successCount > 0,
                    sent: successCount,
                    skipped: skippedCount,
                    failed: failedCount,
                    message: successCount > 0
                        ? `Mensaje de WhatsApp enviado a ${successCount} residente(s) del departamento.`
                        : 'No se envio el WhatsApp porque ningun residente de la unidad tiene el canal habilitado.',
                };
            }

            case 'search_community_documents':
            case 'save_community_document': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const args = input as Record<string, unknown>;
                if (name === 'search_community_documents') {
                    const hits = await searchCommunityDocuments(communityId, userCtx.user_id, String(args.query || ''));
                    return hits.length
                        ? { results: hits }
                        : { results: [], message: 'No encontré eso en los documentos de la comunidad. Si el reglamento no está cargado, la administración puede adjuntarlo en el chat.' };
                }
                if (!isAdmin(userCtx)) return { error: 'Solo la administración puede publicar documentos para la comunidad.' };
                return publishCommunityDocument({ communityId, adminId: userCtx.user_id, documentId: String(args.document_id || ''), title: typeof args.title === 'string' ? args.title : undefined, kind: String(args.kind || '') });
            }

            // ── MEMORIA ──────────────────────────────────────────────────────
            case 'get_platform_guide': {
                const query = (input.query || '').trim().slice(0, 300);
                if (!query) return { error: 'Dime qué quieres hacer o encontrar.' };
                return platformGuide(query, userCtx.role, userCtx.currentPage, PUBLIC_SITE_URL);
            }

            case 'consult_official_legal_source': {
                return consultOfficialLegalSource(input.source || '', (input.query || '').slice(0, 180));
            }

            case 'research_chilean_law': {
                // El modelo manda limit como número y convert como arreglo, aunque la
                // firma de executeTool diga string. researchChileanLaw valida cada campo.
                return researchChileanLaw({ ...(input as unknown as NormaResearchInput), syncReply: userCtx.syncReply });
            }

            case 'search_public_web': {
                return searchPublicWeb(input.query || '');
            }

            case 'read_official_page': {
                return readOfficialPage(input.url || '', input.query || '');
            }

            case 'list_community_agenda': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                return listCommunityAgenda(communityId, userCtx.role, userCtx.user_id);
            }

            case 'draft_outbound_email': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración puede preparar un correo.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar la comunidad.');
                return sendConfirmedEmailDraft({
                    communityId,
                    createdBy: userCtx.user_id,
                    to: input.to || '',
                    subject: input.subject || '',
                    body: input.body || '',
                });
            }

            case 'prepare_legal_draft': {
                if (!canDraftLegalDocuments(userCtx.role)) return { error: LEGAL_DRAFT_ADMIN_ONLY_MESSAGE };
                return prepareLegalDraft({
                    document_type: String(input.document_type || ''),
                    known_data: input.known_data && typeof input.known_data === 'object' ? input.known_data as Record<string, unknown> : {},
                    extra_queries: Array.isArray(input.extra_queries) ? input.extra_queries as Array<{ source?: string; query?: string }> : [],
                });
            }

            case 'create_routine': {
                if (userCtx.role !== 'admin' || !userCtx.user_id || !userCtx.community_id) {
                    return { error: 'Solo la administración puede crear una rutina.' };
                }
                return createRoutine({ communityId: userCtx.community_id, userId: userCtx.user_id, request: input.request || '' });
            }

            case 'list_routines': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || userCtx.role !== 'admin') return { error: 'Solo la administración puede ver las rutinas.' };
                return listRoutines(communityId);
            }

            case 'pause_routine': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || userCtx.role !== 'admin') return { error: 'Solo la administración puede pausar una rutina.' };
                return pauseRoutine(communityId, input.routine_id || '');
            }

            case 'delete_routine': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || userCtx.role !== 'admin') return { error: 'Solo la administración puede borrar una rutina.' };
                return deleteRoutine(communityId, input.routine_id || '');
            }

            case 'coordinate_specialists': {
                if (userCtx.role !== 'admin' || !userCtx.user_id || !userCtx.community_id) {
                    return { error: 'Solo la administración puede coordinar a los Cocos.' };
                }
                return coordinateSpecialists({
                    id: userCtx.user_id,
                    role: 'admin',
                    community_id: userCtx.community_id,
                    name: userCtx.name,
                }, input.request || '');
            }

            case 'list_my_gmail': {
                if (userCtx.role !== 'admin') return { error: 'Solo el administrador conectado puede leer su Gmail.' };
                return withAdminGoogle(userCtx.user_id, token => listGmail(token));
            }

            case 'list_my_calendar': {
                if (userCtx.role !== 'admin') return { error: 'Solo el administrador conectado puede leer su calendario.' };
                return withAdminGoogle(userCtx.user_id, token => listCalendar(token));
            }

            case 'send_gmail': {
                if (userCtx.role !== 'admin') return { error: 'Solo el administrador puede enviar desde su Gmail.' };
                return withAdminGoogle(userCtx.user_id, token => sendGmail(token, {
                    to: input.to || '',
                    subject: input.subject || '',
                    body: input.body || '',
                }));
            }

            case 'create_calendar_event': {
                if (userCtx.role !== 'admin') return { error: 'Solo el administrador puede crear eventos en su calendario.' };
                return withAdminGoogle(userCtx.user_id, token => createCalendarEvent(token, {
                    title: input.title || '',
                    start: input.start || '',
                    end: input.end || '',
                }));
            }

            case 'delegate_background_task': {
                if (userCtx.role !== 'admin' || !userCtx.user_id || !userCtx.community_id) {
                    return { error: 'Solo la administración puede dejar una tarea en segundo plano.' };
                }
                const goal = (input.goal || '').trim();
                if (goal.length < 8) return { error: 'Dime qué hay que revisar.' };
                const taskId = await enqueueDelegatedTask({
                    id: userCtx.user_id,
                    role: 'admin',
                    community_id: userCtx.community_id,
                    name: userCtx.name,
                }, goal, parseDelegateNotice(input.notify));
                await kickDelegatedTasks();
                return { success: true, task_id: taskId, message: 'La dejé en segundo plano. Te aviso cuando termine.' };
            }

            case 'draft_committee_report': {
                if (userCtx.role !== 'admin' || !userCtx.user_id || !userCtx.community_id) {
                    return { error: 'Solo la administración puede preparar el informe del comité.' };
                }
                return createCommitteeReport({
                    communityId: userCtx.community_id,
                    createdBy: userCtx.user_id,
                    requestedTitle: input.title,
                });
            }

            case 'resume_agent_task': {
                if (userCtx.role !== 'admin') return { error: 'Solo la administración puede retomar una tarea.' };
                if (!userCtx.user_id || !userCtx.community_id) return { error: 'No pude identificar la comunidad.' };
                try {
                    const resumed = await resumeCoCoTask({
                        id: userCtx.user_id,
                        role: 'admin',
                        community_id: userCtx.community_id,
                        name: userCtx.name,
                    }, (input.task_id || '').trim());
                    return { success: true, task_id: input.task_id, message: resumed.message };
                } catch (resumeError) {
                    return { error: resumeError instanceof Error ? resumeError.message : 'No se pudo retomar la tarea.' };
                }
            }

            case 'remember_preference': {
                if (!userCtx.user_id) return { error: 'No pude identificarte para guardar el recuerdo.' };
                const fact = (input.fact || '').trim();
                if (!fact) return { error: 'No hay nada que recordar.' };
                const facts = await rememberFact(userCtx.user_id, userCtx.community_id ?? null, fact, userCtx.role || 'resident');
                return { success: true, remembered: fact, total_facts: facts.length };
            }

            case 'remember_community_fact': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración puede guardar la memoria de la comunidad.' };
                const actor = { userId: userCtx.user_id, role: userCtx.role, communityId: userCtx.community_id };
                const action = (input.action || 'save').trim();
                if (action === 'forget') return forgetCommunityFact(actor, input.fact || '');
                return rememberCommunityFact(actor, input.fact || '', (input.category || 'general').trim());
            }

            case 'create_reminder':
                return createCoCoReminder(userCtx, input);

            case 'list_reminders':
                return listCoCoReminders(userCtx);

            case 'cancel_reminder':
                return cancelCoCoReminder(userCtx, input.reminder_id || '');

            // ── ADMIN · GASTO COMÚN ──────────────────────────────────────────
            case 'create_unit': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden crear unidades.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                return runCreateUnit({ communityId, userId: userCtx.user_id, name: userCtx.name }, input);
            }

            case 'set_unit_alicuota': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden fijar alícuotas.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad no existe en tu comunidad.');
                return runSetUnitAlicuota({ communityId, userId: userCtx.user_id, name: userCtx.name }, unitId, input);
            }

            case 'distribute_alicuotas_equally': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden repartir alícuotas.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                return runDistributeEqually({ communityId, userId: userCtx.user_id, name: userCtx.name }, input);
            }

            case 'schedule_community_notice': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden programar un aviso.' };
                return createCoCoReminder(userCtx, { ...input, audience: 'community_notice', whatsapp: 'false' });
            }

            default:
                return NOT_HANDLED;
        }
}
