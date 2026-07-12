-- Atomic API rate limiting shared by every Vercel instance.
create table if not exists public.api_rate_limits (
    scope text not null,
    subject_hash text not null,
    window_started_at timestamptz not null default now(),
    request_count integer not null default 0 check (request_count >= 0),
    primary key (scope, subject_hash)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(
    p_scope text,
    p_subject_hash text,
    p_limit integer,
    p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_row public.api_rate_limits%rowtype;
    window_length interval := make_interval(secs => greatest(1, p_window_seconds));
begin
    if p_scope is null or length(p_scope) < 1
       or p_subject_hash is null or length(p_subject_hash) <> 64
       or p_limit < 1 then
        raise exception 'Invalid rate limit parameters';
    end if;

    insert into public.api_rate_limits(scope, subject_hash, window_started_at, request_count)
    values (p_scope, p_subject_hash, now(), 1)
    on conflict (scope, subject_hash) do update
    set window_started_at = case
            when public.api_rate_limits.window_started_at + window_length <= now() then now()
            else public.api_rate_limits.window_started_at
        end,
        request_count = case
            when public.api_rate_limits.window_started_at + window_length <= now() then 1
            else public.api_rate_limits.request_count + 1
        end
    returning * into current_row;

    allowed := current_row.request_count <= p_limit;
    remaining := greatest(0, p_limit - current_row.request_count);
    retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from ((current_row.window_started_at + window_length) - now())))::integer
    );
    return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

comment on table public.api_rate_limits is 'Shared fixed-window counters for server-side API abuse protection.';
