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
    const cleanup = { userIds: [], communityIds: [] };

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
        cleanup.communityIds.push(communityId);
        const { data: community, error: communityError } = await admin
            .from('communities')
            .insert({ id: communityId, name: `Auth QA ${runId}`, subscription_status: 'active' })
            .select('id,admin_code,resident_code')
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

        // Regression guard for the 2026-08-24 audit. handle_new_user() creates the
        // resident's unit on the fly, and public.units was missing the `type` and
        // `resident_profile_id` columns that INSERT references. The trigger raised,
        // so any resident who typed their unit number got "Database error creating
        // new user" and simply could not register. Fixed by migration
        // 20260824180000_fix_units_schema_drift.sql.
        const unitNumber = `R${runId.slice(0, 4)}`;
        const resident = await admin.auth.admin.createUser({
            email: `auth-resident-${runId}@qa.convive.local`,
            password: `Resident-${runId}!2026`,
            email_confirm: true,
            user_metadata: {
                name: 'Auth QA Resident',
                invite_code: community.resident_code,
                department_number: unitNumber,
            },
        });
        if (resident.data?.user?.id) cleanup.userIds.push(resident.data.user.id);
        assert(
            !resident.error && Boolean(resident.data?.user),
            'Resident can sign up with a unit number',
            { error: resident.error?.message },
        );

        const { data: residentProfile } = await admin
            .from('profiles')
            .select('role,unit_id')
            .eq('id', resident.data.user.id)
            .single();
        assert(
            residentProfile?.role === 'resident' && Boolean(residentProfile?.unit_id),
            'Resident signup links a real unit',
            { unitLinked: Boolean(residentProfile?.unit_id) },
        );

        // Same guard from the other side: unit numbers must be unique per
        // community, never globally. A stray units_number_key meant the second
        // building to onboard a "101" could not register that resident at all.
        const neighbourId = crypto.randomUUID();
        cleanup.communityIds.push(neighbourId);
        const { data: neighbour } = await admin
            .from('communities')
            .insert({ id: neighbourId, name: `Auth QA vecino ${runId}`, subscription_status: 'active' })
            .select('id,resident_code')
            .single();

        const twin = await admin.auth.admin.createUser({
            email: `auth-twin-${runId}@qa.convive.local`,
            password: `Twin-${runId}!2026`,
            email_confirm: true,
            user_metadata: {
                name: 'Auth QA Twin',
                invite_code: neighbour.resident_code,
                department_number: unitNumber,
            },
        });
        if (twin.data?.user?.id) cleanup.userIds.push(twin.data.user.id);
        assert(
            !twin.error && Boolean(twin.data?.user),
            'Two communities can each have a unit with the same number',
            { error: twin.error?.message },
        );

        report.passed = true;
    } finally {
        for (const userId of cleanup.userIds) {
            await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        }
        for (const communityId of cleanup.communityIds) {
            // The query builder is a thenable, not a Promise: it has no .catch().
            try {
                await admin.from('communities').delete().eq('id', communityId);
            } catch { /* best effort */ }
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
