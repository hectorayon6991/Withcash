-- WithCash: esquema inicial
-- Cada fila pertenece a un usuario (auth.users) y RLS limita el acceso a sus propias filas.

create extension if not exists pgcrypto;

-- Ajustes por usuario
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  currency text not null default 'MXN',
  timezone text not null default 'America/Mexico_City',
  budget numeric(12,2),
  savings_goal numeric(12,2),
  updated_at timestamptz not null default now()
);

-- Cuentas: Efectivo, Débito, Crédito, etc.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '💳',
  initial_balance numeric(12,2) not null default 0,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Categorías de gasto o ingreso
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '📦',
  kind text not null default 'gasto' check (kind in ('gasto','ingreso')),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Pagos fijos / recurrentes: servicios, tarjetas, colegio, suscripciones, deudas
create table if not exists public.fixed_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'servicio' check (kind in ('servicio','tarjeta','suscripcion','deuda')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  day smallint not null check (day between 1 and 31),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  remind_days smallint not null default 3 check (remind_days between 0 and 15),
  installments int check (installments is null or installments > 0),   -- deudas: total de cuotas
  installments_paid_before int not null default 0,                      -- cuotas pagadas antes de usar la app
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Movimientos: gastos, ingresos y transferencias
create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('gasto','ingreso','transferencia')),
  amount numeric(12,2) not null check (amount > 0),
  date date not null default current_date,
  note text check (note is null or char_length(note) <= 120),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  fixed_id uuid references public.fixed_payments(id) on delete set null,
  fixed_for text check (fixed_for is null or fixed_for ~ '^\d{4}-\d{2}$'),
  source text not null default 'app' check (source in ('app','atajo')),
  created_at timestamptz not null default now()
);

create index if not exists movements_user_date_idx on public.movements (user_id, date desc);
create index if not exists movements_fixed_idx on public.movements (fixed_id, fixed_for);
create index if not exists accounts_user_idx on public.accounts (user_id);
create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists fixed_user_idx on public.fixed_payments (user_id);
create index if not exists fixed_category_idx on public.fixed_payments (category_id);
create index if not exists fixed_account_idx on public.fixed_payments (account_id);
create index if not exists movements_category_idx on public.movements (category_id);
create index if not exists movements_account_idx on public.movements (account_id);
create index if not exists movements_to_account_idx on public.movements (to_account_id);

-- Llave personal para los Atajos de iPhone (solo se guarda el hash SHA-256)
create table if not exists public.api_keys (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  key_hash text not null unique,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.settings enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.fixed_payments enable row level security;
alter table public.movements enable row level security;
alter table public.api_keys enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','accounts','categories','fixed_payments','movements','api_keys'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
