-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

create table if not exists public.reservations (
    id uuid primary key,
    created_at timestamptz not null default now(),
    guest_name text not null,
    phone text not null,
    date text not null,
    time text not null,
    guests integer not null,
    special_requests text default '',
    start_at timestamptz,
    end_at timestamptz,
    timezone text default 'UTC',
    status text not null default 'confirmed',
    calendar_event_id text,
    calendar_synced boolean default false,
    calendar_link text,
    decline_reason text,
    calendar_sync_error text,
    session_id text
);

create table if not exists public.conversation_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    session_id text,
    category text not null,
    message text not null,
    metadata jsonb default '{}'::jsonb
);

create index if not exists reservations_date_time_idx on public.reservations (date, time);
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists conversation_logs_session_idx on public.conversation_logs (session_id);
create index if not exists conversation_logs_created_idx on public.conversation_logs (created_at desc);

alter table public.reservations enable row level security;
alter table public.conversation_logs enable row level security;

-- Service role bypasses RLS. Anon read for admin UI (optional):
create policy "Allow anon read reservations"
    on public.reservations for select
    using (true);

create policy "Allow anon read conversation_logs"
    on public.conversation_logs for select
    using (true);
