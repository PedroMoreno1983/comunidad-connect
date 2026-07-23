const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const report = { generatedAt: new Date().toISOString(), passed: false, checks: [], failures: [] };

function assert(condition, message, details = {}) {
    if (!condition) throw Object.assign(new Error(message), { details });
    report.checks.push({ message, details });
}

async function main() {
    if (!url || !anonKey || !serviceKey) throw new Error('Faltan credenciales Supabase para QA.');

    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const runId = crypto.randomUUID().slice(0, 8);
    const cleanup = { userIds: [], communityId: null };

    try {
        const publicCodes = await anon
            .from('communities')
            .select('id,resident_code,concierge_code,admin_code')
            .limit(1);
        assert(
            Boolean(publicCodes.error) || (publicCodes.data || []).length === 0,
            'Anonymous users cannot enumerate invitation codes',
        );

        const bypassEmail = `auth-bypass-${runId}@qa.convive.local`;
        const bypass = await admin.auth.admin.createUser({
            email: bypassEmail,
            password: `Bypass-${runId}!2026`,
            email_confirm: true,
            user_metadata: {
                role: 'admin',
                community_id: crypto.randomUUID(),
            },
        });
        if (bypass.data?.user?.id) {
            cleanup.userIds.push(bypass.data.user.id);
        }
        assert(Boolean(bypass.error) && !bypass.data?.user, 'Forged role and community metadata are rejected');

        const communityId = crypto.randomUUID();
        cleanup.communityId = communityId;
        const { data: community, error: communityError } = await admin
            .from('communities')
            .insert({ id: communityId, name: `Auth QA ${runId}`, subscription_status: 'active' })
            .select('id,admin_code')
            .single();
        if (communityError || !community?.admin_code) throw communityError || new Error('No se creó comunidad QA.');

        const validEmail = `auth-valid-${runId}@qa.convive.local`;
        const valid = await admin.auth.admin.createUser({
            email: validEmail,
            password: `Valid-${runId}!2026`,
            email_confirm: true,
            user_metadata: { name: 'Auth QA Admin', invite_code: community.admin_code },
        });
        if (valid.error || !valid.data.user) throw valid.error || new Error('Código válido fue rechazado.');
        cleanup.userIds.push(valid.data.user.id);

        const { data: profile, error: profileError } = await admin
            .from('profiles')
            .select('role,community_id')
            .eq('id', valid.data.user.id)
            .single();
        if (profileError) throw profileError;
        assert(
            profile.role === 'admin' && profile.community_id === communityId,
            'Valid invitation derives the stored role and community',
            { role: profile.role },
        );

        report.passed = true;
    } finally {
        for (const userId of cleanup.userIds) {
            await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        }
        if (cleanup.communityId) {
            await admin.from('communities').delete().eq('id', cleanup.communityId);
        }
    }
}

main()
    .then(() => console.log(JSON.stringify(report, null, 2)))
    .catch(error => {
        report.failures.push({ message: error.message, details: error.details || {} });
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
    });
