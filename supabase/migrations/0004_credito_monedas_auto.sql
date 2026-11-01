-- WithCash: tarjetas de crédito, recurrentes automáticos y multi-moneda.

-- Cuentas: tipo y datos de crédito (límite, día de corte, día límite de pago, tasa anual %)
alter table public.accounts
  add column if not exists kind text not null default 'debito',
  add column if not exists credit_limit numeric(12,2),
  add column if not exists cut_day smallint,
  add column if not exists due_day smallint,
  add column if not exists apr numeric(6,2);
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('efectivo','debito','credito','ahorro','inversion'));
alter table public.accounts drop constraint if exists accounts_cut_day_check;
alter table public.accounts add constraint accounts_cut_day_check check (cut_day is null or cut_day between 1 and 31);
alter table public.accounts drop constraint if exists accounts_due_day_check;
alter table public.accounts add constraint accounts_due_day_check check (due_day is null or due_day between 1 and 31);
alter table public.accounts drop constraint if exists accounts_credit_limit_check;
alter table public.accounts add constraint accounts_credit_limit_check check (credit_limit is null or credit_limit >= 0);

-- Tipo de las cuentas existentes según su nombre/ícono
update public.accounts set kind = 'efectivo' where kind = 'debito' and (name ilike 'efectivo%' or icon in ('💵', 'cash'));
update public.accounts set kind = 'credito' where kind = 'debito' and (name ilike 'cr_dito%' or icon in ('💳', 'card'));

-- Fijos que se registran solos en su fecha
alter table public.fixed_payments add column if not exists auto boolean not null default false;

-- Una sola vez cada ocurrencia de un fijo (evita duplicados entre dispositivos; los NULL no chocan)
create unique index if not exists movements_fixed_once on public.movements (fixed_id, fixed_for);

-- Multi-moneda: el monto se guarda convertido a la moneda principal; se conserva el original
alter table public.movements
  add column if not exists currency text,
  add column if not exists orig_amount numeric(12,2);
alter table public.settings add column if not exists usd_rate numeric(10,4);
