-- Fix MangaMunchies Owner Dashboard theme save error.
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value text not null
);

alter table public.site_settings enable row level security;

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

insert into public.site_settings (setting_key, setting_value)
values ('theme', 'midnight')
on conflict (setting_key) do nothing;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
on public.site_settings for select
to anon, authenticated
using (true);

drop policy if exists "Owner can insert site settings" on public.site_settings;
create policy "Owner can insert site settings"
on public.site_settings for insert
to authenticated
with check (
  exists (
    select 1 from public.site_admins
    where user_id = auth.uid()
  )
);

drop policy if exists "Owner can update site settings" on public.site_settings;
create policy "Owner can update site settings"
on public.site_settings for update
to authenticated
using (
  exists (
    select 1 from public.site_admins
    where user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.site_admins
    where user_id = auth.uid()
  )
);
