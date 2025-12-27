# Guía de Controles del Panel Admin

Este documento resume qué hace cada sección y cada botón disponibles en las rutas `/admin` y `/admin/cache`. Úsalo como referencia rápida para entender los flujos antes de presionar un control en producción.

## `/admin` – Sincronización de Datos

### Tarjetas Principales

- **Jobs Totales / Completados / Fallidos / Cola Actual**: métricas en tiempo real de la `DataSyncer`.
- **Jobs Ejecutándose, API Calls de hoy, Datos Sincronizados**: ayudan a vigilar límites de la API externa y progreso del día.
- **Última Sincronización**: fecha/hora de la última ejecución exitosa (según `syncer.getStats()`).

### Acciones Disponibles

- `🧠 Smart Sync`: Ejecuta `POST /api/admin/sync` con `action=smart_sync`. Recorre ligas y días relevantes según la hora.
- `📅 Sync Hoy`: `action=start_sync`. Solo baja/actualiza la data del día actual.
- `📚 Sync Histórico`: `action=historical_sync`. Refresca los últimos 30 días.
- `🔴 Sync En Vivo`: `action=force_sync` con `type=live`. Fuerza actualización de partidos en curso.
- `📅/📆/📅 Forzar {Hoy|Ayer|Mañana}`: misma acción `force_sync` ajustando `type` (`today`, `yesterday`, `tomorrow`).
- `⏹️ Detener`: `action=stop`. Limpia la cola interna y detiene jobs en ejecución.
- `🗑️ Limpiar Cola`: `action=clear_queue`. Vacía la cola pendiente (sin tocar jobs activos).

**Qué esperar**: Cada botón devuelve un mensaje de estado, actualiza las métricas y vuelve a consultar `/api/admin/sync`. Si algo falla, verás un mensaje en azul con el error devuelto por la API (en español).

## `/admin/cache` – Gestión de Cache

### Estadísticas

- **Colecciones Estructuradas**: cuenta de documentos en `ligas`, `equipos`, `jugadores`, `partidos`, `standings`, `formaciones`.
- **Empty Queries**: cantidad de entradas en `empty_queries`, usadas para evitar llamadas innecesarias.
- **Totales**: suma de todas las colecciones estructuradas + consultas vacías.

### Acciones

- `Actualizar Estadísticas`: vuelve a pedir `GET /api/cache?action=stats`. Muestra un spinner mientras carga.
- `Limpiar Consultas Vacías Antiguas`: `GET /api/cache?action=clear-expired`. Elimina entradas >30 días y muestra cuántas se borraron.
- `Actualizar Cache`: `POST /api/cron/refresh-cache`. Dispara un `smartSync` autenticado (sin requerir `CRON_SECRET`) y refresca los números.

**Mensajes**: Cada acción escribe su resultado en la tarjeta azul superior. Si el servidor responde con error, el mensaje mostrará la causa devuelta.

## Tests Automatizados

- `app/admin/__tests__/admin-page.test.tsx`: valida que las acciones del panel de sincronización llamen al endpoint correcto y actualicen los mensajes.
- `app/admin/cache/__tests__/cache-page.test.tsx`: cubre la visualización de estadísticas y las acciones de limpieza/refresco de cache.

Ejecuta `yarn test app/admin` para correr ambos bloques de pruebas.
