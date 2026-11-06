-- MangaMunchies multi-page chapters + reader preferences
-- Safe additive migration: existing manga, comments, views, themes and owner records remain.
alter table public.public_manga
  add column if not exists chapter_id uuid,
  add column if not exists volume_name text,
  add column if not exists chapter_name text,
  add column if not exists page_number integer;

update public.public_manga
set volume_name = coalesce(nullif(trim(volume_name), ''), 'Volume 1')
where volume_name is null or trim(volume_name) = '';

update public.public_manga
set chapter_name = coalesce(nullif(trim(chapter_name), ''), nullif(trim(volume), ''), 'Chapter 1')
where chapter_name is null or trim(chapter_name) = '';

update public.public_manga
set page_number = 1
where page_number is null;

create index if not exists public_manga_chapter_pages_idx
  on public.public_manga(title, volume_name, chapter_name, chapter_id, page_number);

insert into public.site_settings(setting_key, setting_value)
values ('default_reader_style', 'vertical')
on conflict (setting_key) do nothing;
