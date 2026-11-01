# WithCash — Reporte de fases

Estado real del proyecto. Se actualiza en cada entrega.

## Resumen

| Fase | Estado | Notas |
|---|---|---|
| 1. Auditoría | ✅ Completa | `docs/AUDITORIA.md` |
| 2. Base de datos | ⏳ Escrita, **pendiente de aplicar** | `supabase/migrations/0005_modulos_completos.sql`. Supabase pide confirmación del propietario y no hubo respuesta. |
| 3. Motor financiero, movimientos y cuentas | ✅ Código y pruebas | Cálculos en centavos; movimientos y cuentas completos |
| 4. Pagos y presupuestos | ✅ Código y pruebas | Reprogramar/saltar necesitan la migración 0005 |
| 5. Tarjetas, deudas y ahorros | ✅ Código y pruebas | Deudas y ahorros se activan con la migración 0005 |
| 6. Suscripciones y reportes | ✅ Código y pruebas | |
| 7. Offline y sincronización | ✅ Código y pruebas | Lotes atómicos con `wc_apply` (migración 0005); con la base anterior usa el envío clásico |
| 8. Seguridad, configuración y notificaciones | ✅ Código / ⏳ base | Cuenta privada y bitácora dependen de la migración 0005 |
| 9. Pruebas | ✅ Unitarias y funcionales · ⏳ integración con la base real | La integración contra Supabase (RLS, `wc_apply`, duplicados, registro cerrado) se ejecuta al aplicar la migración |
| 10. Publicación | ✅ App publicada (GitHub Pages) · ⏳ función `atajo` nueva | La función se despliega junto con la migración |

## Funcionalidades implementadas (con lógica real y persistencia)

- **Motor financiero** (`js/finance.js`): todo en centavos enteros; saldo = saldo inicial + movimientos confirmados (+ préstamos); transferencias fuera de ingresos/gastos; intereses de préstamos como gasto; disponible real = saldo − reservado − compromisos no pagados.
- **Movimientos**: importe, fecha, hora, categoría, cuenta, descripción, método de pago, notas, etiquetas, foto del ticket (Storage privado), multimoneda con importe original; crear, editar, eliminar, detalle, buscar y filtrar por fecha, categoría, cuenta, importe y todo el historial.
- **Cuentas**: tipos efectivo/bancaria/débito/ahorro/crédito/inversión/personalizada, institución, moneda, apertura, color, estado, permitir saldo negativo (se valida), historial; tarjetas con límite, disponible, utilizado, corte, fecha límite, tasa, compras, pagos e intereses.
- **Pagos**: frecuencias única, semanal, quincenal, mensual, bimestral, trimestral, semestral y anual; estados pendiente/pagado/vencido/programado; marcar pagado (una sola vez por fecha), reprogramar, saltar, pausar, cancelar, historial, recordatorio y registro automático sin duplicados.
- **Presupuestos**: semanal, quincenal, mensual, anual y por rango, por categoría; gastado, restante, porcentaje y barra; alertas al 50/75/90/100 % y excedido.
- **Ahorros**: metas con objetivo, fecha, cuenta y descripción; aportaciones y retiros; porcentaje, restante, fecha estimada, aportación mensual/semanal necesaria; lo ahorrado se trata como reservado (no se duplica en el patrimonio).
- **Deudas**: «debo» y «me deben», tipo, importe, saldo pendiente, fechas, interés, notas; abonos con capital e intereses (liquidación en el mismo lote atómico), historial.
- **Suscripciones**: importe, frecuencia, cobro, cuenta, estado, mensual equivalente y anual; pausar y cancelar; sin cargos duplicados.
- **Inicio**: 8 indicadores (disponible real, saldo, ingresos, gastos, comprometido, pagos pendientes, deuda total, ahorro acumulado), filtros de periodo, alertas, gráficas.
- **Reportes**: ingresos vs gastos, categorías, cuentas, evolución mensual/anual, comparaciones, ahorro acumulado, evolución de deudas, patrimonio neto; indicadores (totales, diferencia, promedio diario, mayor consumo, variación, capacidad de ahorro); exportación CSV, Excel y PDF por periodo.
- **Búsqueda global** de movimientos, cuentas, pagos, categorías, deudas y suscripciones con filtros.
- **Offline**: IndexedDB; cola persistente con estados; nunca se borra una operación sin confirmación; reintentos; operaciones relacionadas en un solo lote.
- **Seguridad y configuración**: PIN, Face ID, bloqueo por inactividad configurable, modo oscuro/claro/sistema, nombre de la app, formatos de fecha y hora, preferencias de notificación, estado de sincronización.

## Pruebas

- `npm test`: 12 pruebas unitarias del motor financiero → **12/12**.
- `npm run test:e2e`: 34 pruebas funcionales en Chromium con Supabase simulado (iPhone 13, Pixel 7 y escritorio; base actualizada y base anterior) → **34/34**. Cubren los casos 1–21 y 23–25 del documento.
- Pendiente: integración contra la base real (caso 22, permisos RLS; atomicidad de `wc_apply`; índice de duplicados; registro cerrado) — requiere la migración 0005.
- Pendiente: confirmación en dispositivos físicos (iPhone, Android, Windows, Mac) por parte del propietario.

## Errores encontrados y corregidos en esta entrega

1. La cola descartaba operaciones rechazadas por el servidor → ahora quedan en «error» para reintentar o descartar.
2. Sumas de dinero con punto flotante → motor en centavos.
3. La ventana de módulos acumulaba controladores de clic (un botón podía disparar acciones de una ventana anterior) → contenedor nuevo en cada apertura.
4. Caché en `localStorage` con límite de ~5 MB → IndexedDB.

## Pendientes que dependen del propietario

1. **Aprobar la migración 0005** cuando Supabase muestre la confirmación (después: desplegar la función `atajo` y correr las pruebas de integración).
2. En Supabase → Authentication: activar *Leaked password protection*.
3. Borrar el usuario de prueba y la extensión `pg_net` (requiere confirmación).
4. Probar en sus dispositivos reales.
