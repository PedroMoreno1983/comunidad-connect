const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const route = read('src/app/api/agent-center/route.ts');
const intentSafety = read('src/lib/agent-center/intentSafety.ts');
const page = read('src/app/(dashboard)/agent-center/page.tsx');
const taskEngine = read('src/lib/agent-center/taskEngine.ts');
const taskPlaybooks = read('src/lib/agent-center/taskPlaybooks.ts');
const taskMigration = read('supabase/migrations/052_agent_tasks.sql');

const checks = [
  ['Department number extraction is supported', intentSafety.includes('extractUnitNumber')],
  ['Heuristic fallback is protected from read-to-write mutation', route.includes('preventReadOnlyMutation(message, inferActionHeuristic')],
  ['Persisted proposals are claimed atomically', route.includes("claimPersistedProposal(action, 'executed')")],
  ['Executed proposals reuse their original run audit', route.includes('const runId = action.runId ||')],
  ['Executed proposals reuse their original tool-call audit', route.includes('const toolCallId = action.proposalId ||')],
  ['Proposal run ownership and tenant are checked', route.includes('run.user_id !== profile.id') && route.includes('run.community_id || DEFAULT_COMMUNITY_ID')],
  ['Configured daily action limits are enforced', route.includes('assertDailyActionLimit(profile, action, policy)')],
  ['Booking overlap is checked before insert', route.includes(".lt('start_time'") && route.includes(".gt('end_time'")],
  ['Maintenance provider is explicit and verified', route.includes(".eq('name', 'Mesa de ayuda interna')")],
  ['UI waits for server success before closing approval card', page.includes('const succeeded = await sendAgentRequest')],
  ['Persistent task and task-step tables exist', taskMigration.includes('CREATE TABLE IF NOT EXISTS public.agent_tasks') && taskMigration.includes('CREATE TABLE IF NOT EXISTS public.agent_task_steps')],
  ['Task steps retry and escalate on repeated failure', taskEngine.includes('attempt <= 2') && taskEngine.includes("status: 'escalated'")],
  ['Agent Center returns persistent task progress', route.includes('getRecentAgentTasks(profile)') && page.includes('Tareas vivas de CoCo')],
  ['Operational playbooks verify outcomes', taskPlaybooks.includes('runVerifiedTaskStep') && taskPlaybooks.includes('verify:')],
  ['Escalated tasks can be replanned with approval', page.includes('Replanificar con aprobacion')],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ passed: failures.length === 0, checks: checks.map(([name, passed]) => ({ name, passed })), failures }, null, 2));
if (failures.length) process.exit(1);
