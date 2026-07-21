-- Collapse duplicate pending Agent Center proposals/tasks that were created by
-- repeated proactive evaluations before Agent Center reads became side-effect free.

CREATE TEMP TABLE tmp_duplicate_agent_tool_calls ON COMMIT DROP AS
SELECT id, run_id
FROM (
  SELECT
    tc.id,
    tc.run_id,
    row_number() OVER (
      PARTITION BY
        tc.community_id,
        tc.tool_name,
        COALESCE(tc.args->>'triggerRuleId', ''),
        COALESCE(tc.args->>'playbookKey', ''),
        COALESCE(tc.args->>'requestedText', '')
      ORDER BY tc.created_at DESC, tc.id DESC
    ) AS duplicate_rank
  FROM public.agent_tool_calls tc
  WHERE tc.status = 'proposed'
    AND tc.tool_name = 'run_playbook'
    AND tc.args ? 'playbookKey'
) ranked
WHERE duplicate_rank > 1;

UPDATE public.agent_tool_calls tc
SET
  status = 'rejected',
  result = jsonb_build_object('reason', 'duplicate_proactive_proposal_collapsed'),
  executed_at = COALESCE(tc.executed_at, NOW())
WHERE tc.id IN (SELECT id FROM tmp_duplicate_agent_tool_calls);

UPDATE public.agent_runs ar
SET
  status = 'rejected',
  completed_at = COALESCE(ar.completed_at, NOW()),
  metadata = COALESCE(ar.metadata, '{}'::jsonb) || jsonb_build_object('dedupeReason', 'duplicate_proactive_proposal_collapsed')
WHERE ar.id IN (SELECT run_id FROM tmp_duplicate_agent_tool_calls);

CREATE TEMP TABLE tmp_duplicate_agent_tasks ON COMMIT DROP AS
SELECT id
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY community_id, playbook_key, goal
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.agent_tasks
  WHERE playbook_key IS NOT NULL
    AND status IN ('planned', 'running', 'waiting_human', 'failed', 'escalated')
) ranked
WHERE duplicate_rank > 1;

UPDATE public.agent_task_steps ats
SET status = 'skipped', error = 'Paso omitido porque la tarea era duplicada.'
WHERE ats.task_id IN (SELECT id FROM tmp_duplicate_agent_tasks)
  AND ats.status IN ('pending', 'running', 'failed', 'waiting_human');

UPDATE public.agent_tasks at
SET
  status = 'cancelled',
  last_error = 'Tarea duplicada archivada automaticamente.',
  updated_at = NOW(),
  completed_at = COALESCE(at.completed_at, NOW())
WHERE at.id IN (SELECT id FROM tmp_duplicate_agent_tasks);