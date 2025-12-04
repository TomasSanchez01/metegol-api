# 📅 Gestión del TTL (Time To Live) en el Sistema

Este documento explica dónde y cómo se maneja el TTL en el sistema de cache.

## 📍 Ubicaciones del Manejo de TTL

### 1. **Cálculo de TTL** - `lib/cache/ttl.ts`

Este archivo contiene las funciones que calculan los valores de TTL según el estado y fecha del partido:

- **`calculateFixtureTtlMs(matchDate, status)`**: Calcula el TTL para datos básicos del partido (fixtures)
  - Partidos en vivo: **5 minutos**
  - Partidos futuros: **2 horas**
  - Partidos terminados hoy: **24 horas**
  - Partidos terminados en el pasado: **30 días**
  - Default: **1 hora**

- **`calculateDetailsTtlMs(status)`**: Calcula el TTL para estadísticas y eventos (detalles)
  - Partidos en vivo: **5 minutos**
  - Partidos terminados: **24 horas**
  - Default: **1 hora**

- **`calculateLineupsTtlMs()`**: Calcula el TTL para formaciones
  - Siempre: **30 días** (datos estáticos)

### 2. **Verificación de TTL** - `lib/firestore-football-service.ts`

#### Métodos de Verificación:

- **`isTimestampExpired(timestamp)`** (línea ~55)
  - Verifica si un timestamp TTL ha expirado
  - Retorna `true` si el timestamp es `null`, `undefined` o está en el pasado

- **`isFixtureDataStale(partido)`** (línea ~62)
  - Verifica si los datos básicos del partido (fixture) están expirados
  - Usa `isTimestampExpired(partido.ttl_fixture)`

- **`isDetailsDataStale(partido)`** (línea ~66)
  - Verifica si los detalles (estadísticas/eventos) están expirados
  - Lógica especial:
    - Si no tiene `ttl_detalles` y el partido es antiguo (>7 días), retorna `false` (no intentar enriquecer)
    - Si tiene `ttl_detalles` con TTL largo (30 días), retorna `false` (ya se intentó, no están disponibles)
    - Si tiene `ttl_detalles` normal, verifica si está expirado

- **`shouldRefreshFixtures(partidos)`** (línea ~118)
  - Verifica si alguno de los partidos necesita refrescarse
  - Usa `isFixtureDataStale()` para cada partido

### 3. **Establecimiento de TTL** - `lib/firestore-football-service.ts`

#### En `saveMatchesToFirestore()` (línea ~1789):

**TTL para Fixtures** (línea ~1917):
```typescript
const fixtureTtlMs = calculateFixtureTtlMs(matchDate, estado.corto);
partido.ttl_fixture = Timestamp.fromMillis(Date.now() + fixtureTtlMs);
```
- Se establece **siempre** cuando se guarda un partido
- Se calcula basándose en la fecha del partido y su estado

**TTL para Detalles** (línea ~1946):
```typescript
const detailsTtlMs = calculateDetailsTtlMs(match.fixture.status.short);
if (match.statistics || match.events) {
  // Si hay estadísticas/eventos, establecer TTL normal
  partido.ttl_detalles = Timestamp.fromMillis(Date.now() + detailsTtlMs);
} else if (existingPartido?.ttl_detalles) {
  // Preservar TTL existente si no hay nuevas estadísticas/eventos
  partido.ttl_detalles = existingPartido.ttl_detalles;
} else {
  // Si no hay estadísticas/eventos y no hay ttl_detalles existente,
  // establecer TTL largo (30 días) para partidos terminados
  // Esto evita intentar enriquecer repetidamente
  if (isFinishedStatus(match.fixture.status.short) || isLiveStatus(match.fixture.status.short)) {
    if (daysSinceMatch > 1) {
      partido.ttl_detalles = Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000));
    }
  }
}
```

### 4. **Uso del TTL en Consultas** - `lib/firestore-football-service.ts`

#### En `getFixtures()` (línea ~166):

**Verificación de Fixtures Expirados** (línea ~203):
```typescript
if (leagueId && this.shouldRefreshFixtures(partidosDocs)) {
  const refreshedMatches = await this.refreshFixturesFromExternal(...);
}
```
- Si los fixtures están expirados, se refrescan desde la API externa

**Filtrado de Partidos que Necesitan Detalles** (línea ~198):
```typescript
const matchesNeedingDetails = matches.filter((match, index) => {
  const partido = partidosDocs[index];
  const hasAllDetails = !!match.statistics && !!match.events;
  const detailsStale = this.isDetailsDataStale(partido);
  
  // Lógica para evitar enriquecer partidos antiguos sin estadísticas
  // ...
  
  return !hasAllDetails || detailsStale;
});
```
- Solo se enriquecen partidos que:
  - No tienen todos los detalles Y el TTL está expirado
  - O son muy recientes y no tienen detalles

#### En `getFixturesForMultipleLeagues()` (línea ~353):

Similar lógica a `getFixtures()`, pero para múltiples ligas.

### 5. **TTL para Formaciones** - `lib/firestore-football-service.ts`

En `saveLineupsToFormaciones()` (línea ~1649):
```typescript
ttl_expiracion: Timestamp.fromMillis(
  Date.now() + calculateLineupsTtlMs() // 30 días
)
```

## 🔄 Flujo Completo del TTL

### Cuando se Guarda un Partido:

1. **Se calcula `ttl_fixture`**:
   - Basado en fecha del partido y estado
   - Se establece **siempre**

2. **Se calcula `ttl_detalles`**:
   - Si hay estadísticas/eventos: TTL normal (5 min - 24 horas según estado)
   - Si NO hay estadísticas/eventos:
     - Si el partido es antiguo (>1 día): TTL largo (30 días) para evitar reintentos
     - Si el partido es reciente (<1 día): TTL normal para permitir reintentos

### Cuando se Consulta un Partido:

1. **Se verifica `ttl_fixture`**:
   - Si está expirado → Se refresca desde la API externa

2. **Se verifica `ttl_detalles`**:
   - Si está expirado Y el partido es reciente → Se intenta enriquecer
   - Si tiene TTL largo (30 días) → No se intenta enriquecer (ya se intentó antes)
   - Si no tiene `ttl_detalles` y es antiguo → No se intenta enriquecer

## 📊 Valores de TTL por Tipo

| Tipo de Dato | Estado | TTL |
|--------------|--------|-----|
| **Fixture** | En vivo | 5 minutos |
| **Fixture** | Futuro | 2 horas |
| **Fixture** | Terminado hoy | 24 horas |
| **Fixture** | Terminado (pasado) | 30 días |
| **Detalles** | En vivo | 5 minutos |
| **Detalles** | Terminado | 24 horas |
| **Detalles** | Sin estadísticas (antiguo) | 30 días (evitar reintentos) |
| **Formaciones** | Cualquiera | 30 días |

## 🎯 Objetivo del TTL

El TTL permite:
1. **Evitar llamadas innecesarias** a la API externa
2. **Mantener datos actualizados** para partidos en vivo
3. **Preservar datos históricos** sin refrescarlos constantemente
4. **Evitar reintentos** para partidos que no tienen estadísticas disponibles

## 🔍 Archivos Relacionados

- `lib/cache/ttl.ts` - Cálculo de valores TTL
- `lib/firestore-football-service.ts` - Uso y verificación de TTL
- `types/futbol.ts` - Definición de tipos con campos TTL
- `PRELOAD_SYSTEM.md` - Documentación original del sistema de preload

