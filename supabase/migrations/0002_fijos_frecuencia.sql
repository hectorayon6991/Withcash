-- WithCash: fijos con frecuencia (mensual, quincenal, semanal), ingresos fijos y presupuestos.
--   kind 'ingreso'     -> ingreso fijo (sueldo); al recibirlo se registra un movimiento de ingreso.
--   kind 'presupuesto' -> tope de gasto por periodo para una categoría (ej. gasolina $850 cada semana);
--                         no genera movimientos: se compara con los gastos de esa categoría en el periodo.
-- Ocurrencias guardadas en movements.fixed_for:
--   mensual -> 'YYYY-MM'   ·   quincenal / semanal -> 'YYYY-MM-DD' (fecha de la ocurrencia)

alter table public.fixed_payments
  add column if not exists frequency text not null default 'mensual',
  add column if not exists weekday smallint,   -- semanal: 0 = domingo … 6 = sábado
  add column if not exists day2 smallint;      -- quincenal: segundo día (31 = último día del mes)

alter table public.fixed_payments alter column day drop not null;

alter table public.fixed_payments drop constraint if exists fixed_payments_kind_check;
alter table public.fixed_payments add constraint fixed_payments_kind_check
  check (kind in ('servicio','tarjeta','suscripcion','deuda','ingreso','presupuesto'));

alter table public.fixed_payments drop constraint if exists fixed_payments_frequency_check;
alter table public.fixed_payments add constraint fixed_payments_frequency_check
  check (frequency in ('mensual','quincenal','semanal'));

alter table public.fixed_payments drop constraint if exists fixed_payments_weekday_check;
alter table public.fixed_payments add constraint fixed_payments_weekday_check
  check (weekday is null or weekday between 0 and 6);

alter table public.fixed_payments drop constraint if exists fixed_payments_day2_check;
alter table public.fixed_payments add constraint fixed_payments_day2_check
  check (day2 is null or day2 between 1 and 31);

alter table public.fixed_payments drop constraint if exists fixed_payments_schedule_check;
alter table public.fixed_payments add constraint fixed_payments_schedule_check
  check ((frequency = 'semanal' and weekday is not null) or (frequency <> 'semanal' and day is not null));

alter table public.movements drop constraint if exists movements_fixed_for_check;
alter table public.movements add constraint movements_fixed_for_check
  check (fixed_for is null or fixed_for ~ '^\d{4}-\d{2}(-\d{2})?$');
