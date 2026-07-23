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
  if (missing.length) {
    throw new Error(`Missing env for multitenant QA: ${missing.join(', ')}`);
  }
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
  const password = `Tenant-QA-${runId}!2026`;
  const communityA = crypto.randomUUID();
  const communityB = crypto.randomUUID();
  const emailA = `tenant-a-${runId}@qa.convive.local`;
  const emailB = `tenant-b-${runId}@qa.convive.local`;

  const cleanup = {
    userIds: [],
    communityIds: [communityA, communityB],
  };

  try {
    const { error: schemaError } = await admin.from('polls').select('id').limit(1);
    if (schemaError) {
      throw new Error(`Voting schema is not ready: ${schemaError.message}`);
    }
    assert(true, 'Voting tables are available');

    const { data: createdCommunities, error: communitiesError } = await admin.from('communities').insert([
      { id: communityA, name: `QA Comunidad A ${runId}`, subscription_status: 'active' },
      { id: communityB, name: `QA Comunidad B ${runId}`, subscription_status: 'active' },
    ]).select('id,admin_code');
    if (communitiesError) throw communitiesError;
    const inviteCodeByCommunity = new Map(createdCommunities.map(community => [community.id, community.admin_code]));
    assert(true, 'Temporary communities created');

    for (const [email, communityId, label] of [
      [emailA, communityA, 'Tenant A Admin'],
      [emailB, communityB, 'Tenant B Admin'],
    ]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: label,
          invite_code: inviteCodeByCommunity.get(communityId),
        },
      });
      if (error || !data.user) throw error || new Error(`Could not create ${email}`);
      cleanup.userIds.push(data.user.id);

      const { error: profileError } = await admin
        .from('profiles')
        .upsert({
          id: data.user.id,
          name: label,
          email,
          role: 'admin',
          community_id: communityId,
        }, { onConflict: 'id' });
      if (profileError) throw profileError;
    }
    assert(true, 'Temporary users and profiles created');

    const [userA, userB] = cleanup.userIds;
    const { data: pollA, error: pollAError } = await admin
      .from('polls')
      .insert({
        community_id: communityA,
        title: `QA Poll A ${runId}`,
        description: 'Cross-tenant isolation sentinel A',
        category: 'community',
        status: 'active',
        end_date: new Date(Date.now() + 7 * 864e5).toISOString(),
        created_by: userA,
      })
      .select('id')
      .single();
    if (pollAError || !pollA) throw pollAError || new Error('Could not create poll A');

    const { data: pollB, error: pollBError } = await admin
      .from('polls')
      .insert({
        community_id: communityB,
        title: `QA Poll B ${runId}`,
        description: 'Cross-tenant isolation sentinel B',
        category: 'community',
        status: 'active',
        end_date: new Date(Date.now() + 7 * 864e5).toISOString(),
        created_by: userB,
      })
      .select('id')
      .single();
    if (pollBError || !pollB) throw pollBError || new Error('Could not create poll B');

    const { data: options, error: optionsError } = await admin
      .from('poll_options')
      .insert([
        { poll_id: pollA.id, text: 'A favor', display_order: 0 },
        { poll_id: pollA.id, text: 'En contra', display_order: 1 },
        { poll_id: pollB.id, text: 'A favor', display_order: 0 },
        { poll_id: pollB.id, text: 'En contra', display_order: 1 },
      ])
      .select('id,poll_id');
    if (optionsError || !options?.length) throw optionsError || new Error('Could not create poll options');
    assert(true, 'Tenant sentinel polls created');

    const clientA = await signInAs(emailA, password);
    const clientB = await signInAs(emailB, password);

    const { data: visibleToA, error: visibleAError } = await clientA
      .from('polls')
      .select('id,community_id,title')
      .in('id', [pollA.id, pollB.id])
      .order('title');
    if (visibleAError) throw visibleAError;

    const { data: visibleToB, error: visibleBError } = await clientB
      .from('polls')
      .select('id,community_id,title')
      .in('id', [pollA.id, pollB.id])
      .order('title');
    if (visibleBError) throw visibleBError;

    assert(
      visibleToA.length === 1 && visibleToA[0].id === pollA.id,
      'Tenant A can only read Tenant A poll',
      { visibleToA: visibleToA.map(p => p.id) }
    );
    assert(
      visibleToB.length === 1 && visibleToB[0].id === pollB.id,
      'Tenant B can only read Tenant B poll',
      { visibleToB: visibleToB.map(p => p.id) }
    );

    const ownOptionA = options.find(option => option.poll_id === pollA.id);
    const otherOptionB = options.find(option => option.poll_id === pollB.id);
    assert(Boolean(ownOptionA && otherOptionB), 'Vote options resolved');

    const { error: ownVoteError } = await clientA.from('poll_votes').insert({
      poll_id: pollA.id,
      option_id: ownOptionA.id,
      user_id: userA,
      community_id: communityA,
    });
    if (ownVoteError) throw ownVoteError;
    assert(true, 'Tenant A can vote in its own poll');

    const { error: crossVoteError } = await clientA.from('poll_votes').insert({
      poll_id: pollB.id,
      option_id: otherOptionB.id,
      user_id: userA,
      community_id: communityB,
    });
    assert(Boolean(crossVoteError), 'Tenant A cannot vote in Tenant B poll', {
      code: crossVoteError?.code,
      message: crossVoteError?.message,
    });

    const { data: leakedVotes, error: leakedVotesError } = await clientA
      .from('poll_votes')
      .select('id,poll_id,community_id')
      .eq('poll_id', pollB.id);
    if (leakedVotesError) throw leakedVotesError;
    assert(leakedVotes.length === 0, 'Tenant A cannot read Tenant B votes');

    report.passed = true;
  } finally {
    for (const userId of cleanup.userIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // Best-effort cleanup. The QA result is based on the assertions above.
      }
    }
    if (cleanup.communityIds.length) {
      try {
        await admin.from('communities').delete().in('id', cleanup.communityIds);
      } catch {
        // Best-effort cleanup. Communities cascade their tenant test rows.
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
