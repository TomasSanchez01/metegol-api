# 📘 Esquema de Firestore - Proyecto Metegol

## 📋 Descripción General

Este documento describe el esquema estructurado de Firestore diseñado para replicar y normalizar los datos de la API de Fútbol. El esquema está diseñado para facilitar consultas eficientes y mantener relaciones consistentes entre entidades.

## 🎯 Propósito

- **Normalización de datos**: Organizar la información de la API externa en colecciones estructuradas
- **Optimización de consultas**: Permitir consultas rápidas y eficientes sobre ligas, equipos, jugadores, etc.
- **Compatibilidad**: Mantener compatibilidad con los tipos de datos de la API original
- **Escalabilidad**: Preparar la base para endpoints espejo que lean primero de Firebase, luego de la API

## 📊 Diagrama de Colecciones

```
firestore/
├── ligas/              # Colección de ligas
│   └── {ligaId}        # Documento por liga
│
├── equipos/            # Colección de equipos
│   └── {equipoId}      # Documento por equipo
│
├── jugadores/          # Colección de jugadores
│   └── {jugadorId}     # Documento por jugador
│
├── formaciones/        # Colección de formaciones/alineaciones
│   └── {formacionId}   # Documento por formación
│
├── partidos/           # Colección de partidos/fixtures
│   └── {partidoId}     # Documento por partido
│
└── standings/          # Colección de tablas de posiciones
    └── {standingId}    # Documento por tabla de posiciones
```

## 🔗 Relaciones entre Entidades

```
Liga (1) ──< (N) Equipo
Equipo (1) ──< (N) Jugador
Equipo (1) ──< (N) Formacion
Liga (1) ──< (N) Partido
Equipo (N) ──< (N) Partido (home/away)
Liga (1) ──< (N) Standing
```

## 📦 Estructura de Colecciones

### 1. Colección: `ligas`

**Propósito**: Almacenar información de ligas y competiciones.

**Estructura del documento**:
```json
{
  "id": "128",
  "nombre": "Liga Profesional",
  "pais": "Argentina",
  "logo": "https://media.api-sports.io/football/leagues/128.png",
  "temporada_actual": "2024",
  "tipo": "league",
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T10:00:00Z"
}
```

**Campos**:
- `id` (string): ID único de la liga (de la API externa)
- `nombre` (string): Nombre de la liga
- `pais` (string): País de la liga
- `logo` (string): URL del logo de la liga
- `temporada_actual` (string): Temporada actual (ej: "2024")
- `tipo` (string): Tipo de competición (league, cup, etc.)
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización

**Índices sugeridos**:
- `pais` (ascending)
- `tipo` (ascending)
- `temporada_actual` (ascending)

---

### 2. Colección: `equipos`

**Propósito**: Almacenar información de equipos de fútbol.

**Estructura del documento**:
```json
{
  "id": "435",
  "nombre": "River Plate",
  "abreviatura": "RIV",
  "escudo": "https://media.api-sports.io/football/teams/435.png",
  "ligaId": "128",
  "estadio": "Estadio Monumental",
  "entrenador": "Marcelo Gallardo",
  "entrenadorId": "12345",
  "ciudad": "Buenos Aires",
  "fundacion": 1901,
  "colores": {
    "principal": "#E91E63",
    "secundario": "#FFFFFF"
  },
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T10:00:00Z"
}
```

**Campos**:
- `id` (string): ID único del equipo (de la API externa)
- `nombre` (string): Nombre del equipo
- `abreviatura` (string): Abreviatura del equipo (opcional)
- `escudo` (string): URL del escudo del equipo
- `ligaId` (string): ID de la liga principal (referencia a `ligas/{ligaId}`)
- `estadio` (string): Nombre del estadio
- `entrenador` (string): Nombre del entrenador
- `entrenadorId` (string): ID del entrenador (opcional, referencia futura)
- `ciudad` (string): Ciudad del equipo
- `fundacion` (number): Año de fundación
- `colores` (object): Colores del equipo (opcional)
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización

**Índices sugeridos**:
- `ligaId` (ascending)
- `nombre` (ascending)
- `ciudad` (ascending)

---

### 3. Colección: `jugadores`

**Propósito**: Almacenar información de jugadores.

**Estructura del documento**:
```json
{
  "id": "12345",
  "nombre": "Lionel",
  "apellido": "Messi",
  "nombre_completo": "Lionel Messi",
  "edad": 36,
  "nacionalidad": "Argentina",
  "posicion": "FW",
  "dorsal": 10,
  "equipoId": "435",
  "foto": "https://media.api-sports.io/football/players/12345.png",
  "fecha_nacimiento": "1987-06-24",
  "altura": 170,
  "peso": 72,
  "pie_preferido": "left",
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T10:00:00Z"
}
```

**Campos**:
- `id` (string): ID único del jugador (de la API externa)
- `nombre` (string): Nombre del jugador
- `apellido` (string): Apellido del jugador
- `nombre_completo` (string): Nombre completo del jugador
- `edad` (number): Edad del jugador
- `nacionalidad` (string): Nacionalidad del jugador
- `posicion` (string): Posición del jugador (GK, DEF, MID, FW)
- `dorsal` (number): Número de camiseta
- `equipoId` (string): ID del equipo actual (referencia a `equipos/{equipoId}`)
- `foto` (string): URL de la foto del jugador (opcional)
- `fecha_nacimiento` (string): Fecha de nacimiento (YYYY-MM-DD)
- `altura` (number): Altura en cm (opcional)
- `peso` (number): Peso en kg (opcional)
- `pie_preferido` (string): Pie preferido (left, right, both) (opcional)
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización

**Índices sugeridos**:
- `equipoId` (ascending)
- `posicion` (ascending)
- `nacionalidad` (ascending)
- `equipoId` + `posicion` (composite)

---

### 4. Colección: `formaciones`

**Propósito**: Almacenar formaciones/alineaciones de equipos para partidos específicos.

**Estructura del documento**:
```json
{
  "id": "form_12345_67890_20240115",
  "equipoId": "435",
  "partidoId": "12345",
  "fecha": "2024-01-15",
  "competicion": "Liga Profesional",
  "ligaId": "128",
  "formacion": "4-3-3",
  "entrenador": {
    "id": "12345",
    "nombre": "Marcelo Gallardo",
    "foto": "https://media.api-sports.io/football/coaches/12345.png"
  },
  "alineacion": [
    {
      "jugadorId": "12345",
      "nombre": "Lionel Messi",
      "dorsal": 10,
      "posicion": "FW",
      "grid": "4:3",
      "es_titular": true
    }
  ],
  "suplentes": [
    {
      "jugadorId": "67890",
      "nombre": "Juan Pérez",
      "dorsal": 9,
      "posicion": "FW",
      "grid": null,
      "es_titular": false
    }
  ],
  "colores": {
    "jugador": {
      "principal": "#E91E63",
      "numero": "#FFFFFF",
      "borde": "#000000"
    },
    "portero": {
      "principal": "#FF0000",
      "numero": "#FFFFFF",
      "borde": "#000000"
    }
  },
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T10:00:00Z"
}
```

**Campos**:
- `id` (string): ID único de la formación (generado: `form_{equipoId}_{partidoId}_{fecha}`)
- `equipoId` (string): ID del equipo (referencia a `equipos/{equipoId}`)
- `partidoId` (string): ID del partido (referencia a `partidos/{partidoId}`)
- `fecha` (string): Fecha del partido (YYYY-MM-DD)
- `competicion` (string): Nombre de la competición
- `ligaId` (string): ID de la liga (referencia a `ligas/{ligaId}`)
- `formacion` (string): Formación táctica (ej: "4-3-3")
- `entrenador` (object): Información del entrenador
- `alineacion` (array): Array de jugadores titulares
- `suplentes` (array): Array de jugadores suplentes
- `colores` (object): Colores de la camiseta
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización

**Índices sugeridos**:
- `equipoId` (ascending)
- `partidoId` (ascending)
- `fecha` (descending)
- `ligaId` (ascending)
- `equipoId` + `fecha` (composite)

---

### 5. Colección: `partidos`

**Propósito**: Almacenar información de partidos/fixtures.

**Estructura del documento**:
```json
{
  "id": "12345",
  "ligaId": "128",
  "fecha": "2024-01-15T20:00:00Z",
  "estado": {
    "largo": "Finalizado",
    "corto": "FT",
    "tiempo_transcurrido": 90
  },
  "equipo_local": {
    "id": "435",
    "nombre": "River Plate",
    "logo": "https://media.api-sports.io/football/teams/435.png"
  },
  "equipo_visitante": {
    "id": "451",
    "nombre": "Boca Juniors",
    "logo": "https://media.api-sports.io/football/teams/451.png"
  },
  "goles": {
    "local": 2,
    "visitante": 1
  },
  "estadisticas": {
    "local": [
      {
        "tipo": "Ball Possession",
        "valor": "65"
      }
    ],
    "visitante": [
      {
        "tipo": "Ball Possession",
        "valor": "35"
      }
    ]
  },
  "eventos": {
    "local": [
      {
        "tipo": "Goal",
        "tiempo": {
          "transcurrido": 25,
          "extra": null
        },
        "jugador": {
          "id": "12345",
          "nombre": "Lionel Messi"
        },
        "asistencia": {
          "id": "67890",
          "nombre": "Juan Pérez"
        },
        "detalle": "Normal Goal"
      }
    ],
    "visitante": []
  },
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T22:00:00Z"
}
```

**Campos**:
- `id` (string): ID único del partido (de la API externa)
- `ligaId` (string): ID de la liga (referencia a `ligas/{ligaId}`)
- `fecha` (timestamp): Fecha y hora del partido
- `estado` (object): Estado del partido (largo, corto, tiempo_transcurrido)
- `equipo_local` (object): Información del equipo local
- `equipo_visitante` (object): Información del equipo visitante
- `goles` (object): Goles del partido (local, visitante)
- `estadisticas` (object): Estadísticas del partido (opcional)
- `eventos` (object): Eventos del partido (goles, tarjetas, sustituciones) (opcional)
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización

**Índices sugeridos**:
- `ligaId` (ascending)
- `fecha` (descending)
- `estado.corto` (ascending)
- `equipo_local.id` (ascending)
- `equipo_visitante.id` (ascending)
- `ligaId` + `fecha` (composite)

---

### 6. Colección: `standings`

**Propósito**: Almacenar tablas de posiciones de ligas.

**Estructura del documento**:
```json
{
  "id": "standings_128_2024",
  "ligaId": "128",
  "temporada": "2024",
  "fecha_actualizacion_datos": "2024-01-15T10:00:00Z",
  "posiciones": [
    {
      "posicion": 1,
      "equipo": {
        "id": "435",
        "nombre": "River Plate",
        "logo": "https://media.api-sports.io/football/teams/435.png"
      },
      "puntos": 45,
      "partidos_jugados": 15,
      "ganados": 14,
      "empatados": 3,
      "perdidos": 0,
      "goles": {
        "a_favor": 35,
        "en_contra": 10
      },
      "diferencia_goles": 25,
      "forma": "WWWWW"
    }
  ],
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_actualizacion": "2024-01-15T10:00:00Z"
}
```

**Campos**:
- `id` (string): ID único del standing (generado: `standings_{ligaId}_{temporada}`)
- `ligaId` (string): ID de la liga (referencia a `ligas/{ligaId}`)
- `temporada` (string): Temporada (ej: "2024")
- `fecha_actualizacion_datos` (timestamp): Fecha de última actualización de los datos de la API
- `posiciones` (array): Array de posiciones en la tabla
- `fecha_creacion` (timestamp): Fecha de creación del documento
- `fecha_actualizacion` (timestamp): Fecha de última actualización del documento

**Índices sugeridos**:
- `ligaId` (ascending)
- `temporada` (ascending)
- `ligaId` + `temporada` (composite)

---

## 🔍 Tipos TypeScript

Ver archivo `types/futbol.ts` para las interfaces TypeScript completas que corresponden a estas estructuras.

## 📈 Índices Compuestos Recomendados

Para optimizar consultas comunes, se recomienda crear los siguientes índices compuestos en Firestore:

1. **Equipos por Liga**:
   - Collection: `equipos`
   - Fields: `ligaId` (ascending)

2. **Jugadores por Equipo y Posición**:
   - Collection: `jugadores`
   - Fields: `equipoId` (ascending), `posicion` (ascending)

3. **Formaciones por Equipo y Fecha**:
   - Collection: `formaciones`
   - Fields: `equipoId` (ascending), `fecha` (descending)

4. **Partidos por Liga y Fecha**:
   - Collection: `partidos`
   - Fields: `ligaId` (ascending), `fecha` (descending)

5. **Standings por Liga y Temporada**:
   - Collection: `standings`
   - Fields: `ligaId` (ascending), `temporada` (ascending)

## 🔄 Migración desde `api_cache`

Los datos actualmente almacenados en `api_cache` pueden migrarse a estas colecciones estructuradas usando el script `scripts/migrateCacheToSchema.ts`. Ver documentación en ese archivo para más detalles.

## 🚀 Uso en Endpoints

Los endpoints espejo deberían seguir este flujo:

1. **Consultar Firestore primero**: Buscar en las colecciones estructuradas
2. **Si no existe**: Consultar la API externa
3. **Guardar en Firestore**: Almacenar los datos en las colecciones estructuradas
4. **Actualizar cache**: Opcionalmente, actualizar `api_cache` para compatibilidad

## 📝 Notas de Implementación

- **IDs**: Los IDs de documentos deben coincidir con los IDs de la API externa para facilitar la sincronización
- **Timestamps**: Usar timestamps de Firestore para `fecha_creacion` y `fecha_actualizacion`
- **Referencias**: Los campos `*Id` son strings que referencian otros documentos, no referencias directas de Firestore
- **Normalización**: Los datos están normalizados para evitar duplicación y facilitar actualizaciones
- **Compatibilidad**: El esquema mantiene compatibilidad con los tipos de la API original

## 🔐 Seguridad

Las reglas de Firestore deben configurarse para:
- Permitir lectura pública de datos de fútbol (ligas, equipos, jugadores, partidos)
- Restringir escritura solo al servidor (Admin SDK)
- Mantener privacidad de datos administrativos

Ver `firestore.rules` para la configuración actual.

## 📚 Recursos Adicionales

- [Documentación de Firestore](https://firebase.google.com/docs/firestore)
- [Índices de Firestore](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Mejores prácticas de Firestore](https://firebase.google.com/docs/firestore/best-practices)

