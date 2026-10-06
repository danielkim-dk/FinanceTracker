create table public.categories (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 60),
  kind text not null check (kind in ('income', 'expense', 'investment')),
  color text not null,
  sort_order integer not null,
  unique (kind, label)
);

insert into public.categories (label, kind, color, sort_order) values
  ('Salary', 'income', '#2d6a4f', 1),
  ('Freelance', 'income', '#74a57f', 2),
  ('Other income', 'income', '#a8c9ae', 3),
  ('Housing', 'expense', '#dca471', 10),
  ('Food & dining', 'expense', '#d68169', 11),
  ('Groceries', 'expense', '#b8bc86', 12),
  ('Transport', 'expense', '#86aaa3', 13),
  ('Shopping', 'expense', '#a89abb', 14),
  ('Health', 'expense', '#c996a5', 15),
  ('Subscriptions', 'expense', '#7c9db8', 16),
  ('Entertainment', 'expense', '#d3b56b', 17),
  ('Other expense', 'expense', '#a4a9a2', 18),
  ('Brokerage', 'investment', '#8e88bb', 20),
  ('Retirement', 'investment', '#aea9cc', 21),
  ('Savings', 'investment', '#8aab8d', 22),
  ('Other investment', 'investment', '#b9bfd3', 23);

create table public.entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null check (occurred_on between date '1900-01-01' and date '2100-12-31'),
  category_id uuid not null references public.categories(id),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  description text not null default '' check (char_length(description) <= 240 and description = btrim(description)),
  created_at timestamptz not null default now()
);

create index entries_user_date_id on public.entries (user_id, occurred_on, id);

alter table public.categories enable row level security;
alter table public.entries enable row level security;

revoke all on public.categories from anon, authenticated;
revoke all on public.entries from anon, authenticated;
grant select on public.categories to authenticated;
grant select, insert, update, delete on public.entries to authenticated;

create policy categories_read on public.categories for select to authenticated using (true);
create policy entries_read on public.entries for select to authenticated using ((select auth.uid()) = user_id);
create policy entries_create on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy entries_update on public.entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy entries_delete on public.entries for delete to authenticated using ((select auth.uid()) = user_id);
