# WithCash — notas para Claude

PWA personal de gastos (HTML/CSS/JS sin compilación) + Supabase + Atajos de iPhone. Interfaz en español, moneda por defecto MXN.
Publicada con GitHub Pages (workflow `.github/workflows/pages.yml`, se despliega en cada push a `main`):
https://hectorayon6991.github.io/Withcash/

## Supabase (proyecto `withcash`, ref `snccrdjtoxuwefncwhyv`) — ya conectado
- Migración `init` aplicada; Edge Function `atajo` desplegada con **verify_jwt = false**
  (se autentica con la llave personal `?k=`, cuyo hash SHA-256 está en `api_keys`).
- `js/config.js` ya tiene la URL y la clave publicable. Site URL configurada a la URL de GitHub Pages.
- Subir la versión de caché en `sw.js` (`VERSION`) cada vez que cambien los archivos de la app.
- Si se cambia `supabase/functions/atajo/index.ts`, volver a desplegarla (verify_jwt = false).
- La red de las sesiones en la nube bloquea `supabase.co`: para probar la función, usar `pg_net`
  temporalmente desde `execute_sql` y luego quitarlo.

## Estructura
- `js/app.js`: toda la lógica (estado, caché local + cola sin conexión, vistas Inicio/Movimientos/Fijos/Balance, ajustes, guía de Atajos).
- Tablas: settings, accounts, categories, fixed_payments, movements, api_keys (todas con RLS por `user_id`).
- Fijos (`fixed_payments`): `kind` = servicio | tarjeta | suscripcion | deuda (pagos), `ingreso` (sueldo) o
  `presupuesto` (tope por periodo de una categoría; no genera movimientos). `frequency` = mensual (`day`),
  quincenal (`day`, `day2`; 31 = último día) o semanal (`weekday`, 0 = domingo). La ocurrencia pagada/recibida se guarda en
  `movements.fixed_for`: `YYYY-MM` (mensual) o `YYYY-MM-DD` (quincenal/semanal). Esta lógica está duplicada en
  `js/app.js` y en la función `atajo`: si se cambia en una, cambiarla en la otra.
- Inicio del control (`settings.start_month`, Ajustes → «Llevar el control desde»): antes de ese mes no hay fijos
  vencidos ni saldo arrastrado. El «Disponible» de cada mes suma lo que sobró o faltó (ingresos − gastos) de los meses
  anteriores desde ese inicio (`carryIn` en app.js y en `atajo`).
- Las categorías y cuentas por defecto las crea la app la primera vez que entra el usuario (`seedDefaults`).
