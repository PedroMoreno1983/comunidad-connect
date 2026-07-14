const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true });

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
  if (missing.length) throw new Error(`Missing env for profile QA: ${missing.join(', ')}`);
}

async function signInAs(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}

function assertStaticRoleBoundaries() {
  const proxy = fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8');
  const sidebar = fs.readFileSync(path.join(process.cwd(), 'src/components/cc/Sidebar.tsx'), 'utf8');
  const agentApi = fs.readFileSync(path.join(process.cwd(), 'src/app/api/agent-center/route.ts'), 'utf8');
  const trainingApi = fs.readFileSync(path.join(process.cwd(), 'src/app/api/training/modules/route.ts'), 'utf8');

  assert(
    /if\s*\(pathname\.startsWith\("\/agent-center"\)\)\s*\{\s*allowed\s*=\s*role\s*===\s*"admin";\s*\}/.test(proxy),
    'Agent Center route is admin-only',
  );
  assert(sidebar.includes('{ href: "/agent-center", label: "Agent Center", icon: Sparkles, roles: ["admin"]'), 'Agent Center navigation is admin-only');
  assert(agentApi.includes("Agent Center es exclusivo de administracion."), 'Agent Center API rejects non-admin profiles');
  assert(proxy.includes('pathname.startsWith("/resident/training")') && proxy.includes('role === "admin" || role === "concierge"'), 'Aula route is limited to admin and concierge');
  assert(trainingApi.includes("!['admin', 'concierge'].includes(profile.role)"), 'Aula API rejects resident profiles');
}

async function main() {
  requiredEnv();
  assertStaticRoleBoundaries();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = `Profile-QA-${runId}!2026`;
  const communityId = crypto.randomUUID();
  const cleanup = { userIds: [], communityId };

  try {
    const { data: community, error: communityError } = await admin
      .from('communities')
      .insert({ id: communityId, name: `QA Perfiles ${runId}`, subscription_status: 'active' })
      .select('id,admin_code')
      .single();
    if (communityError || !community) throw communityError || new Error('Could not create QA community');

    const departmentA = `Q${runId}A`;
    const departmentB = `Q${runId}B`;

    const { data: units, error: unitsError } = await admin
      .from('units')
      .insert([
        { community_id: communityId, tower: 'A', number: departmentA, unit_number: departmentA, floor: 1 },
        { community_id: communityId, tower: 'A', number: departmentB, unit_number: departmentB, floor: 2 },
      ])
      .select('id,number');
    if (unitsError || units?.length !== 2) throw unitsError || new Error('Could not create QA units');

    const residents = [];
    for (const [department, suffix] of [[departmentA, 'a'], [departmentB, 'b']]) {
      const email = `profile-${suffix}-${runId}@qa.convive.local`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: `QA Resident ${suffix.toUpperCase()}`,
          invite_code: community.admin_code,
        },
      });
      if (error || !data.user) throw error || new Error(`Could not create ${email}`);
      cleanup.userIds.push(data.user.id);

      const unit = units.find(item => item.number === department);
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .update({ role: 'resident', unit_id: unit.id, community_id: communityId, department_number: department })
        .eq('id', data.user.id)
        .select('id,unit_id,community_id')
        .single();
      if (profileError || !profile?.unit_id) throw profileError || new Error(`Resident ${email} has no unit`);
      residents.push({ email, id: data.user.id, unitId: profile.unit_id });
    }
    assert(residents.length === 2 && residents[0].unitId !== residents[1].unitId, 'Temporary residents have distinct real units');

    const packageIds = [];
    for (const resident of residents) {
      const { data: pkg, error } = await admin
        .from('packages')
        .insert({
          recipient_unit_id: resident.unitId,
          description: `QA package ${resident.unitId}`,
          community_id: communityId,
        })
        .select('id,recipient_unit_id,community_id')
        .single();
      if (error || !pkg) throw error || new Error('Could not create QA package');
      packageIds.push(pkg.id);
      assert(pkg.community_id === communityId, 'Package trigger derives the destination community');
    }

    const { error: visitorError } = await admin.from('visitor_logs').insert({
      visitor_name: `QA Visitor ${runId}`,
      unit_id: residents[1].unitId,
      registered_by: residents[1].id,
      community_id: communityId,
    });
    if (visitorError) throw visitorError;

    for (let index = 0; index < residents.length; index += 1) {
      const resident = residents[index];
      const client = await signInAs(resident.email, password);
      const { data: visiblePackages, error: packageError } = await client
        .from('packages')
        .select('id,recipient_unit_id')
        .in('id', packageIds);
      if (packageError) throw packageError;
      assert(
        visiblePackages.length === 1 && visiblePackages[0].recipient_unit_id === resident.unitId,
        `Resident ${index + 1} only reads packages for their unit`,
        { visiblePackageIds: visiblePackages.map(item => item.id) }
      );

      const { data: visitorLogs, error: visitorReadError } = await client
        .from('visitor_logs')
        .select('id')
        .eq('community_id', communityId);
      if (visitorReadError) throw visitorReadError;
      assert(visitorLogs.length === 0, `Resident ${index + 1} cannot read the concierge visitor log`);

      const { data: notifications, error: notificationError } = await client
        .from('notifications')
        .select('user_id,type,link')
        .eq('category', 'package')
        .eq('link', '/resident/packages');
      if (notificationError) throw notificationError;
      assert(
        notifications.length === 1 && notifications[0].user_id === resident.id,
        `Resident ${index + 1} receives a private package notification`
      );
    }

    report.passed = true;
  } finally {
    for (const userId of cleanup.userIds) {
      try { await admin.auth.admin.deleteUser(userId); } catch { /* best effort */ }
    }
    try { await admin.from('communities').delete().eq('id', cleanup.communityId); } catch { /* best effort */ }
  }
}

main()
  .then(() => console.log(JSON.stringify(report, null, 2)))
  .catch(error => {
    report.failures.push({ message: error.message });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  });
