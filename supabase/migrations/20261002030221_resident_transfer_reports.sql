-- A resident's transfer notice is evidence to review, never a payment.
create table if not exists public.transfer_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  reported_by uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null,
  reference text not null check (char_length(btrim(reference)) between 4 and 120),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists transfer_reports_active_reference_uniq
  on public.transfer_reports (community_id, unit_id, lower(btrim(reference)))
  where status in ('pending', 'confirmed');
create index if not exists transfer_reports_review_queue_idx
  on public.transfer_reports (community_id, status, created_at desc);
alter table public.transfer_reports enable row level security;
revoke all on public.transfer_reports from anon, authenticated;
grant all on public.transfer_reports to service_role;

alter table public.unit_payments
  add column if not exists transfer_report_id uuid references public.transfer_reports(id) on delete set null;
create unique index if not exists unit_payments_transfer_report_uniq
  on public.unit_payments (transfer_report_id) where transfer_report_id is not null;

-- Payment and review decision commit together. Only the server-side service
-- role may call this function; residents cannot confirm their own notice.
create or replace function public.confirm_transfer_report(
  p_report_id uuid, p_admin_id uuid, p_note text default null
)
returns table(payment_id uuid, unit_id uuid, community_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  r public.transfer_reports%rowtype;
  charge public.expenses%rowtype;
  paid_on_charge numeric;
  inserted_payment_id uuid;
begin
  select * into r from public.transfer_reports where id = p_report_id for update;
  if not found then raise exception 'Transfer report not found'; end if;
  if r.status = 'confirmed' then
    return query select p.id, r.unit_id, r.community_id
      from public.unit_payments p where p.transfer_report_id = r.id;
    return;
  end if;
  if r.status <> 'pending' then raise exception 'Transfer report is not pending'; end if;

  select * into charge from public.expenses where id = r.expense_id for update;
  if not found or charge.community_id <> r.community_id or charge.unit_id <> r.unit_id::text
     or charge.status not in ('pending', 'overdue') then
    raise exception 'Selected charge is not payable';
  end if;
  select coalesce(sum(p.amount), 0) into paid_on_charge
    from public.unit_payments p where p.expense_id = r.expense_id;
  if paid_on_charge + r.amount > charge.amount then
    raise exception 'Transfer exceeds the remaining amount of the selected charge';
  end if;

  insert into public.unit_payments
    (community_id, unit_id, expense_id, transfer_report_id, amount, paid_at, method, reference, recorded_by)
  values
    (r.community_id, r.unit_id, r.expense_id, r.id, r.amount, r.paid_at, 'transfer', r.reference, p_admin_id)
  returning id into inserted_payment_id;
  if paid_on_charge + r.amount = charge.amount then
    update public.expenses set status = 'paid', paid_at = now() where id = charge.id;
  end if;
  update public.transfer_reports set status = 'confirmed', reviewed_by = p_admin_id,
    reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = r.id;
  return query select inserted_payment_id, r.unit_id, r.community_id;
end;
$$;
revoke all on function public.confirm_transfer_report(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_transfer_report(uuid, uuid, text) to service_role;
