# WithCash — notas para Claude

PWA personal de gastos (HTML/CSS/JS sin compilación) + Supabase + Atajos de iPhone. Interfaz en español, moneda por defecto MXN.
Publicada con GitHub Pages (workflow `.github/workflows/pages.yml`, se despliega en cada push a `main`):
https://hectorayon6991.github.io/Withcash/

## Pendiente: conectar Supabase (proyecto `withcash`, organización "H apps")
1. Buscar el proyecto `withcash` con las herramientas de Supabase (`list_projects`).
2. Aplicar `supabase/migrations/0001_init.sql` con `apply_migration` (nombre `init`). Revisar `get_advisors` (security y performance).
3. Desplegar la Edge Function `atajo` desde `supabase/functions/atajo/index.ts` con **verify_jwt = false**:
   se autentica con la llave personal (`?k=`), cuyo hash SHA-256 se guarda en `api_keys`.
4. Poner en `js/config.js` la URL del proyecto y la clave publicable (`get_project_url`, `get_publishable_keys`).
5. Subir la versión de caché en `sw.js` (`VERSION`) cada vez que cambien los archivos de la app.
6. Probar la función con curl: debe responder 401 sin llave. Para probarla de punta a punta, crear un usuario,
   insertar un hash de llave de prueba con `execute_sql`, registrar un gasto vía POST y luego borrar los datos de prueba.
7. Pedir al usuario que, en Supabase → Authentication → URL Configuration, ponga como Site URL
   `https://hectorayon6991.github.io/Withcash/` (para el correo de confirmación de la cuenta).
8. Hacer commit y push a `main` para que se publique.

## Estructura
- `js/app.js`: toda la lógica (estado, caché local + cola sin conexión, vistas Inicio/Movimientos/Fijos/Balance, ajustes, guía de Atajos).
- Tablas: settings, accounts, categories, fixed_payments, movements, api_keys (todas con RLS por `user_id`).
- Las categorías y cuentas por defecto las crea la app la primera vez que entra el usuario (`seedDefaults`).
