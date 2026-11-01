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

## Pruebas
- `npm test` → pruebas unitarias del motor financiero (`tests/finance.test.js`, Node, sin dependencias).
- `npm run serve` y luego `npm run test:e2e` → pruebas funcionales en Chromium con Supabase simulado (`tests/e2e.js`).
- Ejecutarlas antes de cada push que toque cálculos o la cola de sincronización.

## Estructura
- `js/finance.js`: motor financiero en CENTAVOS ENTEROS (saldos, totales, recurrencias, presupuestos, deudas, metas). Úsalo para cualquier suma de dinero; no sumes `Number(amount)` directamente.
- `js/store.js`: IndexedDB (caché y cola). La cola (`OUTBOX` en app.js) guarda entradas con varias operaciones que se envían juntas a la función `wc_apply` (lote atómico); una entrada solo se borra cuando el servidor la confirma. Si la base no tiene la migración 0005 (`S.dbv = 4`) la app usa el envío anterior y deja en espera las tablas nuevas.
- Módulos: Inicio, Movimientos, Pagos (`viewFijos`), Reportes (`viewBalance`) en la barra; Cuentas, Presupuestos, Ahorros, Deudas, Suscripciones, Buscar y Configuración en el menú «Más» (`openMore`). Formularios de módulos en la ventana genérica `openDyn`.
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
- Cuentas: `kind` = efectivo | debito | credito | ahorro | inversion. Las de crédito tienen `credit_limit`, `cut_day`,
  `due_day` y `apr`; su saldo negativo es la deuda. Pagar la tarjeta = transferencia; intereses = gasto en categoría «Intereses».
- Fijos con `auto = true` se registran solos (`autoPostRecurring`); el índice único `(fixed_id, fixed_for)` evita duplicados.
- Multi-moneda: `movements.amount` siempre en la moneda principal; si se capturó en dólares guarda `currency = 'USD'`
  y `orig_amount`. Tipo de cambio en `settings.usd_rate`.
- Bloqueo con PIN / Face ID (WebAuthn) solo en el dispositivo (`localStorage.wc_lock`). Íconos propios en `js/icons.js`.
- Las categorías y cuentas por defecto las crea la app la primera vez que entra el usuario (`seedDefaults`).
