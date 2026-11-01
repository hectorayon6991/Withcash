-- WithCash 0006: compras y deudas a meses dentro de una tarjeta de crédito.
-- Solo agrega una tabla y actualiza la lista de tablas de wc_apply. No modifica datos.
-- Un plan reparte un importe en N mensualidades; la deuda total sigue en la tarjeta, pero en cada corte
-- solo se cobra la mensualidad que corresponde. first_month = mes del corte en que se cobra la 1.ª mensualidad.

create table if not exists public.card_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  movement_id uuid references public.movements(id) on delete cascade,      -- compra que originó el plan (opcional)
  name text not null check (char_length(name) between 1 and 60),
  total numeric(14,2) not null check (total > 0),
  installments int not null check (installments between 1 and 72),
  first_month text not null check (first_month ~ '^\d{4}-\d{2}$'),
  status text not null default 'activo' check (status in ('activo','liquidado','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_plans_user_idx on public.card_plans (user_id);
create index if not exists card_plans_account_idx on public.card_plans (account_id);
create index if not exists card_plans_movement_idx on public.card_plans (movement_id);
create unique index if not exists card_plans_one_per_movement on public.card_plans (movement_id) where movement_id is not null;

alter table public.card_plans enable row level security;
drop policy if exists "own rows" on public.card_plans;
create policy "own rows" on public.card_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop trigger if exists wc_touch on public.card_plans;
create trigger wc_touch before update on public.card_plans for each row execute function public.wc_touch();
drop trigger if exists wc_audit on public.card_plans;
create trigger wc_audit after insert or update or delete on public.card_plans for each row execute function public.wc_audit();

-- wc_apply: se agrega card_plans a las tablas permitidas (mismo comportamiento que en 0005)
create or replace function public.wc_apply(ops jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o jsonb; t text; act text; r jsonb; cols text; upd text; conflict text; n int := 0;
  allowed text[] := array['movements','accounts','categories','fixed_payments','settings','fixed_overrides',
                          'savings_goals','savings_contributions','debts','debt_payments','card_plans'];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  for o in select * from jsonb_array_elements(ops) loop
    t := o->>'table'; act := coalesce(o->>'op', 'upsert');
    if not t = any(allowed) then raise exception 'tabla no permitida: %', t; end if;
    if act = 'delete' then
      if t = 'settings' then raise exception 'no se puede borrar settings'; end if;
      execute format('delete from public.%I where id = $1 and user_id = auth.uid()', t) using (o->>'id')::uuid;
    else
      r := (o->'row') || jsonb_build_object('user_id', auth.uid());
      select string_agg(format('%I', k), ','), string_agg(format('%I = excluded.%I', k, k), ',') filter (where k not in ('id','user_id','created_at'))
        into cols, upd from jsonb_object_keys(r) k
        where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = k);
      conflict := case when t = 'settings' then '(user_id)' when act = 'insert_ignore' and t = 'movements' then '(fixed_id, fixed_for)' else '(id)' end;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict %s do %s',
        t, cols, cols, t, conflict, case when act = 'insert_ignore' or upd is null then 'nothing' else 'update set ' || upd end) using r;
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('applied', n);
end $$;
revoke all on function public.wc_apply(jsonb) from public, anon;
grant execute on function public.wc_apply(jsonb) to authenticated;

-- REVERTIR: drop table public.card_plans;  (y volver a crear wc_apply sin 'card_plans')
