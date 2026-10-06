begin;

lock table auth.users in share row exclusive mode;
lock table public.categories in access exclusive mode;
lock table public.entries in share row exclusive mode;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.category_defaults as
  select label, kind, color, sort_order from public.categories;
revoke all on app_private.category_defaults from public, anon, authenticated;

alter table public.categories
  add column user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  add column archived boolean not null default false,
  alter column color set default '#9ab391',
  alter column sort_order set default 1000,
  drop constraint categories_kind_label_key;

insert into public.categories (user_id, label, kind, color, sort_order)
  select users.id, defaults.label, defaults.kind, defaults.color, defaults.sort_order
  from auth.users as users cross join app_private.category_defaults as defaults;

alter table public.entries drop constraint entries_category_id_fkey;

update public.entries as entries
  set category_id = owned.id
  from public.categories as legacy, public.categories as owned
  where entries.category_id = legacy.id
    and legacy.user_id is null
    and owned.user_id = entries.user_id
    and owned.label = legacy.label
    and owned.kind = legacy.kind;

delete from public.categories where user_id is null;

alter table public.categories
  alter column user_id set not null,
  add constraint categories_owner_id_unique unique (user_id, id),
  add constraint categories_label_trimmed check (label = btrim(label)),
  add constraint categories_color_hex check (color ~ '^#[0-9a-fA-F]{6}$');

create unique index categories_owner_label_unique on public.categories (user_id, lower(label));
create index categories_owner_sort on public.categories (user_id, sort_order, id);

alter table public.entries add constraint entries_category_owner_fkey
  foreign key (user_id, category_id) references public.categories (user_id, id);

drop policy categories_read on public.categories;
revoke all on public.categories from anon, authenticated;
grant select, insert on public.categories to authenticated;
grant update (label, archived) on public.categories to authenticated;

create policy categories_read on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy categories_create on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy categories_update on public.categories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function app_private.seed_categories() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (user_id, label, kind, color, sort_order)
    select new.id, label, kind, color, sort_order from app_private.category_defaults;
  return new;
end;
$$;

revoke all on function app_private.seed_categories() from public, anon, authenticated;
create trigger seed_finance_categories after insert on auth.users
  for each row execute function app_private.seed_categories();

create function app_private.validate_entry_category() returns trigger
  language plpgsql set search_path = '' as $$
declare
  removed boolean;
begin
  if tg_op = 'UPDATE' then
    if new.category_id = old.category_id and new.user_id = old.user_id then
      return new;
    end if;
  end if;
  select archived into removed from public.categories
    where id = new.category_id and user_id = new.user_id for share;
  if not found or removed then
    raise exception 'Choose an active category from your account.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_entry_category() from public, anon, authenticated;
create trigger validate_entry_category before insert or update on public.entries
  for each row execute function app_private.validate_entry_category();

commit;
