# 📊 Explicación del Panel de Administración

## 📈 Estadísticas del Panel

### **Jobs Totales** (96 en tu ejemplo)

- **Qué es**: El número total acumulado de trabajos (jobs) que se han creado desde que se inició el servidor.
- **Qué es un Job**: Un trabajo individual de sincronización. Por ejemplo:
  - Sincronizar fixtures de la liga 128 para el 19/11/2025 = 1 job
  - Enriquecer un partido con estadísticas = 1 job
  - Cada combinación de fecha + liga = 1 job
- **Cuándo se actualiza**: Se incrementa cada vez que se crea un nuevo job en la cola (cuando ejecutas un sync).
- **Importante**: Este número **nunca disminuye**, solo aumenta. Es un contador acumulativo.

### **Completados** (64 en tu ejemplo)

- **Qué es**: El número total de jobs que se han completado exitosamente.
- **Cuándo se actualiza**: Cada vez que un job termina sin errores.
- **Importante**: Este número también es acumulativo y nunca disminuye.

### **Fallidos** (0 en tu ejemplo)

- **Qué es**: El número total de jobs que han fallado durante la ejecución.
- **Cuándo se actualiza**: Cuando un job lanza una excepción o error.
- **Importante**: También es acumulativo.

### **Cola Actual** (0 en tu ejemplo)

- **Qué es**: El número de jobs que están actualmente en la cola esperando ser procesados.
- **Cuándo se actualiza**:
  - Aumenta cuando se crean nuevos jobs (al ejecutar un sync)
  - Disminuye cuando los jobs se procesan (completados o fallidos)
  - Se limpia cuando se ejecuta "Limpiar Cola"
- **Diferencia con Jobs Totales**:
  - **Jobs Totales** = todos los jobs que han existido (acumulativo)
  - **Cola Actual** = solo los jobs pendientes/ejecutándose ahora mismo

### **Jobs Ejecutándose** (0 en tu ejemplo)

- **Qué es**: El número de jobs que están siendo procesados en este momento.
- **Cuándo se actualiza**:
  - Aumenta cuando un job pasa de "pending" a "running"
  - Disminuye cuando el job termina (completado o fallido)

### **API Calls Hoy** (47/7500 - 0.6% en tu ejemplo)

- **Qué es**: El número de llamadas reales a la API externa de fútbol (api-sports.io) realizadas hoy.
- **Cuándo se actualiza**:
  - ✅ **SÍ se actualiza** cuando:
    - Un sync hace una llamada real a la API externa (no cuando lee de Firestore)
    - Un cliente fetchea un partido que NO está en Firestore y se consulta la API externa
  - ❌ **NO se actualiza** cuando:
    - Se lee datos de Firestore (cache)
    - Se lee datos del cache en memoria
    - Se consulta `empty_queries` (no hay partidos para esa fecha/liga)
- **Límite**: 7500 llamadas por día (según tu plan de api-sports.io)
- **Reset**: Actualmente **NO se resetea automáticamente** a las 00:00 UTC. Se mantiene acumulativo hasta que reinicies el servidor.
  - **Recomendación**: Deberías implementar un reset diario a las 00:00 UTC para que sea preciso.

### **Datos Sincronizados** (20 en tu ejemplo)

- **Qué es**: El número total de partidos (matches) que se han sincronizado exitosamente.
- **Cuándo se actualiza**: Cada vez que un job completa y guarda partidos en Firestore.
- **Importante**: Es acumulativo.

### **Última Sincronización** (19/11/2025, 04:25:51 en tu ejemplo)

- **Qué es**: La fecha y hora de la última vez que se completó un proceso de sincronización.
- **Cuándo se actualiza**: Cuando se termina de procesar al menos un job (incluso si hay errores).

---

## 🔘 Botones y Acciones

### **Sincronización Forzada**

#### **Forzar Hoy** 🔵

- **Qué hace**: Fuerza la sincronización de todos los partidos de **hoy** (fecha actual), ignorando el cache y TTL.
- **Cuándo usarlo**:
  - Cuando necesitas actualizar datos de partidos que están en vivo
  - Cuando sospechas que hay datos incorrectos en Firestore
  - Cuando quieres refrescar todos los partidos del día actual
- **Qué sincroniza**:
  - Fixtures de todas las ligas configuradas para hoy
  - Enriquecimiento de partidos que necesitan detalles (stats, events, lineups)

#### **Forzar Ayer** 🟡

- **Qué hace**: Fuerza la sincronización de todos los partidos de **ayer**, ignorando el cache y TTL.
- **Cuándo usarlo**:
  - Cuando te perdiste sincronizar ayer y necesitas los datos
  - Cuando quieres actualizar resultados finales de partidos de ayer
  - Para recuperar datos históricos recientes
- **Qué sincroniza**: Similar a "Forzar Hoy" pero para la fecha de ayer

#### **Forzar Mañana** 🟢

- **Qué hace**: Fuerza la sincronización de todos los partidos de **mañana** (fecha futura).
- **Cuándo usarlo**:
  - Para pre-cargar partidos programados para mañana
  - Cuando sabes que habrá partidos importantes y quieres tenerlos listos
  - Para preparar el cache antes de que los usuarios los soliciten
- **Qué sincroniza**: Fixtures programados para mañana (probablemente sin detalles aún)

---

### **Sincronizaciones Automáticas**

#### **1. Sincronización Manual (Start Sync)** 🔄

- **Qué hace**: Sincroniza los datos de **hoy** respetando el cache y TTL.
- **Cuándo usarlo**:
  - Para una sincronización rápida de hoy
  - Cuando quieres que el sistema respete el cache (no fuerza como "Forzar Hoy")
- **Diferencia con "Forzar Hoy"**: Respeta el TTL y no fuerza actualizaciones innecesarias

#### **2. Smart Sync** 🧠

- **Qué hace**: Sincronización inteligente que decide qué sincronizar basándose en:
  - Hora del día (mañana, tarde, noche)
  - Partidos en vivo
  - Datos que necesitan actualización según TTL
- **Cuándo usarlo**:
  - **Uso principal**: Ejecutar periódicamente (cada hora o cada 30 minutos)
  - Para mantener los datos actualizados automáticamente
  - Es el método recomendado para sincronizaciones regulares
- **Qué sincroniza**:
  - **Mañana (00:00-12:00)**: Partidos de hoy + ayer (para resultados finales)
  - **Tarde (12:00-18:00)**: Partidos de hoy + detalles de partidos en vivo
  - **Noche (18:00-00:00)**: Partidos de hoy + mañana (pre-carga)

#### **3. Sincronización Histórica** 📚

- **Qué hace**: Sincroniza los últimos 30 días de partidos.
- **Cuándo usarlo**:
  - **Solo una vez** cuando configuras el sistema por primera vez
  - Para poblar la base de datos con datos históricos
  - **NO ejecutar regularmente** (consume muchas API calls)
- **Advertencia**: Puede crear cientos o miles de jobs y consumir muchas API calls.

#### **4. Sincronización de Ayer** ⏮️

- **Qué hace**: Sincroniza solo los partidos de ayer.
- **Cuándo usarlo**:
  - Cuando te perdiste sincronizar ayer
  - Para actualizar resultados finales de partidos de ayer
  - Más eficiente que "Sincronización Histórica" si solo necesitas ayer

---

### **Control de Cola**

#### **Detener** ⏹️

- **Qué hace**: Detiene el procesamiento de la cola de jobs.
- **Cuándo usarlo**:
  - Cuando quieres pausar la sincronización
  - Si necesitas detener el consumo de API calls
  - Para evitar que se procesen más jobs temporalmente
- **Importante**: Los jobs en la cola **NO se eliminan**, solo se detiene el procesamiento. Puedes reanudar después.

#### **Limpiar Cola** 🗑️

- **Qué hace**: Elimina todos los jobs pendientes de la cola.
- **Cuándo usarlo**:
  - Cuando la cola tiene jobs obsoletos o innecesarios
  - Cuando quieres empezar desde cero
  - Si hay muchos jobs fallidos que no quieres procesar
- **Advertencia**: Los jobs eliminados **NO se recuperan**. Tendrás que crear nuevos jobs con un sync.

---

### **Actualizar Estadísticas** 🔄

- **Qué hace**: Refresca las estadísticas mostradas en el panel **sin ejecutar ningún sync**.
- **Cuándo usarlo**:
  - Para ver las estadísticas actualizadas sin esperar el auto-refresh
  - Cuando quieres verificar el estado actual después de un sync
- **Diferencia con Sync**:
  - **Actualizar Estadísticas**: Solo lee y muestra las estadísticas actuales (no hace nada)
  - **Sync**: Ejecuta trabajos de sincronización (lee/escribe datos, consume API calls)

---

## 🔄 Flujo de Sincronización

### Cuando un Cliente Fetchea un Partido:

1. **Cliente solicita partido** → `/api/fixtures?date=2025-11-19&league=128`

2. **Sistema verifica Firestore**:
   - ✅ Si existe y NO está expirado (según TTL) → Devuelve desde Firestore (NO cuenta API call)
   - ❌ Si NO existe o está expirado → Continúa al paso 3

3. **Sistema verifica `empty_queries` cache**:
   - ✅ Si está en cache (consultado recientemente y no había partidos) → Devuelve vacío (NO cuenta API call)
   - ❌ Si NO está en cache → Continúa al paso 4

4. **Sistema consulta API externa**:
   - Hace llamada real a api-sports.io
   - **✅ SÍ cuenta como API call** (incrementa `apiCallsToday`)
   - Guarda resultados en Firestore
   - Si no hay resultados, guarda en `empty_queries`

### Cuando Ejecutas un Sync:

1. **Creas jobs** → Se incrementa `Jobs Totales` y `Cola Actual`

2. **Procesas jobs**:
   - Cada job verifica Firestore primero
   - Solo consulta API externa si es necesario (según TTL)
   - **Solo cuenta API call si hace llamada real**

3. **Jobs completan**:
   - `Completados` se incrementa
   - `Cola Actual` disminuye
   - `Datos Sincronizados` se incrementa (por cada partido guardado)

---

## ⚠️ Recomendaciones Importantes

### **Reset de API Calls**

Actualmente el contador `API Calls Hoy` **NO se resetea automáticamente** a las 00:00 UTC. Deberías implementar:

```typescript
// En un cron job o al inicio del servidor
// Resetear a las 00:00 UTC diariamente
```

### **Cuándo Usar Cada Tipo de Sync**

| Situación                   | Sync Recomendado                             |
| --------------------------- | -------------------------------------------- |
| Mantener datos actualizados | **Smart Sync** (cada hora)                   |
| Primera configuración       | **Sincronización Histórica** (una vez)       |
| Partidos en vivo            | **Forzar Hoy**                               |
| Recuperar datos perdidos    | **Forzar Ayer** o **Sincronización de Ayer** |
| Pre-cargar mañana           | **Forzar Mañana**                            |

### **Monitoreo de API Calls**

- **0.6% utilizado** (47/7500) = Estás usando muy poco, tienes mucho margen
- **> 90% utilizado** = El sistema automáticamente detiene los syncs para evitar exceder el límite
- **Recomendación**: Monitorea regularmente y ajusta la frecuencia de Smart Sync según tu uso

---

## 📝 Resumen Rápido

- **Jobs Totales**: Contador acumulativo de todos los jobs creados
- **Completados/Fallidos**: Contadores acumulativos de resultados
- **Cola Actual**: Jobs pendientes ahora mismo
- **API Calls Hoy**: Solo cuenta llamadas reales a la API externa (NO cuando lee de Firestore)
- **Smart Sync**: El método recomendado para uso regular
- **Forzar**: Ignora cache y TTL, útil para actualizaciones inmediatas
- **Reset API Calls**: Actualmente NO se resetea automáticamente (debería implementarse)
