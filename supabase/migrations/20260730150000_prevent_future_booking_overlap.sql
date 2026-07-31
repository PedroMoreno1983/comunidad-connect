-- Prevent new confirmed bookings from overlapping in the same amenity and day.
-- The fixed boundary preserves historical rows while protecting all bookings
-- created on or after the production rollout date.
set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_valid_time_range'
  ) then
    alter table public.bookings
      add constraint bookings_valid_time_range
      check (start_time < end_time) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_no_future_confirmed_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_no_future_confirmed_overlap
      exclude using gist (
        amenity_id with =,
        date with =,
        tsrange(date + start_time, date + end_time, '[)') with &&
      )
      where (status = 'confirmed' and date >= date '2026-07-30');
  end if;
end
$$;
