# Metegol API

API para datos de fútbol usando Next.js y Firebase.

## 📘 Esquema de Firebase – Proyecto Metegol

### Descripción General

El proyecto utiliza Firestore para almacenar datos estructurados de fútbol, replicando la API externa en colecciones normalizadas. Esto permite consultas eficientes y mantiene relaciones consistentes entre entidades.

### Colecciones Principales

| Colección     | Descripción              | Campos Clave                                                         |
| ------------- | ------------------------ | -------------------------------------------------------------------- |
| `ligas`       | Ligas y competiciones    | `id`, `nombre`, `pais`, `logo`, `temporada_actual`                   |
| `equipos`     | Equipos de fútbol        | `id`, `nombre`, `ligaId`, `estadio`, `entrenador`                    |
| `jugadores`   | Jugadores                | `id`, `nombre`, `apellido`, `equipoId`, `posicion`, `dorsal`         |
| `formaciones` | Formaciones/alineaciones | `id`, `equipoId`, `partidoId`, `formacion`, `alineacion`             |
| `partidos`    | Partidos/fixtures        | `id`, `ligaId`, `fecha`, `equipo_local`, `equipo_visitante`, `goles` |
| `standings`   | Tablas de posiciones     | `id`, `ligaId`, `temporada`, `posiciones`                            |

### Relaciones entre Entidades

```
Liga (1) ──< (N) Equipo
Equipo (1) ──< (N) Jugador
Equipo (1) ──< (N) Formacion
Liga (1) ──< (N) Partido
Equipo (N) ──< (N) Partido (home/away)
Liga (1) ──< (N) Standing
```

### Documentación Completa

Para más detalles sobre el esquema, tipos TypeScript, índices recomendados y ejemplos de uso, consulta el archivo **[FIRESTORE_SCHEMA.md](./FIRESTORE_SCHEMA.md)**.

### Scripts Disponibles

#### 1. Listar Colecciones

```bash
npx tsx scripts/checkCollections.ts
```

Lista todas las colecciones existentes en Firestore y cuenta los documentos en cada una.

#### 2. Poblar Datos Iniciales (Recomendado)

```bash
npx tsx scripts/populateInitialData.ts
```

**Script principal de población inicial**. Carga información básica importante (ligas, equipos, formaciones) a Firestore por única vez, para tener poblada la base de datos.

Este script:

- Pobla ligas principales desde `STATIC_LEAGUES`
- Obtiene equipos de las ligas principales desde la API externa
- Obtiene formaciones de partidos recientes (opcional)

**Requisitos**:

- `FOOTBALL_API_KEY` configurada en `.env.local`
- Credenciales de Firebase configuradas

#### 3. Poblar Datos de Ejemplo

```bash
npx tsx scripts/seedFirebase.ts
```

Pobla Firestore con datos de ejemplo iniciales (ligas, equipos, jugadores) usando datos estáticos.

#### 4. Migrar Datos desde api_cache

```bash
npx tsx scripts/migrateCacheToSchema.ts
```

Migra datos desde la colección `api_cache` a las nuevas colecciones estructuradas.

**Nota**: Este script es una base inicial y puede requerir ajustes según la estructura específica de los datos en `api_cache`. Se recomienda revisar y validar los datos migrados después de ejecutar el script.

### Tipos TypeScript

Los tipos TypeScript para las entidades están definidos en `types/futbol.ts`:

- `Liga`: Interface para la colección de ligas
- `Equipo`: Interface para la colección de equipos
- `Jugador`: Interface para la colección de jugadores
- `Formacion`: Interface para la colección de formaciones
- `Partido`: Interface para la colección de partidos
- `Standing`: Interface para la colección de standings

También se incluyen tipos de ayuda:

- `*Input`: Tipos para crear documentos (sin timestamps)
- `*Update`: Tipos para actualizar documentos (campos opcionales)

### Uso en Endpoints

Los endpoints espejo siguen este flujo:

1. **Consultar Firestore primero**: Buscar en las colecciones estructuradas (`ligas`, `equipos`, `partidos`, `standings`)
2. **Si no existe**: Consultar la API externa (usando `FootballApiServer`)
3. **Guardar en Firestore**: Almacenar los datos en las colecciones estructuradas automáticamente
4. **Retornar datos**: Devolver los datos en el mismo formato que la API externa

#### Endpoints Disponibles

Todos los endpoints consultan primero Firestore y luego la API externa si no hay datos:

- **`GET /api/fixtures`**: Obtiene partidos por fecha y/o liga
  - Parámetros: `date`, `league`, `leagues`
  - Consulta primero `partidos` en Firestore
  - Si no hay datos, consulta la API externa y guarda en Firestore

- **`GET /api/standings?id={leagueId}&season={season}`**: Obtiene tabla de posiciones
  - Consulta primero `standings` en Firestore
  - Si no hay datos, consulta la API externa y guarda en Firestore

- **`GET /api/teams/[id]`**: Obtiene información de un equipo y sus partidos
  - Consulta primero `equipos` y `partidos` en Firestore
  - Si no hay datos, consulta la API externa y guarda en Firestore

- **`GET /api/leagues?country={country}`**: Obtiene listado de ligas
  - Consulta primero `ligas` en Firestore
  - Si no hay datos, consulta la API externa y guarda en Firestore
  - Si no hay datos en Firestore ni en la API, usa `STATIC_LEAGUES` como fallback

#### Servicio FirestoreFootballService

El servicio `FirestoreFootballService` (`lib/firestore-football-service.ts`) maneja toda la lógica de consulta y guardado:

- `getFixtures(from, to, leagueId?)`: Obtiene partidos desde Firestore o API externa
- `getStandings(leagueId, season)`: Obtiene tabla de posiciones desde Firestore o API externa
- `getTeams(leagueId?)`: Obtiene equipos desde Firestore o API externa
- `getLeagues(country?)`: Obtiene ligas desde Firestore o API externa
- `getTeamById(teamId)`: Obtiene un equipo por ID desde Firestore
- `getTeamMatches(teamId, season?)`: Obtiene partidos de un equipo desde Firestore
- `saveMatchesToFirestore(matches)`: Guarda partidos en Firestore
- `saveTeamsToFirestore(teams, leagueId)`: Guarda equipos en Firestore

Todos los métodos consultan primero Firestore y solo consultan la API externa si no hay datos.

### Índices Recomendados

Para optimizar consultas comunes, se recomienda crear los siguientes índices compuestos en Firestore:

1. **Equipos por Liga**: `equipos` - `ligaId` (ascending)
2. **Jugadores por Equipo y Posición**: `jugadores` - `equipoId` (ascending), `posicion` (ascending)
3. **Formaciones por Equipo y Fecha**: `formaciones` - `equipoId` (ascending), `fecha` (descending)
4. **Partidos por Liga y Fecha**: `partidos` - `ligaId` (ascending), `fecha` (descending)
5. **Standings por Liga y Temporada**: `standings` - `ligaId` (ascending), `temporada` (ascending)

Ver `firebase.indexes.json` para la configuración de índices.

### Notas de Implementación

- **IDs**: Los IDs de documentos deben coincidir con los IDs de la API externa para facilitar la sincronización
- **Timestamps**: Se usan timestamps de Firestore para `fecha_creacion` y `fecha_actualizacion`
- **Referencias**: Los campos `*Id` son strings que referencian otros documentos, no referencias directas de Firestore
- **Normalización**: Los datos están normalizados para evitar duplicación y facilitar actualizaciones
- **Compatibilidad**: El esquema mantiene compatibilidad con los tipos de la API original

### Seguridad

Las reglas de Firestore deben configurarse para:

- Permitir lectura pública de datos de fútbol (ligas, equipos, jugadores, partidos)
- Restringir escritura solo al servidor (Admin SDK)
- Mantener privacidad de datos administrativos

Ver `firestore.rules` para la configuración actual.

### Configuración de API Externa

Las credenciales de la API externa deben configurarse en `.env.local`:

```env
FOOTBALL_API_KEY=tu_api_key
```

**Nota**: La API externa usa `https://v3.football.api-sports.io` y requiere una API key válida.

### Tests

Los tests están disponibles en `__tests__/`:

- `__tests__/api/fixtures.test.ts`: Tests para el endpoint de fixtures
- `__tests__/api/standings.test.ts`: Tests para el endpoint de standings
- `__tests__/api/teams.test.ts`: Tests para el endpoint de teams
- `__tests__/api/leagues.test.ts`: Tests para el endpoint de leagues
- `__tests__/lib/firestore-football-service.test.ts`: Tests para el servicio

**Nota**: Los tests requieren configuración de Firebase y API key para ejecutarse correctamente.

### Próximos Pasos

1. **Ejecutar script de población inicial**: Ejecutar `npx tsx scripts/populateInitialData.ts` para poblar datos básicos
2. **Configurar índices de Firestore**: Crear los índices recomendados en `firebase.indexes.json`
3. **Ejecutar tests**: Ejecutar los tests para verificar que todo funciona correctamente
4. **Configurar reglas de Firestore**: Actualizar `firestore.rules` para permitir lectura pública de las nuevas colecciones (`ligas`, `equipos`, `partidos`, `standings`, `formaciones`)
