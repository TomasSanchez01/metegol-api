/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Script para migrar datos de api_cache a las nuevas colecciones estructuradas
 *
 * Uso: npx tsx scripts/migrateCacheToSchema.ts
 *
 * Este script:
 * - Lee documentos de api_cache
 * - Detecta el tipo de información (liga, equipo, partido, etc.)
 * - Extrae y normaliza los datos
 * - Escribe los documentos en sus respectivas colecciones estructuradas
 *
 * LIMITACIONES:
 * - Este script es una base inicial. Puede requerir ajustes según la estructura
 *   específica de los datos en api_cache.
 * - No todos los datos de api_cache pueden migrarse automáticamente.
 * - Se recomienda revisar y validar los datos migrados después de ejecutar el script.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase/config";
import type { Liga, Equipo, Jugador, Partido, Standing } from "@/types/futbol";
import { Timestamp } from "firebase-admin/firestore";

interface CacheDocument {
  data: any;
  timestamp: number;
  ttl: number;
  key: string;
  lastModified?: number;
  dataHash?: string;
}

/**
 * Limpia los campos undefined de un objeto recursivamente
 * Firestore no acepta valores undefined
 */
function removeUndefined(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined).filter(item => item !== undefined);
  }

  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = removeUndefined(obj[key]);
        if (value !== undefined) {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  return obj;
}

// Contadores para estadísticas
const stats = {
  ligas: { procesadas: 0, creadas: 0, errores: 0 },
  equipos: { procesadas: 0, creadas: 0, errores: 0 },
  jugadores: { procesadas: 0, creadas: 0, errores: 0 },
  partidos: { procesadas: 0, creadas: 0, errores: 0 },
  standings: { procesadas: 0, creadas: 0, errores: 0 },
  otros: 0,
};

/**
 * Detecta el tipo de dato basado en la clave del cache
 */
function detectDataType(key: string, data: any): string | null {
  const keyLower = key.toLowerCase();

  // Detectar ligas
  if (keyLower.includes("league") || keyLower.includes("liga")) {
    return "liga";
  }

  // Detectar equipos
  if (keyLower.includes("team") || keyLower.includes("equipo")) {
    return "equipo";
  }

  // Detectar jugadores
  if (keyLower.includes("player") || keyLower.includes("jugador")) {
    return "jugador";
  }

  // Detectar partidos
  if (
    keyLower.includes("fixture") ||
    keyLower.includes("partido") ||
    keyLower.includes("match")
  ) {
    return "partido";
  }

  // Detectar standings
  if (keyLower.includes("standing") || keyLower.includes("posicion")) {
    return "standing";
  }

  // Intentar detectar por estructura de datos
  if (data?.response) {
    const response = Array.isArray(data.response)
      ? data.response[0]
      : data.response;

    if (response?.league?.id) {
      if (response?.league?.standings) {
        return "standing";
      }
      if (response?.fixture) {
        return "partido";
      }
      return "liga";
    }

    if (response?.team?.id) {
      return "equipo";
    }

    if (response?.player?.id) {
      return "jugador";
    }
  }

  return null;
}

/**
 * Migra una liga desde api_cache a la colección ligas
 */
async function migrateLiga(data: any): Promise<void> {
  try {
    const response = Array.isArray(data.response)
      ? data.response[0]
      : data.response;
    if (!response?.league) {
      return;
    }

    const league = response.league;
    const ligaId = league.id?.toString();

    if (!ligaId) {
      return;
    }

    const now = Timestamp.now();
    const liga: Liga = {
      id: ligaId,
      nombre: league.name || "",
      pais: league.country?.name || response.country?.name || "",
      logo: league.logo || "",
      temporada_actual:
        league.season?.toString() || new Date().getFullYear().toString(),
      tipo: league.type || "league",
      fecha_creacion: now,
      fecha_actualizacion: now,
    };

    await adminDb.collection("ligas").doc(ligaId).set(liga, { merge: true });
    stats.ligas.creadas++;
  } catch (error) {
    console.error("  ❌ Error al migrar liga:", error);
    stats.ligas.errores++;
  }
}

/**
 * Migra un equipo desde api_cache a la colección equipos
 */
async function migrateEquipo(data: any): Promise<void> {
  try {
    const response = Array.isArray(data.response)
      ? data.response[0]
      : data.response;
    if (!response?.team) {
      return;
    }

    const team = response.team;
    const equipoId = team.id?.toString();

    if (!equipoId) {
      return;
    }

    const now = Timestamp.now();
    const equipo: Equipo = {
      id: equipoId,
      nombre: team.name || "",
      abreviatura: team.code || "",
      escudo: team.logo || "",
      ligaId: "", // Se requiere información adicional para establecer la relación
      estadio: team.venue?.name || "",
      ciudad: team.venue?.city || "",
      fundacion: team.founded || undefined,
      fecha_creacion: now,
      fecha_actualizacion: now,
    };

    await adminDb
      .collection("equipos")
      .doc(equipoId)
      .set(equipo, { merge: true });
    stats.equipos.creadas++;
  } catch (error) {
    console.error("  ❌ Error al migrar equipo:", error);
    stats.equipos.errores++;
  }
}

/**
 * Migra un jugador desde api_cache a la colección jugadores
 */
async function migrateJugador(data: any): Promise<void> {
  try {
    const response = Array.isArray(data.response)
      ? data.response[0]
      : data.response;
    if (!response?.player) {
      return;
    }

    const player = response.player;
    const jugadorId = player.id?.toString();

    if (!jugadorId) {
      return;
    }

    const now = Timestamp.now();
    const nombreCompleto =
      `${player.firstname || ""} ${player.lastname || ""}`.trim();

    const jugador: Jugador = {
      id: jugadorId,
      nombre: player.firstname || "",
      apellido: player.lastname || "",
      nombre_completo: nombreCompleto,
      edad: player.age || 0,
      nacionalidad: player.nationality || "",
      posicion: player.position || "",
      dorsal: player.number || 0,
      equipoId: response.statistics?.[0]?.team?.id?.toString() || "",
      foto: player.photo || "",
      fecha_nacimiento: player.birth?.date || undefined,
      altura: player.height
        ? parseInt(player.height.replace(" cm", ""))
        : undefined,
      peso: player.weight
        ? parseInt(player.weight.replace(" kg", ""))
        : undefined,
      pie_preferido: player.injured ? undefined : undefined, // Campo no disponible en la API
      fecha_creacion: now,
      fecha_actualizacion: now,
    };

    if (jugador.equipoId) {
      await adminDb
        .collection("jugadores")
        .doc(jugadorId)
        .set(jugador, { merge: true });
      stats.jugadores.creadas++;
    }
  } catch (error) {
    console.error("  ❌ Error al migrar jugador:", error);
    stats.jugadores.errores++;
  }
}

/**
 * Migra un partido desde api_cache a la colección partidos
 */
async function migratePartido(data: any): Promise<void> {
  try {
    // Verificar estructura de datos
    // Los datos pueden venir directamente como array o envueltos en { response: [...] }
    let response: any[] = [];

    if (Array.isArray(data)) {
      // Si data es directamente un array
      response = data;
    } else if (data?.response) {
      // Si data tiene una propiedad response
      response = Array.isArray(data.response) ? data.response : [data.response];
    } else if (data?.data && Array.isArray(data.data)) {
      // Si data tiene una propiedad data que es un array
      response = data.data;
    } else {
      // No hay datos válidos
      return;
    }

    if (!response || response.length === 0) {
      return;
    }

    let partidosCreados = 0;

    for (const item of response) {
      if (!item?.fixture || !item?.teams) {
        continue;
      }

      const fixture = item.fixture;
      const partidoId = fixture.id?.toString();

      if (!partidoId) {
        continue;
      }

      const now = Timestamp.now();
      const partido: Partido = {
        id: partidoId,
        ligaId: item.league?.id?.toString() || "",
        fecha: Timestamp.fromDate(new Date(fixture.date)),
        estado: {
          largo: fixture.status?.long || "",
          corto: fixture.status?.short || "",
          ...(fixture.status?.elapsed !== undefined &&
          fixture.status?.elapsed !== null
            ? { tiempo_transcurrido: fixture.status.elapsed }
            : {}),
        },
        equipo_local: {
          id: item.teams.home.id?.toString() || "",
          nombre: item.teams.home.name || "",
          logo: item.teams.home.logo || "",
        },
        equipo_visitante: {
          id: item.teams.away.id?.toString() || "",
          nombre: item.teams.away.name || "",
          logo: item.teams.away.logo || "",
        },
        goles: {
          local: item.goals?.home || 0,
          visitante: item.goals?.away || 0,
        },
        fecha_creacion: now,
        fecha_actualizacion: now,
      };

      // Agregar estadisticas solo si existen
      if (
        item.statistics &&
        Array.isArray(item.statistics) &&
        item.statistics.length > 0
      ) {
        partido.estadisticas = {
          local: item.statistics[0]?.statistics || [],
          visitante: item.statistics[1]?.statistics || [],
        };
      }

      // Agregar eventos solo si existen
      if (item.events && Array.isArray(item.events) && item.events.length > 0) {
        partido.eventos = {
          local: item.events
            .filter((e: any) => e.team?.id === item.teams.home.id)
            .map((e: any) => ({
              tipo: e.type,
              tiempo: {
                transcurrido: e.time?.elapsed || 0,
                extra: e.time?.extra || null,
              },
              jugador: {
                id: e.player?.id?.toString() || "",
                nombre: e.player?.name || "",
              },
              asistencia: e.assist
                ? {
                    id: e.assist.id?.toString() || null,
                    nombre: e.assist.name || null,
                  }
                : null,
              detalle: e.detail || "",
              comentario: e.comments || null,
            })),
          visitante: item.events
            .filter((e: any) => e.team?.id === item.teams.away.id)
            .map((e: any) => ({
              tipo: e.type,
              tiempo: {
                transcurrido: e.time?.elapsed || 0,
                extra: e.time?.extra || null,
              },
              jugador: {
                id: e.player?.id?.toString() || "",
                nombre: e.player?.name || "",
              },
              asistencia: e.assist
                ? {
                    id: e.assist.id?.toString() || null,
                    nombre: e.assist.name || null,
                  }
                : null,
              detalle: e.detail || "",
              comentario: e.comments || null,
            })),
        };
      }

      try {
        // Validar que la fecha sea válida
        if (!fixture.date || isNaN(new Date(fixture.date).getTime())) {
          console.error(
            `  ⚠️  Fecha inválida para partido ${partidoId}: ${fixture.date}`
          );
          stats.partidos.errores++;
          continue;
        }

        // Limpiar campos undefined antes de guardar
        const cleanedPartido = removeUndefined(partido);

        await adminDb
          .collection("partidos")
          .doc(partidoId)
          .set(cleanedPartido, { merge: true });
        stats.partidos.creadas++;
        partidosCreados++;
      } catch (writeError: any) {
        // Solo mostrar errores cada 100 para no saturar la consola
        if (stats.partidos.errores % 100 === 0) {
          console.error(
            `  ❌ Error al escribir partido ${partidoId}:`,
            writeError.message || writeError
          );
        }
        stats.partidos.errores++;
      }
    }

    if (partidosCreados > 0 && partidosCreados % 100 === 0) {
      console.log(`  📦 Partidos migrados: ${partidosCreados}...`);
    }
  } catch (error) {
    console.error("  ❌ Error al migrar partido:", error);
    stats.partidos.errores++;
  }
}

/**
 * Migra un standing desde api_cache a la colección standings
 */
async function migrateStanding(data: any): Promise<void> {
  try {
    const response = Array.isArray(data.response)
      ? data.response[0]
      : data.response;
    if (!response?.league) {
      return;
    }

    const league = response.league;
    const ligaId = league.id?.toString();
    const temporada =
      league.season?.toString() || new Date().getFullYear().toString();

    if (!ligaId || !league.standings) {
      return;
    }

    const now = Timestamp.now();
    const standingsId = `standings_${ligaId}_${temporada}`;

    const posiciones = league.standings[0]?.map((team: any) => ({
      posicion: team.rank,
      equipo: {
        id: team.team.id?.toString() || "",
        nombre: team.team.name || "",
        logo: team.team.logo || "",
      },
      puntos: team.points,
      partidos_jugados: team.all.played,
      ganados: team.all.win,
      empatados: team.all.draw,
      perdidos: team.all.lose,
      goles: {
        a_favor: team.all.goals.for,
        en_contra: team.all.goals.against,
      },
      diferencia_goles: team.goalsDiff,
      forma: team.form || "",
    }));

    const standing: Standing = {
      id: standingsId,
      ligaId: ligaId,
      temporada: temporada,
      fecha_actualizacion_datos: now,
      posiciones: posiciones || [],
      fecha_creacion: now,
      fecha_actualizacion: now,
      grupos: [],
    };

    await adminDb
      .collection("standings")
      .doc(standingsId)
      .set(standing, { merge: true });
    stats.standings.creadas++;
  } catch (error) {
    console.error("  ❌ Error al migrar standing:", error);
    stats.standings.errores++;
  }
}

/**
 * Procesa un documento de api_cache
 */
async function processCacheDocument(
  doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>
): Promise<void> {
  const cacheData = doc.data() as CacheDocument;
  const data = cacheData.data;

  if (!data) {
    return;
  }

  const dataType = detectDataType(cacheData.key, data);

  if (!dataType) {
    stats.otros++;
    return;
  }

  switch (dataType) {
    case "liga":
      stats.ligas.procesadas++;
      await migrateLiga(data);
      break;
    case "equipo":
      stats.equipos.procesadas++;
      await migrateEquipo(data);
      break;
    case "jugador":
      stats.jugadores.procesadas++;
      await migrateJugador(data);
      break;
    case "partido":
      stats.partidos.procesadas++;
      await migratePartido(data);
      break;
    case "standing":
      stats.standings.procesadas++;
      await migrateStanding(data);
      break;
    default:
      stats.otros++;
  }
}

/**
 * Función principal de migración
 */
async function migrateCacheToSchema() {
  try {
    console.log(
      "🔄 Iniciando migración de api_cache a esquema estructurado...\n"
    );

    // Verificar que adminDb esté inicializado
    if (!adminDb) {
      console.error("❌ Error: Firebase Admin no está inicializado.");
      console.error(
        "   Por favor, verifica que las variables de entorno estén configuradas correctamente:"
      );
      console.error("   - FIREBASE_SERVICE_ACCOUNT_KEY (JSON completo)");
      console.error(
        "   - O FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
      );
      process.exit(1);
    }

    // Obtener todos los documentos de api_cache
    const cacheCollection = adminDb.collection("api_cache");
    const snapshot = await cacheCollection.get();

    if (snapshot.empty) {
      console.log("⚠️  No se encontraron documentos en api_cache.");
      return;
    }

    console.log(
      `📊 Se encontraron ${snapshot.size} documentos en api_cache.\n`
    );

    // Procesar cada documento
    let processed = 0;
    for (const doc of snapshot.docs) {
      processed++;
      if (processed % 100 === 0) {
        console.log(
          `  📦 Procesados ${processed}/${snapshot.size} documentos...`
        );
      }
      await processCacheDocument(doc);
    }

    // Mostrar estadísticas
    console.log("\n✅ Migración completada.\n");
    console.log("📊 Estadísticas:");
    console.log(
      `  Ligas: ${stats.ligas.procesadas} procesadas, ${stats.ligas.creadas} creadas, ${stats.ligas.errores} errores`
    );
    console.log(
      `  Equipos: ${stats.equipos.procesadas} procesadas, ${stats.equipos.creadas} creadas, ${stats.equipos.errores} errores`
    );
    console.log(
      `  Jugadores: ${stats.jugadores.procesadas} procesadas, ${stats.jugadores.creadas} creadas, ${stats.jugadores.errores} errores`
    );
    console.log(
      `  Partidos: ${stats.partidos.procesadas} procesadas, ${stats.partidos.creadas} creadas, ${stats.partidos.errores} errores`
    );
    console.log(
      `  Standings: ${stats.standings.procesadas} procesadas, ${stats.standings.creadas} creadas, ${stats.standings.errores} errores`
    );
    console.log(`  Otros: ${stats.otros} documentos no migrados`);

    console.log(
      "\n⚠️  NOTA: Revisa los datos migrados y valida que sean correctos."
    );
    console.log(
      "    Algunos campos pueden requerir ajustes manuales (por ejemplo, ligaId en equipos)."
    );
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
    process.exit(1);
  }
}

// Ejecutar el script
migrateCacheToSchema()
  .then(() => {
    console.log("\n✨ Script finalizado.");
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });
