const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { PDFDocument } = require('pdf-lib');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeArtifacts = process.env.QA_WRITE_ARTIFACTS !== '0';
const report = { generatedAt: new Date().toISOString(), baseUrl, passed: false, checks: [], failures: [] };

function assert(condition, message, details = {}) {
    if (!condition) throw Object.assign(new Error(message), { details });
    report.checks.push({ message, details });
}

async function browserJson(page, url, options = {}) {
    return page.evaluate(async ({ endpoint, requestOptions }) => {
        const response = await fetch(endpoint, {
            method: requestOptions.method || 'GET',
            headers: requestOptions.body ? { 'Content-Type': 'application/json' } : undefined,
            body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        return { status: response.status, ok: response.ok, data };
    }, { endpoint: url, requestOptions: options });
}

async function login(page, email, password) {
    await page.goto(`${baseUrl}/login?next=/staff/training`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-identity').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20_000 });
    await page.goto(`${baseUrl}/staff/training`, { waitUntil: 'networkidle' });
    await page.getByText('Cursos para administrar y operar mejor').waitFor({ timeout: 20_000 });
}

async function main() {
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Faltan credenciales Supabase para QA de formación.');
    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const runId = crypto.randomUUID().slice(0, 8);
    const password = `Training-${runId}!2026`;
    const communityId = crypto.randomUUID();
    const cleanup = { userIds: [], courseId: null, communityId };
    let browser;

    try {
        const { data: community, error: communityError } = await adminClient
            .from('communities')
            .insert({ id: communityId, name: `Training QA ${runId}`, subscription_status: 'active' })
            .select('id,admin_code,concierge_code')
            .single();
        if (communityError || !community) throw communityError || new Error('No se creó la comunidad QA.');

        const people = [
            { role: 'admin', name: 'Administración QA', email: `training-admin-${runId}@qa.convive.local`, invite: community.admin_code },
            { role: 'concierge', name: 'Conserjería QA', email: `training-concierge-${runId}@qa.convive.local`, invite: community.concierge_code },
        ];
        for (const person of people) {
            const { data, error } = await adminClient.auth.admin.createUser({
                email: person.email,
                password,
                email_confirm: true,
                user_metadata: { name: person.name, invite_code: person.invite },
            });
            if (error || !data.user) throw error || new Error(`No se creó ${person.role}.`);
            person.id = data.user.id;
            cleanup.userIds.push(data.user.id);
            const { error: profileError } = await adminClient.from('profiles').update({ name: person.name, full_name: person.name, role: person.role, community_id: communityId }).eq('id', data.user.id);
            if (profileError) throw profileError;
        }
        assert(true, 'Temporary admin and concierge profiles created');

        browser = await chromium.launch({ headless: true });
        const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const adminPage = await adminContext.newPage();
        await login(adminPage, people[0].email, password);
        assert(await adminPage.getByRole('button', { name: 'Crear curso' }).isVisible(), 'Admin sees course authoring controls');

        const modules = await browserJson(adminPage, '/api/training/modules');
        assert(modules.ok && modules.data.length >= 3, 'Admin can read the official curriculum');
        const sourceCourse = modules.data.find(item => item.training_lessons?.[0]?.content);
        const title = `Protocolo operativo QA ${runId}`;
        const create = await browserJson(adminPage, '/api/training/modules', {
            method: 'POST',
            body: {
                title,
                description: 'Curso temporal para comprobar creación, versionado, asignación, respuestas y certificado.',
                targetAudience: 'all',
                content: sourceCourse.training_lessons[0].content,
                embedUrl: '',
                completionMode: 'interactive',
                learningObjectives: ['Aplicar el protocolo con evidencia.', 'Distinguir responsabilidades por rol.', 'Cerrar la gestión con trazabilidad.'],
                estimatedMinutes: 24,
            },
        });
        assert(create.status === 201 && create.data.module?.id, 'Admin creates a persisted quality-gated course', { status: create.status });
        cleanup.courseId = create.data.module.id;

        const update = await browserJson(adminPage, '/api/training/modules', {
            method: 'PATCH',
            body: {
                id: cleanup.courseId,
                title,
                description: 'Curso temporal actualizado para comprobar el historial editorial y la evidencia de aprendizaje.',
                targetAudience: 'all',
                content: sourceCourse.training_lessons[0].content,
                embedUrl: '',
                completionMode: 'interactive',
                learningObjectives: ['Aplicar el protocolo con evidencia.', 'Distinguir responsabilidades por rol.', 'Cerrar la gestión con trazabilidad.'],
                estimatedMinutes: 26,
                changeSummary: 'QA: mejora de descripción y duración.',
            },
        });
        assert(update.ok && update.data.module?.version_number === 2, 'Republishing creates version 2 without replacing the course ID');

        const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
        const assignment = await browserJson(adminPage, '/api/training/assignments', {
            method: 'POST',
            body: { moduleId: cleanup.courseId, assigneeIds: [people[1].id], dueAt, mandatory: true },
        });
        assert(assignment.status === 201 && assignment.data.assignments?.length === 1, 'Admin assigns the current version with a due date');
        const dashboardBefore = await browserJson(adminPage, '/api/training/admin/dashboard');
        assert(dashboardBefore.ok && dashboardBefore.data.summary.assigned === 1, 'Compliance dashboard reports the assignment');
        assert(dashboardBefore.data.versions.filter(item => item.module_id === cleanup.courseId).length === 2, 'Compliance dashboard exposes both immutable versions');
        await adminPage.getByRole('button', { name: 'Cumplimiento' }).click();
        await adminPage.getByText('Formación con responsables y evidencia').waitFor();
        const outputDir = path.join(process.cwd(), 'tmp', 'training-qa');
        if (writeArtifacts) {
            fs.mkdirSync(outputDir, { recursive: true });
            await adminPage.screenshot({ path: path.join(outputDir, 'admin-compliance.png'), fullPage: true });
        }

        const conciergeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const conciergePage = await conciergeContext.newPage();
        await login(conciergePage, people[1].email, password);
        await conciergePage.getByText(title, { exact: true }).waitFor();
        assert(await conciergePage.getByText(/Obligatorio/).isVisible(), 'Concierge sees the mandatory course and due date');
        const conciergeModules = await browserJson(conciergePage, '/api/training/modules');
        const course = conciergeModules.data.find(item => item.id === cleanup.courseId);
        assert(Boolean(course), 'Concierge can read the assigned course in the same tenant');
        const ownAssignments = await browserJson(conciergePage, '/api/training/assignments');
        assert(ownAssignments.ok && ownAssignments.data.some(item => item.module_id === cleanup.courseId), 'Concierge receives the persisted assignment');

        const started = await browserJson(conciergePage, '/api/training/attempts', { method: 'POST', body: { action: 'start', moduleId: cleanup.courseId } });
        assert(started.status === 201 && started.data.attempt?.assignment_id, 'Starting the course creates a linked attempt');
        const attemptId = started.data.attempt.id;
        const slides = JSON.parse(course.training_lessons[0].content);
        for (const slide of slides.filter(item => item.activity)) {
            const answer = slide.activity.type === 'checklist' ? slide.activity.items : slide.activity.correctIndex;
            const response = await browserJson(conciergePage, '/api/training/attempts', { method: 'POST', body: { action: 'answer', attemptId, slideId: slide.id, answer } });
            assert(response.ok && response.data.response?.is_correct, `Activity ${slide.id} is scored and persisted`);
        }
        const fakeCompletion = await browserJson(conciergePage, '/api/training/progress', { method: 'POST', body: { moduleId: cleanup.courseId, status: 'completed', lastSlideIndex: 999 } });
        assert(fakeCompletion.status === 400, 'Client cannot forge course completion through the progress endpoint');
        const completed = await browserJson(conciergePage, '/api/training/attempts', { method: 'POST', body: { action: 'complete', attemptId } });
        assert(completed.ok && completed.data.attempt?.score === 100 && completed.data.certificate?.id, 'Server verifies all activities and issues a certificate');

        const certificateResponse = await conciergeContext.request.get(`${baseUrl}/api/training/certificates/${completed.data.certificate.id}`);
        const certificateBytes = await certificateResponse.body();
        assert(certificateResponse.ok() && certificateResponse.headers()['content-type'] === 'application/pdf', 'Certificate downloads as an authenticated PDF');
        const certificatePdf = await PDFDocument.load(certificateBytes);
        assert(
            certificateBytes.subarray(0, 4).toString() === '%PDF' && certificateBytes.length > 1_000 && certificatePdf.getPageCount() === 1,
            'Certificate is a parseable one-page PDF payload',
            { bytes: certificateBytes.length, pages: certificatePdf.getPageCount() },
        );
        if (writeArtifacts) {
            const pdfDir = path.join(process.cwd(), 'tmp', 'pdfs');
            fs.mkdirSync(pdfDir, { recursive: true });
            fs.writeFileSync(path.join(pdfDir, 'training-certificate-qa.pdf'), certificateBytes);
        }

        await conciergePage.reload({ waitUntil: 'networkidle' });
        const card = conciergePage.locator('article').filter({ hasText: title });
        await card.getByRole('button', { name: 'Revisar curso' }).click();
        await conciergePage.getByText('Equipo multiagente CoCo').waitFor();
        const certificateLink = conciergePage.getByRole('link', { name: 'Descargar constancia' });
        await certificateLink.waitFor({ timeout: 20_000 });
        if (writeArtifacts) await conciergePage.screenshot({ path: path.join(outputDir, 'concierge-classroom.png'), fullPage: true });
        assert(await certificateLink.isVisible(), 'Completed classroom exposes the certificate action');

        const dashboardAfter = await browserJson(adminPage, '/api/training/admin/dashboard');
        const completedAssignment = dashboardAfter.data.assignments.find(item => item.module_id === cleanup.courseId && item.user_id === people[1].id);
        assert(completedAssignment?.status === 'completed' && completedAssignment.latest_attempt?.score === 100, 'Admin dashboard receives the verified completion and score');
        report.passed = true;
        await adminContext.close();
        await conciergeContext.close();
    } finally {
        if (browser) await browser.close().catch(() => undefined);
        if (cleanup.courseId) {
            const { data: attempts } = await adminClient.from('training_attempts').select('id').eq('module_id', cleanup.courseId);
            const attemptIds = (attempts || []).map(item => item.id);
            if (attemptIds.length) {
                await adminClient.from('training_certificates').delete().in('attempt_id', attemptIds);
                await adminClient.from('training_activity_responses').delete().in('attempt_id', attemptIds);
            }
            await adminClient.from('training_attempts').delete().eq('module_id', cleanup.courseId);
            await adminClient.from('training_assignments').delete().eq('module_id', cleanup.courseId);
            await adminClient.from('training_module_versions').delete().eq('module_id', cleanup.courseId);
            await adminClient.from('user_training_progress').delete().eq('module_id', cleanup.courseId);
            await adminClient.from('training_lessons').delete().eq('module_id', cleanup.courseId);
            await adminClient.from('training_modules').delete().eq('id', cleanup.courseId);
        }
        for (const userId of cleanup.userIds) await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
        await adminClient.from('communities').delete().eq('id', cleanup.communityId);
    }
}

main().then(() => console.log(JSON.stringify(report, null, 2))).catch(error => {
    report.failures.push({ message: error.message, details: error.details || {} });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
});
