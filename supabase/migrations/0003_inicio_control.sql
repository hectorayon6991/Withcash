-- WithCash: mes desde el que se lleva el control de fijos ("YYYY-MM").
-- Las ocurrencias de pagos/ingresos fijos anteriores a ese mes no se muestran como vencidas ni pendientes.
alter table public.settings add column if not exists start_month text;
alter table public.settings drop constraint if exists settings_start_month_check;
alter table public.settings add constraint settings_start_month_check
  check (start_month is null or start_month ~ '^\d{4}-\d{2}$');
