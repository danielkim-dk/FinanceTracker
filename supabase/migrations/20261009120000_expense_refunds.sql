begin;

alter table public.entries
  drop constraint entries_amount_cents_check,
  add constraint entries_amount_cents_check
    check (amount_cents <> 0 and amount_cents between -99999999999 and 99999999999);

create or replace function app_private.validate_entry_category() returns trigger
  language plpgsql set search_path = '' as $$
declare
  entry_kind text;
  removed boolean;
begin
  select kind, archived into entry_kind, removed from public.categories
    where id = new.category_id and user_id = new.user_id for share;
  if not found then
    raise exception 'Choose an active category from your account.' using errcode = '23514';
  end if;
  if new.amount_cents < 0 and entry_kind <> 'expense' then
    raise exception 'Income and investment amounts must be positive.' using errcode = '23514';
  end if;
  if removed then
    if tg_op = 'UPDATE' then
      if new.category_id = old.category_id and new.user_id = old.user_id then
        return new;
      end if;
    end if;
    raise exception 'Choose an active category from your account.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_entry_category() from public, anon, authenticated;

commit;
