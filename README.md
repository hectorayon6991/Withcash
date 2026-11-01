# WithCash 💸

App personal (PWA) para controlar gastos, ingresos, pagos fijos y ahorro. Se instala en el iPhone y se usa con **Atajos de iPhone** para registrar un gasto en segundos sin abrir la app.

## Qué hace
- **Inicio**: disponible del mes, ingresos/gastos, saldo por cuenta (Efectivo, Débito, Crédito…), próximos pagos y últimos movimientos.
- **Movimientos**: gastos, ingresos y transferencias del mes, agrupados por día y con filtros.
- **Fijos**: tarjetas de crédito, servicios (luz, internet, colegio), suscripciones y deudas en cuotas. Indica cuándo vence cada uno y si ya está pagado.
- **Balance**: ahorro del mes, fijos vs variables, gastos por categoría comparados con el mes anterior, tendencia de 6 meses y consejos para gastar menos.
- **Atajos de iPhone**: registrar gasto, ingreso o pago fijo desde el Centro de Control. Una automatización diaria te avisa de los pagos por vencer.
- Recordatorios en el **calendario** (.ics), exportación a **CSV/JSON** y uso **sin conexión** (se sincroniza al reconectar).

## Estructura
```
index.html, css/, js/app.js     App (HTML/CSS/JS sin compilación)
js/config.js                    URL y clave publicable de Supabase
js/vendor/supabase.js           supabase-js 2.45.4 (UMD)
sw.js, manifest.webmanifest     PWA (offline + instalación)
supabase/migrations/            Esquema de base de datos con RLS
supabase/functions/atajo/       Endpoint para los Atajos de iPhone
```

## Puesta en marcha
1. Crear un proyecto de Supabase y aplicar `supabase/migrations/0001_init.sql`.
2. Desplegar la función `atajo` con `verify_jwt = false` (se autentica con la llave personal que genera la app).
3. Poner la URL del proyecto y la clave publicable en `js/config.js`.
4. En Supabase → Authentication → URL Configuration, poner la URL de la app como *Site URL*.
5. Publicar la carpeta en cualquier hosting estático con HTTPS (GitHub Pages incluido en `.github/workflows/pages.yml`).

## Instalar en iPhone
Abre la URL en **Safari** → botón Compartir → **Agregar a pantalla de inicio**. Luego, en la app: ⚙️ → **Configurar Atajos**.
