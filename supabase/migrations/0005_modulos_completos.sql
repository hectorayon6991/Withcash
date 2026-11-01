-- WithCash 0005: base de datos para el administrador financiero completo.
-- Solo agrega columnas, tablas, índices, políticas y funciones. No borra ni modifica datos existentes.
-- Reversión: ver el bloque «REVERTIR» al final (comentado).

-- ========== 1. Fecha de modificación en todas las tablas ==========
create or replace function public.wc_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

alter table public.accounts       add column if not exists updated_at timestamptz not null default now();
alter table public.categories     add column if not exists updated_at timestamptz not null default now();
alter table public.fixed_payments add column if not exists updated_at timestamptz not null default now();
alter table public.movements      add column if not exists updated_at timestamptz not null default now();

do $$ declare t text; begin
  foreach t in array array['accounts','categories','fixed_payments','movements','settings'] loop
    execute format('drop trigger if exists wc_touch on public.%I', t);
    execute format('create trigger wc_touch before update on public.%I for each row execute function public.wc_touch()', t);
  end loop;
end $$;

-- ========== 2. Movimientos: hora, etiquetas, método de pago, notas y ticket ==========
alter table public.movements
  add column if not exists time time,
  add column if not exists tags text[] not null default '{}',
  add column if not exists payment_method text,
  add column if not exists notes text,
  add column if not exists attachment_path text;
alter table public.movements drop constraint if exists movements_payment_method_check;
alter table public.movements add constraint movements_payment_method_check
  check (payment_method is null or payment_method in ('efectivo','debito','credito','transferencia','otro'));
alter table public.movements drop constraint if exists movements_notes_check;
alter table public.movements add constraint movements_notes_check check (notes is null or char_length(notes) <= 1000);
alter table public.movements drop constraint if exists movements_source_check;
alter table public.movements add constraint movements_source_check check (source in ('app','atajo','auto'));
create index if not exists movements_user_updated_idx on public.movements (user_id, updated_at);
create index if not exists movements_tags_idx on public.movements using gin (tags);

-- ========== 3. Cuentas: institución, moneda, apertura, color, saldo negativo ==========
alter table public.accounts
  add column if not exists institution text,
  add column if not exists currency text not null default 'MXN',
  add column if not exists opened_at date,
  add column if not exists color text,
  add column if not exists allow_negative boolean not null default true;
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check
  check (kind in ('efectivo','banco','debito','credito','ahorro','inversion','otra'));
alter table public.categories add column if not exists color text;

-- ========== 4. Pagos recurrentes / presupuestos: frecuencias, fechas, notas, pausa ==========
alter table public.fixed_payments
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists notes text,
  add column if not exists paused boolean not null default false;
alter table public.fixed_payments drop constraint if exists fixed_payments_kind_check;
alter table public.fixed_payments add constraint fixed_payments_kind_check
  check (kind in ('servicio','tarjeta','suscripcion','deuda','ingreso','presupuesto','seguro','otro'));
alter table public.fixed_payments drop constraint if exists fixed_payments_frequency_check;
alter table public.fixed_payments add constraint fixed_payments_frequency_check
  check (frequency in ('unico','semanal','quincenal','mensual','bimestral','trimestral','semestral','anual','personalizado'));
alter table public.fixed_payments drop constraint if exists fixed_payments_schedule_check;
alter table public.fixed_payments add constraint fixed_payments_schedule_check check (
  (frequency = 'semanal' and weekday is not null)
  or (frequency in ('unico','personalizado') and start_date is not null)
  or (frequency in ('mensual','quincenal') and day is not null)
  or (frequency in ('bimestral','trimestral','semestral','anual') and day is not null and start_date is not null));
alter table public.fixed_payments drop constraint if exists fixed_payments_dates_check;
alter table public.fixed_payments add constraint fixed_payments_dates_check check (end_date is null or start_date is null or end_date >= start_date);

-- Reprogramar o saltar una fecha concreta de un pago recurrente
create table if not exists public.fixed_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fixed_id uuid not null references public.fixed_payments(id) on delete cascade,
  occ_key text not null check (occ_key ~ '^\d{4}-\d{2}(-\d{2})?$'),
  action text not null check (action in ('skip','move')),
  new_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixed_id, occ_key),
  check (action = 'skip' or new_date is not null)
);

-- ========== 5. Ahorros ==========
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  target numeric(14,2) not null check (target > 0),
  target_date date,
  account_id uuid references public.accounts(id) on delete set null,
  description text check (description is null or char_length(description) <= 500),
  icon text not null default 'piggy',
  color text,
  status text not null default 'activa' check (status in ('activa','completada','archivada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),          -- positivo = aportación, negativo = retiro
  date date not null default current_date,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== 6. Deudas y préstamos (lo que debo y lo que me deben) ==========
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  direction text not null check (direction in ('debo','me_deben')),
  kind text not null default 'prestamo' check (kind in ('prestamo','credito','particular','otro')),
  counterparty text check (counterparty is null or char_length(counterparty) <= 60),
  principal numeric(14,2) not null check (principal > 0),
  start_date date not null default current_date,
  due_date date,
  interest_rate numeric(6,2) check (interest_rate is null or interest_rate >= 0),
  account_id uuid references public.accounts(id) on delete set null,   -- cuenta donde entró/salió el dinero (opcional)
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'activa' check (status in ('activa','pagada','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),            -- total del abono
  interest numeric(14,2) not null default 0 check (interest >= 0),
  date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (interest <= amount)
);

create index if not exists savings_goals_user_idx on public.savings_goals (user_id);
create index if not exists savings_contrib_goal_idx on public.savings_contributions (goal_id);
create index if not exists savings_contrib_user_idx on public.savings_contributions (user_id);
create index if not exists debts_user_idx on public.debts (user_id);
create index if not exists debts_account_idx on public.debts (account_id);
create index if not exists savings_goals_account_idx on public.savings_goals (account_id);
create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id);
create index if not exists debt_payments_user_idx on public.debt_payments (user_id);
create index if not exists debt_payments_account_idx on public.debt_payments (account_id);
create index if not exists fixed_overrides_user_idx on public.fixed_overrides (user_id);

-- ========== 7. Configuración ampliada ==========
alter table public.settings
  add column if not exists app_name text,
  add column if not exists theme text not null default 'oscuro',
  add column if not exists date_format text not null default 'dd/mm/aaaa',
  add column if not exists time_format text not null default '24h',
  add column if not exists auto_lock_minutes smallint not null default 1,
  add column if not exists notify jsonb not null default '{"pagos":true,"vencidos":true,"presupuestos":true,"tarjetas":true,"ahorros":true}',
  add column if not exists currencies jsonb not null default '{}';     -- tipos de cambio manuales: {"USD": 18.5, "EUR": 20}
alter table public.settings drop constraint if exists settings_theme_check;
alter table public.settings add constraint settings_theme_check check (theme in ('oscuro','claro','sistema'));

-- ========== 8. RLS en las tablas nuevas ==========
do $$ declare t text; begin
  foreach t in array array['fixed_overrides','savings_goals','savings_contributions','debts','debt_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('drop trigger if exists wc_touch on public.%I', t);
    execute format('create trigger wc_touch before update on public.%I for each row execute function public.wc_touch()', t);
  end loop;
end $$;

-- ========== 9. Bitácora de cambios (auditoría) ==========
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_logs_user_at_idx on public.audit_logs (user_id, at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "read own audit" on public.audit_logs;
create policy "read own audit" on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.wc_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values ((r->>'user_id')::uuid, tg_table_name, nullif(r->>'id','')::uuid, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
revoke all on function public.wc_audit() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['movements','accounts','fixed_payments','categories','savings_goals','savings_contributions','debts','debt_payments','fixed_overrides'] loop
    execute format('drop trigger if exists wc_audit on public.%I', t);
    execute format('create trigger wc_audit after insert or update or delete on public.%I for each row execute function public.wc_audit()', t);
  end loop;
end $$;

-- ========== 10. Operaciones por lote atómicas (para la cola sin conexión) ==========
-- Aplica una lista de operaciones en UNA transacción: o se guardan todas o ninguna.
-- ops = [{"table":"movements","op":"upsert"|"insert_ignore"|"delete","row":{...},"id":"..."}]
create or replace function public.wc_apply(ops jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o jsonb; t text; act text; r jsonb; cols text; upd text; conflict text; n int := 0;
  allowed text[] := array['movements','accounts','categories','fixed_payments','settings','fixed_overrides',
                          'savings_goals','savings_contributions','debts','debt_payments'];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  for o in select * from jsonb_array_elements(ops) loop
    t := o->>'table'; act := coalesce(o->>'op', 'upsert');
    if not t = any(allowed) then raise exception 'tabla no permitida: %', t; end if;
    if act = 'delete' then
      if t = 'settings' then raise exception 'no se puede borrar settings'; end if;
      execute format('delete from public.%I where id = $1 and user_id = auth.uid()', t) using (o->>'id')::uuid;
    else
      r := (o->'row') || jsonb_build_object('user_id', auth.uid());     -- el dueño siempre es quien llama
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

-- ========== 11. Tickets (fotos) en Storage privado ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "tickets own read" on storage.objects;
drop policy if exists "tickets own write" on storage.objects;
drop policy if exists "tickets own update" on storage.objects;
drop policy if exists "tickets own delete" on storage.objects;
create policy "tickets own read" on storage.objects for select to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tickets own write" on storage.objects for insert to authenticated with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tickets own update" on storage.objects for update to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tickets own delete" on storage.objects for delete to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ========== 12. App privada: solo el propietario puede tener cuenta ==========
create table if not exists public.app_owner (email text primary key);
alter table public.app_owner enable row level security;      -- sin políticas: nadie la lee desde la app
-- El propietario es el primer usuario registrado (se evita escribir el correo en el repositorio).
insert into public.app_owner (email)
  select email from auth.users order by created_at limit 1 on conflict do nothing;

create or replace function public.wc_only_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_owner) and not exists (select 1 from public.app_owner where lower(email) = lower(new.email)) then
    raise exception 'Registro cerrado: esta aplicación es privada';
  end if;
  return new;
end $$;
revoke all on function public.wc_only_owner() from public, anon, authenticated;
drop trigger if exists wc_only_owner on auth.users;
create trigger wc_only_owner before insert on auth.users for each row execute function public.wc_only_owner();

-- ========== REVERTIR (manual, solo si hiciera falta) ==========
-- drop trigger wc_only_owner on auth.users; drop function public.wc_only_owner(); drop table public.app_owner;
-- drop function public.wc_apply(jsonb);
-- drop table public.debt_payments, public.debts, public.savings_contributions, public.savings_goals, public.fixed_overrides, public.audit_logs;
-- (las columnas nuevas pueden quedarse: no afectan a la versión anterior de la app)
