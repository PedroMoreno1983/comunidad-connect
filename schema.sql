-- =============================================
-- ComunidadConnect - Schema Completo v5
-- Incluye TODAS las tablas necesarias
-- =============================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- =============================================
-- 1. PERFILES (ya existe)
-- =============================================
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  role text default 'resident',
  avatar_url text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- =============================================
-- 2. UNIDADES (ya existe)
-- =============================================
create table if not exists public.units (
  id uuid default uuid_generate_v4() primary key,
  tower text not null,
  number text not null,
  floor integer not null,
  type text,
  resident_profile_id uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.units enable row level security;
drop policy if exists "Units are viewable by everyone." on public.units;
create policy "Units are viewable by everyone." on public.units for select using (true);
drop policy if exists "Only Admins can manage units." on public.units;
create policy "Only Admins can manage units." on public.units for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

-- =============================================
-- 3. LECTURAS DE AGUA (ya existe)
-- =============================================
create table if not exists public.water_readings (
  id uuid default uuid_generate_v4() primary key,
  unit_id uuid references public.units(id) not null,
  reading_value numeric(10, 2) not null,
  reading_date date not null,
  month text not null,
  year integer not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(unit_id, month, year)
);

alter table public.water_readings enable row level security;

-- =============================================
-- 4. MARKETPLACE (ya existe)
-- =============================================
create table if not exists public.marketplace_items (
  id uuid default uuid_generate_v4() primary key,
  seller_id uuid references public.profiles(id) not null,
  title text not null,
  description text,
  price numeric(10, 2) not null,
  category text,
  images text[],
  is_active boolean default true,
  allow_barter boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.marketplace_items enable row level security;
drop policy if exists "Marketplace items viewable by all" on public.marketplace_items;
create policy "Marketplace items viewable by all" on public.marketplace_items for select using (true);
drop policy if exists "Users can insert own items" on public.marketplace_items;
create policy "Users can insert own items" on public.marketplace_items for insert with check (auth.uid() = seller_id);
drop policy if exists "Users update own items" on public.marketplace_items;
create policy "Users update own items" on public.marketplace_items for update using (auth.uid() = seller_id);

-- =============================================
-- 5. AMENIDADES (NUEVO)
-- =============================================
create table if not exists public.amenities (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  max_capacity integer default 0,
  hourly_rate numeric(10, 2) default 0,
  icon_name text,
  gradient text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.amenities enable row level security;
drop policy if exists "Amenities viewable by all" on public.amenities;
create policy "Amenities viewable by all" on public.amenities for select using (true);
drop policy if exists "Admins manage amenities" on public.amenities;
create policy "Admins manage amenities" on public.amenities for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

-- =============================================
-- 6. RESERVAS / BOOKINGS (NUEVO)
-- =============================================
create table if not exists public.bookings (
  id uuid default uuid_generate_v4() primary key,
  amenity_id uuid references public.amenities(id) not null,
  user_id uuid references public.profiles(id) not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.bookings enable row level security;
drop policy if exists "Users view own bookings" on public.bookings;
create policy "Users view own bookings" on public.bookings for select using (
  auth.uid() = user_id
  or exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);
drop policy if exists "Users create bookings" on public.bookings;
create policy "Users create bookings" on public.bookings for insert with check (auth.uid() = user_id);
drop policy if exists "Admin manage bookings" on public.bookings;
create policy "Admin manage bookings" on public.bookings for update using (
  auth.uid() = user_id
  or exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

-- =============================================
-- 7. ANUNCIOS / FEED (NUEVO)
-- =============================================
create table if not exists public.announcements (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  content text not null,
  author_id uuid references public.profiles(id),
  author_name text,
  priority text default 'info' check (priority in ('info', 'alert', 'event')),
  is_pinned boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.announcements enable row level security;
drop policy if exists "Announcements viewable by all" on public.announcements;
create policy "Announcements viewable by all" on public.announcements for select using (true);
drop policy if exists "Staff create announcements" on public.announcements;
create policy "Staff create announcements" on public.announcements for insert with check (
  exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);

-- =============================================
-- 8. ENCUESTAS / POLLS (NUEVO)
-- =============================================
create table if not exists public.polls (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  category text default 'community',
  status text default 'active' check (status in ('active', 'closed')),
  end_date timestamp with time zone not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.poll_options (
  id uuid default uuid_generate_v4() primary key,
  poll_id uuid references public.polls(id) on delete cascade not null,
  text text not null,
  votes integer default 0,
  display_order integer default 0
);

create table if not exists public.poll_votes (
  id uuid default uuid_generate_v4() primary key,
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(poll_id, user_id)
);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "Polls viewable by all" on public.polls for select using (true);
create policy "Admin create polls" on public.polls for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);
create policy "Options viewable by all" on public.poll_options for select using (true);
create policy "Votes viewable by all" on public.poll_votes for select using (true);
create policy "Users can vote" on public.poll_votes for insert with check (auth.uid() = user_id);

-- =============================================
-- 9. GASTOS COMUNES / EXPENSES (NUEVO)
-- =============================================
create table if not exists public.expenses (
  id uuid default uuid_generate_v4() primary key,
  unit_id uuid references public.units(id) not null,
  month text not null,
  year integer not null,
  total_amount numeric(10, 2) not null,
  status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
  due_date date not null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(unit_id, month, year)
);

create table if not exists public.expense_items (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  category text not null,
  label text not null,
  amount numeric(10, 2) not null
);

alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;

create policy "Residents view own expenses" on public.expenses for select using (
  exists (
    select 1 from public.units u
    where u.id = unit_id and u.resident_profile_id = auth.uid()
  )
  or exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);
create policy "Admin manage expenses" on public.expenses for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);
create policy "Expense items viewable" on public.expense_items for select using (true);

-- =============================================
-- 10. INVITACIONES QR (NUEVO)
-- =============================================
create table if not exists public.qr_invitations (
  id uuid default uuid_generate_v4() primary key,
  resident_id uuid references public.profiles(id) not null,
  unit_id uuid references public.units(id),
  guest_name text not null,
  guest_dni text,
  qr_code text not null,
  valid_from timestamp with time zone not null,
  valid_to timestamp with time zone not null,
  status text default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.qr_invitations enable row level security;
create policy "Residents view own invitations" on public.qr_invitations for select using (
  auth.uid() = resident_id
  or exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);
create policy "Residents create invitations" on public.qr_invitations for insert with check (auth.uid() = resident_id);

-- =============================================
-- 11. VISITANTES / VISITOR LOG (NUEVO)
-- =============================================
create table if not exists public.visitor_logs (
  id uuid default uuid_generate_v4() primary key,
  visitor_name text not null,
  unit_id uuid references public.units(id),
  entry_time timestamp with time zone default now(),
  exit_time timestamp with time zone,
  purpose text,
  registered_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.visitor_logs enable row level security;
create policy "Staff view visitors" on public.visitor_logs for select using (
  exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);
create policy "Staff register visitors" on public.visitor_logs for insert with check (
  exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);

-- =============================================
-- 12. PAQUETES / PACKAGES (NUEVO)
-- =============================================
create table if not exists public.packages (
  id uuid default uuid_generate_v4() primary key,
  recipient_unit_id uuid references public.units(id) not null,
  description text not null,
  received_at timestamp with time zone default now(),
  picked_up_at timestamp with time zone,
  status text default 'pending' check (status in ('pending', 'picked-up')),
  registered_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.packages enable row level security;
create policy "Staff and residents view packages" on public.packages for select using (
  exists (
    select 1 from public.units u
    where u.id = recipient_unit_id and u.resident_profile_id = auth.uid()
  )
  or exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);
create policy "Staff manage packages" on public.packages for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);

-- =============================================
-- 13. SERVICE REQUESTS (NUEVO)
-- =============================================
create table if not exists public.service_requests (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) not null,
  unit_id uuid references public.units(id),
  provider_id text,
  service_type text not null,
  description text not null,
  status text default 'pending' check (status in ('pending', 'approved', 'in-progress', 'completed', 'cancelled')),
  scheduled_date date,
  scheduled_time time,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.service_requests enable row level security;
create policy "Users view own requests" on public.service_requests for select using (
  auth.uid() = requester_id
  or exists ( select 1 from public.profiles where id = auth.uid() and role in ('admin', 'concierge') )
);
create policy "Users create requests" on public.service_requests for insert with check (auth.uid() = requester_id);
create policy "Admin update requests" on public.service_requests for update using (
  auth.uid() = requester_id
  or exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

-- =============================================
-- 14. VOTACIONES / POLLS (NUEVO)
-- =============================================
create table if not exists public.polls (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text not null,
  end_date timestamp with time zone not null,
  status text default 'active' check (status in ('active', 'closed')),
  category text not null check (category in ('maintenance', 'community', 'rules', 'other')),
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.poll_options (
  id uuid default uuid_generate_v4() primary key,
  poll_id uuid references public.polls(id) on delete cascade not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.votes (
  id uuid default uuid_generate_v4() primary key,
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) on delete cascade not null,
  user_id uuid not null, -- Referencia relajada para modo Demo
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(poll_id, user_id) -- Un voto por usuario por votación
);

alter table public.polls enable row level security;
create policy "Polls viewable by all" on public.polls for select using (true);
create policy "Admin manage polls" on public.polls for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

alter table public.poll_options enable row level security;
create policy "Poll options viewable by all" on public.poll_options for select using (true);
create policy "Admin manage options" on public.poll_options for all using (
  exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
);

alter table public.votes enable row level security;
create policy "Votes viewable by all" on public.votes for select using (true);
CREATE POLICY "Allow inserts from Demo users" ON public.votes FOR INSERT WITH CHECK (true);
