-- A tool_use id is a durable idempotency key. CoCo claims it before touching
-- business data, so retries and double clicks cannot execute an action twice.

CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_events_coco_tool_request
  ON public.operation_events (community_id, action, request_id)
  WHERE request_id IS NOT NULL
    AND action LIKE 'coco.tool.%';
