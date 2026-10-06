const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');
loadEnvFile();

const baseUrl = process.env.QA_BASE_URL || 'https://conviveconnect.com';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cookieName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const runId = randomUUID().slice(0,8);
const communityIds = [randomUUID(),randomUUID()];
const users = [];
const checks = [];
const report = { generatedAt:new Date().toISOString(),baseUrl,passed:false,checks };
function check(value, message) { assert(value,message); checks.push(message); }
async function data(query) { const result = await query; if (result.error) throw new Error(result.error.message); return result.data; }
async function api(user, path, body) {
    const response = await fetch(`${baseUrl}${path}`, { method:'POST', headers:{'Content-Type':'application/json',Cookie:user.cookie},body:JSON.stringify(body || {}) });
    return {status:response.status, body:await response.json()};
}
async function patch(user, id, status) {
    const response = await fetch(`${baseUrl}/api/service-requests/${id}/status`, {method:'PATCH',headers:{'Content-Type':'application/json',Cookie:user.cookie},body:JSON.stringify({status})});
    return {status:response.status,body:await response.json()};
}
async function seedTask(user, key, keys) {
    const task = await data(admin.from('agent_tasks').insert({community_id:user.community,id:user.taskId = randomUUID(),created_by:user.id,
        agent_key:key.startsWith('finance')?'finance':'maintenance',playbook_key:key,goal:`QA recuperación ${runId}`,status:'escalated',last_error:'QA: interrupción sintética antes de completar'}).select('id').single());
    await data(admin.from('agent_task_steps').insert(keys.map((key,position)=>({task_id:task.id,position,step_key:key,title:`QA ${key}`,status:'failed',attempts:1}))));
    return task.id;
}
async function main() {
    try {
        for (const community of communityIds) {
            const created = await data(admin.from('communities').insert({id:community,name:`QA ciclo operacional ${runId}`,subscription_status:'active'}).select('id,admin_code,resident_code').single());
            for (const role of ['admin','resident']) {
                const password = `QA-${randomBytes(24).toString('base64url')}!`;
                const email = `ops-${role}-${randomUUID()}@qa.convive.local`;
                const result = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`QA ${role}`,invite_code:role==='admin'?created.admin_code:created.resident_code}});
                if (result.error || !result.data.user) throw new Error(result.error?.message || 'No se creó el usuario QA.');
                const user = {id:result.data.user.id,community,role}; users.push(user);
                await data(admin.from('profiles').upsert({id:user.id,name:`QA ${role}`,email,role,community_id:community}));
                user.client = createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
                const signed = await user.client.auth.signInWithPassword({email,password});
                if (signed.error) throw new Error(signed.error.message);
                user.cookie = `${cookieName}=base64-${Buffer.from(JSON.stringify(signed.data.session)).toString('base64url')}`;
            }
        }
        const [manager,resident,foreignManager,foreignResident] = users;
        const provider = await data(admin.from('service_providers').insert({community_id:manager.community,user_id:manager.id,name:`QA técnico ${runId}`,category:'general',contact_phone:'+56900000000',verified:true}).select('id').single());
        const requestId = randomUUID();
        const input = {id:requestId,provider_id:provider.id,preferred_date:'2026-10-10',preferred_time:'10:00',description:`QA ${runId}: no realizar trabajo real`};
        const created = await api(resident,'/api/service-requests',input);
        check(created.status===201,`API residente crea solicitud (${created.status}: ${created.body.error || 'OK'}).`);
        const notices = await data(admin.from('notifications').select('id,user_id').eq('community_id',manager.community).eq('category','service_request'));
        check(notices.some(n=>n.user_id===manager.id)&&notices.some(n=>n.user_id===resident.id),'Solicitud notifica al responsable y al residente.');
        check((await api(resident,'/api/service-requests',input)).status===200,'Repetir el mismo envío devuelve la solicitud ya creada.');
        const repeated = await data(admin.from('notifications').select('id').eq('community_id',manager.community).eq('category','service_request'));
        check(repeated.length===notices.length,'Reintentar la creación no duplica avisos.');
        check((await patch(foreignManager,requestId,'accepted')).status===403,'Otra comunidad no puede gestionar la solicitud.');
        check((await patch(resident,requestId,'completed')).status===409,'No se puede saltar de pendiente a completada.');
        check((await patch(manager,requestId,'accepted')).status===200,'Responsable acepta el servicio.');
        check((await patch(manager,requestId,'awaiting_confirmation')).status===200,'Responsable informa finalización.');
        check((await patch(manager,requestId,'completed')).status===409,'El responsable no suplanta la confirmación del residente.');
        check((await patch(resident,requestId,'completed')).status===200,'Residente confirma y cierra el servicio.');
        check((await patch(manager,requestId,'accepted')).status===409,'Una solicitud cerrada no se reabre.');
        const unit = await data(admin.from('units').insert({community_id:manager.community,number:`QA-${runId}`,floor:1,owner_id:resident.id,resident_profile_id:resident.id}).select('id').single());
        const unlinked = await data(admin.from('units').insert({community_id:manager.community,number:`QA-sin-${runId}`,floor:1}).select('id').single());
        await data(admin.from('profiles').update({unit_id:unit.id}).eq('id',resident.id));
        const expense = await data(admin.from('expenses').insert({community_id:manager.community,unit_id:unit.id,month:'2026-10',amount:100000,due_date:'2026-10-05',status:'overdue'}).select('id').single());
        await data(admin.from('expenses').insert({community_id:manager.community,unit_id:unlinked.id,month:'2026-10',amount:2000,due_date:'2026-10-05',status:'overdue'}));
        await data(admin.from('unit_payments').insert({community_id:manager.community,unit_id:unit.id,expense_id:expense.id,amount:40000,paid_at:'2026-10-06',recorded_by:manager.id}));
        for (const table of ['expenses','unit_payments','service_requests','notifications']) {
            const rows = await data(foreignManager.client.from(table).select('id').eq('community_id',manager.community));
            check(rows.length===0,`Aislamiento: admin de otra comunidad no lee ${table}.`);
        }
        const foreignWrite = await foreignManager.client.from('expenses').update({amount:1}).eq('id',expense.id).select('id');
        check(!foreignWrite.data?.length,'Otra comunidad no puede modificar el cobro.');
        const unchanged = await data(admin.from('expenses').select('amount').eq('id',expense.id).single());
        check(Number(unchanged.amount)===100000,'El cobro conserva su monto tras el intento ajeno.');
        const collectionId = await seedTask(manager,'finance_collection_review',['detect_expenses','resolve_recipients','notify_residents','verify_delivery']);
        check((await api(resident,`/api/agent-center/tasks/${collectionId}/resume`)).status===403,'Residente no puede reanudar tareas administrativas.');
        check((await api(foreignManager,`/api/agent-center/tasks/${collectionId}/resume`)).status===409,'Admin ajeno no puede reanudar una tarea de otra comunidad.');
        const resumed = await api(manager,`/api/agent-center/tasks/${collectionId}/resume`);
        check(resumed.status===200,`Reanudación de cobranza tras fallo (${resumed.status}: ${resumed.body.error || 'OK'}).`);
        let task = await data(admin.from('agent_tasks').select('status,result').eq('id',collectionId).single());
        check(task.status==='waiting_human' && task.result.notifications===1 && task.result.adminNotifications===1,'Cobranza registra aviso al residente y excepción administrativa; sigue pendiente.');
        const collectionNotices = await data(admin.from('notifications').select('id,user_id').eq('community_id',manager.community).eq('category','finance_collection'));
        const residentNotice = collectionNotices.find(n=>n.user_id===resident.id);
        await data(resident.client.from('notifications').update({read:true}).eq('id',residentNotice.id));
        await data(admin.from('units').update({owner_id:resident.id}).eq('id',unlinked.id));
        const second = await api(manager,`/api/agent-center/tasks/${collectionId}/resume`);
        check(second.status===200,'Se retoma la misma tarea después de corregir el destinatario.');
        task = await data(admin.from('agent_tasks').select('status,result').eq('id',collectionId).single());
        check(task.status==='completed' && task.result.notifications===2,'La tarea solo queda completa después de resolver todas las unidades.');
        const preserved = await data(admin.from('notifications').select('read').eq('id',residentNotice.id).single());
        check(preserved.read,'Reanudar conserva la lectura del aviso previo.');
        check((await api(manager,`/api/agent-center/tasks/${collectionId}/resume`)).status===409,'Una tarea ya completa no se ejecuta de nuevo.');
        await data(admin.from('service_requests').insert({community_id:manager.community,user_id:resident.id,provider_id:provider.id,description:`QA mantenimiento ${runId}`,preferred_date:'2026-10-01',preferred_time:'10:00'}));
        const maintenanceId = await seedTask(manager,'maintenance_ticket_triage',['inspect_tickets','analyze_risks','verify_report']);
        const maintenance = await api(manager,`/api/agent-center/tasks/${maintenanceId}/resume`);
        check(maintenance.status===200,`Diagnóstico real de mantenimiento (${maintenance.status}: ${maintenance.body.error || 'OK'}).`);
        const maintenanceTask = await data(admin.from('agent_tasks').select('status,result').eq('id',maintenanceId).single());
        check(maintenanceTask.status==='completed' && maintenanceTask.result.openRequests===1 && maintenanceTask.result.oldOpen===1,'Mantenimiento detecta un ticket real vencido y deja auditoría verificada.');
        const offer = await data(admin.from('time_bank_offers').insert({community_id:manager.community,profile_id:manager.id,neighbor_name:'QA coordinador',unit_label:'QA',skill:`QA ${runId}`,description:'Prueba de participación',availability:'QA',governance_status:'approved',coordinator_id:manager.id,validated_by:manager.id}).select('id').single());
        const participation = await data(resident.client.from('community_participation_requests').insert({community_id:manager.community,initiative_type:'time_bank',initiative_id:offer.id,requester_id:resident.id,message:'QA participación'}).select('id').single());
        const foreignParticipation = await foreignResident.client.from('community_participation_requests').select('id').eq('id',participation.id);
        check(!foreignParticipation.data?.length,'Otra comunidad no lee la participación.');
        const changedIdentity = await manager.client.from('community_participation_requests').update({requester_id:manager.id}).eq('id',participation.id);
        check(!!changedIdentity.error,'El coordinador no puede cambiar la identidad del solicitante.');
        await data(manager.client.from('community_participation_requests').update({status:'accepted'}).eq('id',participation.id).select('id').single());
        const participationNotice = await data(admin.from('notifications').select('id').eq('community_id',manager.community).eq('category','community').eq('user_id',resident.id).eq('title','Solicitud de participación actualizada'));
        check(participationNotice.length===1,'La aceptación de Convivencia deja un aviso real al solicitante.');
        report.passed = true;
    } finally {
        const failures = [];
        for (const user of users) { const result = await admin.auth.admin.deleteUser(user.id); if(result.error) failures.push(result.error.message); }
        const deleted = await admin.from('communities').delete().in('id',communityIds);
        if (deleted.error) failures.push(deleted.error.message);
        const remaining = await admin.from('communities').select('id').in('id',communityIds);
        if (remaining.error || remaining.data?.length) failures.push('Quedaron comunidades sintéticas pendientes de limpieza.');
        if (failures.length) { report.passed=false; throw new Error(`Limpieza QA: ${failures.join('; ')}`); }
        checks.push('Datos sintéticos eliminados y ausencia de comunidades de prueba verificada.');
        mkdirSync('artifacts/operational-lifecycle',{recursive:true});
        writeFileSync('artifacts/operational-lifecycle/resultado.json',JSON.stringify(report,null,2));
    }
}
main().then(()=>console.log(JSON.stringify(report,null,2))).catch(error=>{report.passed=false;report.error=error.message;writeFileSync('artifacts/operational-lifecycle/resultado.json',JSON.stringify(report,null,2));console.error(JSON.stringify(report,null,2));process.exitCode=1;});
