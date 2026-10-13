create table public.monthly_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (
    month between date '1900-01-01' and date '2100-12-01'
    and extract(day from month) = 1
  ),
  text text not null default '',
  primary key (user_id, month)
);

alter table public.monthly_notes enable row level security;

revoke all on public.monthly_notes from anon, authenticated;
grant select, insert, update on public.monthly_notes to authenticated;

create policy monthly_notes_read on public.monthly_notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy monthly_notes_create on public.monthly_notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy monthly_notes_update on public.monthly_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
