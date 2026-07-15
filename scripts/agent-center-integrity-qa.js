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
const triggerMigration = read('supabase/migrations/054_agent_proactive_triggers.sql');
const proactiveEngine = read('src/lib/agent-center/proactiveEngine.ts');
const schedulerRoute = read('src/app/api/agent-center/scheduler/route.ts');
const planner = read('src/lib/agent-center/planner.ts');
const communityResearch = read('src/lib/agent-center/communityResearch.ts');

const checks = [
  ['Department number extraction is supported', intentSafety.includes('extractUnitNumber')],
  ['Anthropic tool-calling is the primary reasoning planner', route.includes('planAgentAction(message, profile)') && planner.includes("tool_choice: { type: 'tool'")],
  ['Planner decisions carry confidence and a concise explanation', planner.includes('decision:') && route.includes('action.decision?.explanation')],
  ['Open-ended operational questions use a real read-only snapshot', route.includes("action.toolName === 'get_community_snapshot'") && planner.includes('get_community_snapshot')],
  ['Research questions can cross authorized read-only sources', planner.includes('answer_community_question') && communityResearch.includes('MAX_ROUNDS = 4') && communityResearch.includes("name: 'find_residents'") && communityResearch.includes("name: 'read_expenses'")],
  ['Research tool calls preserve tenant isolation and a source trace', communityResearch.includes(".eq('community_id', communityId)") && communityResearch.includes('trace.push({ source: toolUse.name')],
  ['Invalid planned arguments become a safe clarification', route.includes('finalizeInferredAction') && route.includes('Indica ese dato para continuar. No realice ningun cambio.')],
  ['Heuristic fallback is protected from read-to-write mutation', route.includes('preventReadOnlyMutation(message, normalizeAction(candidate))') && route.includes('finalizeInferredAction(message, inferActionHeuristic')],
  ['Persisted proposals are claimed atomically', route.includes("claimPersistedProposal(action, 'executed')")],
  ['Executed proposals reuse their original run audit', route.includes('const runId = action.runId ||')],
  ['Executed proposals reuse their original tool-call audit', route.includes('const toolCallId = action.proposalId ||')],
  ['Proposal tenant ownership is checked', route.includes('run.community_id || DEFAULT_COMMUNITY_ID') && route.includes('toolCall.community_id || DEFAULT_COMMUNITY_ID')],
  ['Configured daily action limits are enforced', route.includes('assertDailyActionLimit(profile, action, policy)')],
  ['Booking overlap is checked before insert', route.includes(".lt('start_time'") && route.includes(".gt('end_time'")],
  ['Maintenance provider is explicit and verified', route.includes(".eq('name', 'Mesa de ayuda interna')")],
  ['UI waits for server success before closing approval card', page.includes('const succeeded = await sendAgentRequest')],
  ['Persistent task and task-step tables exist', taskMigration.includes('CREATE TABLE IF NOT EXISTS public.agent_tasks') && taskMigration.includes('CREATE TABLE IF NOT EXISTS public.agent_task_steps')],
  ['Task steps retry and escalate on repeated failure', taskEngine.includes('attempt <= 2') && taskEngine.includes("status: 'escalated'")],
  ['Agent Center returns persistent task progress', route.includes('getRecentAgentTasks(profile)') && page.includes('Tareas vivas de CoCo')],
  ['Operational playbooks verify outcomes', taskPlaybooks.includes('runVerifiedTaskStep') && taskPlaybooks.includes('verify:')],
  ['Escalated tasks can be replanned with approval', page.includes('Replanificar con aprobacion')],
  ['Proactive rules and deduplicated events are persisted', triggerMigration.includes('agent_trigger_rules') && triggerMigration.includes('dedupe_key TEXT NOT NULL UNIQUE')],
  ['Signals create proposals instead of direct write execution', proactiveEngine.includes("status: 'awaiting_confirmation'") && proactiveEngine.includes("requires_confirmation: true")],
  ['Scheduler rejects requests without the configured secret', schedulerRoute.includes('Scheduler no configurado') && schedulerRoute.includes('No autorizado.')],
  ['Agent Center evaluates tenant rules as a resilient fallback', route.includes('evaluateDueAgentTriggers(profile.community_id || DEFAULT_COMMUNITY_ID)')],
  ['Agent Center exposes proactive controls', page.includes('CoCo observa y propone') && page.includes('toggleTrigger(rule)')],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ passed: failures.length === 0, checks: checks.map(([name, passed]) => ({ name, passed })), failures }, null, 2));
if (failures.length) process.exit(1);
