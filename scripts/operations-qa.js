const crypto = require('crypto');
const { loadEnvFile } = require('./load-env');
const { createClient } = require('@supabase/supabase-js');

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const report = {
  generatedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  failures: [],
};

function assert(condition, message, details = {}) {
  if (!condition) {
    report.failures.push({ message, details });
    throw new Error(message);
  }
  report.checks.push({ message, details });
}

function requiredEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw new Error(`Missing env for operations QA: ${missing.join(', ')}`);
}

async function signInAs(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}

async function main() {
  requiredEnv();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const password = `Ops-QA-${runId}!2026`;
  const communityA = crypto.randomUUID();
  const communityB = crypto.randomUUID();
  const emailA = `ops-admin-a-${runId}@qa.convive.local`;
  const emailB = `ops-admin-b-${runId}@qa.convive.local`;

  const cleanup = {
    userIds: [],
    communityIds: [communityA, communityB],
  };

  try {
    const { error: schemaError } = await admin.from('operation_events').select('id').limit(1);
    if (schemaError) {
      throw new Error(`Operation events schema is not ready: ${schemaError.message}`);
    }
    assert(true, 'Operation events table is available');

    const { data: createdCommunities, error: communitiesError } = await admin.from('communities').insert([
      { id: communityA, name: `QA Ops Comunidad A ${runId}`, subscription_status: 'active' },
      { id: communityB, name: `QA Ops Comunidad B ${runId}`, subscription_status: 'active' },
    ]).select('id,admin_code');
    if (communitiesError) throw communitiesError;
    const inviteCodeByCommunity = new Map(createdCommunities.map(community => [community.id, community.admin_code]));
    assert(true, 'Temporary communities created');

    for (const [email, communityId, label] of [
      [emailA, communityA, 'Ops QA Admin A'],
      [emailB, communityB, 'Ops QA Admin B'],
    ]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: label, invite_code: inviteCodeByCommunity.get(communityId) },
      });
      if (error || !data.user) throw error || new Error(`Could not create ${email}`);
      cleanup.userIds.push(data.user.id);

      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        name: label,
        email,
        role: 'admin',
        community_id: communityId,
      }, { onConflict: 'id' });
      if (profileError) throw profileError;
    }
    assert(true, 'Temporary admin profiles created');

    const [userA, userB] = cleanup.userIds;
    const { data: inserted, error: insertError } = await admin.from('operation_events').insert([
      {
        community_id: communityA,
        actor_id: userA,
        actor_role: 'admin',
        action: `qa.operation.a.${runId}`,
        entity_type: 'qa_event',
        entity_id: `a-${runId}`,
        severity: 'success',
        status: 'success',
        summary: 'QA operation event A',
        metadata: { runId, secret_token: 'should-not-be-used-in-app-helper' },
      },
      {
        community_id: communityB,
        actor_id: userB,
        actor_role: 'admin',
        action: `qa.operation.b.${runId}`,
        entity_type: 'qa_event',
        entity_id: `b-${runId}`,
        severity: 'warning',
        status: 'pending',
        summary: 'QA operation event B',
        metadata: { runId },
      },
    ]).select('id,community_id,action');
    if (insertError || !inserted?.length) throw insertError || new Error('Could not insert operation events');
    assert(inserted.length === 2, 'Tenant sentinel operation events created');

    const clientA = await signInAs(emailA, password);
    const clientB = await signInAs(emailB, password);

    const eventIds = inserted.map(event => event.id);
    const { data: visibleToA, error: visibleAError } = await clientA
      .from('operation_events')
      .select('id,community_id,action')
      .in('id', eventIds)
      .order('action');
    if (visibleAError) throw visibleAError;

    const { data: visibleToB, error: visibleBError } = await clientB
      .from('operation_events')
      .select('id,community_id,action')
      .in('id', eventIds)
      .order('action');
    if (visibleBError) throw visibleBError;

    assert(
      visibleToA.length === 1 && visibleToA[0].community_id === communityA,
      'Tenant A admin can only read Tenant A operation events',
      { visibleToA }
    );
    assert(
      visibleToB.length === 1 && visibleToB[0].community_id === communityB,
      'Tenant B admin can only read Tenant B operation events',
      { visibleToB }
    );

    report.passed = true;
  } finally {
    for (const userId of cleanup.userIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // Best-effort cleanup.
      }
    }
    if (cleanup.communityIds.length) {
      try {
        await admin.from('communities').delete().in('id', cleanup.communityIds);
      } catch {
        // Best-effort cleanup. Communities cascade tenant audit rows.
      }
    }
  }
}

main()
  .then(() => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch(error => {
    report.failures.push({ message: error.message });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  });
