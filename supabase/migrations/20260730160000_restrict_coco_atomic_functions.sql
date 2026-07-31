-- These SECURITY DEFINER functions are server-side atomic primitives.
-- Browser roles must use the audited API/agent layer instead of invoking them.
revoke all on function public.coco_create_booking(uuid, uuid, uuid, date, time, time)
  from anon, authenticated;
revoke all on function public.coco_cast_vote(uuid, uuid, uuid, uuid)
  from anon, authenticated;

grant execute on function public.coco_create_booking(uuid, uuid, uuid, date, time, time)
  to service_role;
grant execute on function public.coco_cast_vote(uuid, uuid, uuid, uuid)
  to service_role;
