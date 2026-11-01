# WithCash — Auditoría y plan de trabajo (Fase 1)

Fecha: 1 de noviembre de 2026. Auditoría hecha antes de modificar archivos o base de datos.

## 1. Tecnologías actuales

| Área | Lo que hay | Decisión |
|---|---|---|
| Frontend | HTML + CSS + JavaScript sin compilación (`index.html`, `css/styles.css`, `js/app.js` ~2,300 líneas, `js/icons.js`) | **Se conserva.** Migrar a React/TypeScript/Vite equivale a reconstruir la app desde cero, que el documento prohíbe; la arquitectura actual funciona y soporta todo lo pedido. |
| Backend | Supabase (PostgreSQL 17, Auth, RLS, Edge Function `atajo` en Deno) | Se conserva y se amplía. |
| Hosting | GitHub Pages con despliegue automático en cada push a `main` | Se conserva. **No existe conexión con Vercel**; no hace falta. |
| PWA | `manifest.webmanifest` + `sw.js` (caché del shell, red primero) | Se conserva y se mejora. |
| Offline | Caché y cola de cambios en `localStorage` | **Se migra a IndexedDB** (sin dependencia externa; Dexie no es necesario para un almacén clave‑valor) por el límite de ~5 MB de `localStorage`. |
| Atajos de iPhone | Edge Function `atajo` autenticada con llave personal (hash SHA‑256) | Se conserva y se actualiza con las nuevas frecuencias. |

## 2. Base de datos (Supabase, proyecto `withcash`)

Tablas existentes, todas con RLS `own rows` (`auth.uid() = user_id`):

| Tabla | Uso | Equivalente en el documento |
|---|---|---|
| `settings` | moneda, zona horaria, presupuesto, inicio del control, tipo de cambio | `app_settings` |
| `accounts` | cuentas y tarjetas (tipo, límite, corte, fecha de pago, tasa) | `accounts` + `credit_cards` |
| `categories` | categorías de gasto e ingreso | `categories` |
| `movements` | ingresos, gastos y transferencias (una sola fila por transferencia → atómica) | `transactions` |
| `fixed_payments` | pagos recurrentes, suscripciones, ingresos fijos, presupuestos y préstamos en cuotas | `recurring_payments`, `subscriptions`, `budgets` |
| `api_keys` | llave de los Atajos | — |

**Decisión:** no se renombran tablas (rompería la app instalada, los Atajos y los datos). Se amplían las existentes y se agregan las que faltan: `savings_goals`, `savings_contributions`, `debts`, `debt_payments`, `fixed_overrides` (reprogramar/saltar pagos), `audit_logs` y el bucket de Storage `tickets`.

Datos reales actuales: 1 usuario propietario + 1 usuario de prueba pendiente de borrar; 4 movimientos, 18 fijos, 4 cuentas.

## 3. Lo que ya funciona

- Autenticación con correo y contraseña, recuperación de contraseña, RLS en todas las tablas.
- Ingresos, gastos y transferencias (la transferencia no cuenta como ingreso ni gasto).
- Cuentas con saldo calculado (saldo inicial + movimientos), tarjetas de crédito con límite, corte, fecha de pago, tasa, pago (transferencia) e intereses.
- Fijos mensuales/quincenales/semanales, ingresos fijos, presupuestos por categoría, recurrentes automáticos sin duplicados (índice único `(fixed_id, fixed_for)`).
- Inicio con alertas, gráficas, anillos; Reportes con patrimonio, comparaciones, Excel/PDF/CSV/JSON.
- Restaurar respaldo, PIN y Face ID, multi‑moneda con tipo de cambio manual, modo offline con cola.

## 4. Errores y riesgos encontrados

| # | Problema | Riesgo | Corrección (fase) |
|---|---|---|---|
| R1 | La cola offline **descarta** una operación si el servidor la rechaza (solo muestra un aviso) | Pérdida de datos | Conservar con estado «error», reintentar o descartar a mano (F7) |
| R2 | Sumas de dinero con punto flotante en JavaScript | Centavos descuadrados | Motor de cálculo en centavos enteros (F3) |
| R3 | Caché en `localStorage` (~5 MB) | Fallo silencioso con mucho historial | IndexedDB (F7) |
| R4 | Cualquiera puede crear una cuenta (los datos están aislados por RLS, pero la app no es privada) | Uso no autorizado | Bloqueo de registros nuevos en la base (F8) |
| R5 | Sin bitácora de cambios | Sin trazabilidad | `audit_logs` con disparadores (F2) |
| R6 | `pg_net` instalado en `public` y usuario de prueba | Aviso de seguridad | Quitar al terminar las pruebas (F9) |
| R7 | «Leaked password protection» desactivado | Contraseñas filtradas | Se activa en el panel de Supabase (lo hace el propietario) |
| R8 | Movimientos sin hora, etiquetas, método de pago, adjuntos ni `updated_at` | Funcionalidad faltante | F2/F3 |
| R9 | Sin fecha de modificación en los registros | Conflictos de sincronización | `updated_at` + disparador (F2) |

## 5. Plan por fases

1. **Auditoría** (este documento).
2. **Base de datos:** columnas nuevas (hora, etiquetas, método, `updated_at`, institución, color, moneda de cuenta, frecuencias nuevas), tablas nuevas, auditoría, bucket de tickets, todo con RLS. Migraciones no destructivas.
3. **Motor financiero:** cálculos en centavos (`js/finance.js` con pruebas unitarias), movimientos con todos los campos, buscador y filtros, cuentas completas.
4. **Pagos y presupuestos:** frecuencias único/semanal/quincenal/mensual/bimestral/trimestral/semestral/anual, estados, reprogramar/saltar, presupuestos semanales/mensuales/anuales/personalizados con alertas 50/75/90/100 %.
5. **Tarjetas, deudas y ahorros:** historial de compras y pagos por tarjeta, módulo Deudas (debo / me deben, abonos), módulo Ahorros (metas, aportaciones y retiros, reservado).
6. **Suscripciones y reportes:** pausar/cancelar, filtros de periodo en Inicio y Reportes, indicadores pedidos, CSV/Excel/PDF por periodo.
7. **Offline:** IndexedDB, cola persistente con estados sincronizado/pendiente/error, operaciones atómicas por lote (RPC), nunca borrar antes de confirmar.
8. **Seguridad, configuración y notificaciones:** cuenta privada, bloqueo por inactividad, modo claro, formatos, recordatorios locales.
9. **Pruebas:** unitarias (Node), integración contra Supabase con datos temporales, funcionales en navegador (iPhone/Android/escritorio simulados).
10. **Optimización y publicación.**

## 6. Limitaciones conocidas (no se pueden resolver desde el código)

- **Notificaciones con la app cerrada en iPhone** requieren un servidor de Web Push; se implementan recordatorios locales y se mantiene la automatización diaria de Atajos.
- **Face ID** depende de que Safari permita llaves de acceso en la PWA; si no, queda el PIN.
- **Pruebas en dispositivos reales** (iPhone, Android, Windows, Mac) las debe confirmar el propietario; aquí se prueban con navegadores simulados.
- Configuraciones del panel de Supabase (protección de contraseñas filtradas, desactivar registros) las hace el propietario.
