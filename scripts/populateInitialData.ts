/**
 * Script de población inicial de datos básicos en Firestore
 *
 * Uso: npx tsx scripts/populateInitialData.ts
 *
 * Este script carga información básica importante (ligas, equipos, formaciones) a Firestore
 * por única vez, para tener poblada la base de datos.
 *
 * Carga:
 * - Ligas principales (desde STATIC_LEAGUES o desde la API externa)
 * - Equipos de las ligas principales
 * - Formaciones de partidos recientes (opcional)
 *
 * Los datos se crean con merge: true para evitar duplicar si ya existen.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";
import { FootballApiServer } from "@/lib/footballApi";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { STATIC_LEAGUES } from "@/lib/leagues-data";
import type { Liga, Equipo, Formacion } from "@/types/futbol";
import type { Match, LineupTeam } from "@/types/match";
import { Timestamp } from "firebase-admin/firestore";

// Ligas principales a poblar
const MAIN_LEAGUES = [
  128, // Liga Profesional Argentina
  39, // Premier League
  140, // La Liga
  135, // Serie A
  78, // Bundesliga
  61, // Ligue 1
  2, // Champions League
  3, // Europa League
  13, // Copa Libertadores
  11, // Copa Sudamericana
];

// Estadísticas de población
const stats = {
  ligas: { procesadas: 0, creadas: 0, errores: 0 },
  equipos: { procesadas: 0, creadas: 0, errores: 0 },
  formaciones: { procesadas: 0, creadas: 0, errores: 0 },
};

/**
 * Pobla ligas en Firestore
 */
async function populateLeagues() {
  console.log("🌍 Poblando ligas...\n");
  const now = Timestamp.now();
  const currentYear = new Date().getFullYear().toString();

  const firestoreService = new FirestoreFootballService();

  for (const league of STATIC_LEAGUES) {
    try {
      // Verificar si la liga ya existe
      const ligaDoc = await adminDb
        .collection("ligas")
        .doc(league.id.toString())
        .get();

      if (ligaDoc.exists) {
        console.log(
          `  ⏭️  Liga ${league.name} (${league.id}) ya existe, saltando...`
        );
        stats.ligas.procesadas++;
        continue;
      }

      // Crear liga
      const liga: Liga = {
        id: league.id.toString(),
        nombre: league.name,
        pais: league.country,
        logo: league.logo,
        temporada_actual: currentYear,
        tipo: "league",
        fecha_creacion: now,
        fecha_actualizacion: now,
      };

      await adminDb.collection("ligas").doc(liga.id).set(liga, { merge: true });

      console.log(`  ✅ Liga creada: ${liga.nombre} (${liga.id})`);
      stats.ligas.procesadas++;
      stats.ligas.creadas++;
    } catch (error) {
      console.error(`  ❌ Error al crear liga ${league.id}:`, error);
      stats.ligas.errores++;
    }
  }
}

/**
 * Pobla equipos en Firestore desde la API externa
 */
async function populateTeams() {
  console.log("\n🏆 Poblando equipos...\n");

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: FOOTBALL_API_KEY no configurada");
    return;
  }

  const externalApi = new FootballApiServer(apiKey);
  const firestoreService = new FirestoreFootballService();
  const currentSeason = new Date().getFullYear();

  for (const leagueId of MAIN_LEAGUES) {
    try {
      console.log(`  📊 Procesando liga ${leagueId}...`);

      // Verificar si ya hay equipos de esta liga
      const existingTeams = await adminDb
        .collection("equipos")
        .where("ligaId", "==", leagueId.toString())
        .limit(1)
        .get();

      if (!existingTeams.empty) {
        console.log(
          `  ⏭️  Ya existen equipos para la liga ${leagueId}, saltando...`
        );
        continue;
      }

      // Obtener equipos de la API externa
      const teams = await externalApi.getTeamsByLeague(leagueId, currentSeason);

      if (!teams || teams.length === 0) {
        console.log(`  ⚠️  No se encontraron equipos para la liga ${leagueId}`);
        continue;
      }

      // Guardar equipos en Firestore
      await firestoreService.saveTeamsToFirestore(teams, leagueId);

      console.log(
        `  ✅ ${teams.length} equipos creados para la liga ${leagueId}`
      );
      stats.equipos.procesadas += teams.length;
      stats.equipos.creadas += teams.length;

      // Pequeño delay para no saturar la API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(
        `  ❌ Error al poblar equipos de la liga ${leagueId}:`,
        error
      );
      stats.equipos.errores++;
    }
  }
}

/**
 * Pobla formaciones de partidos recientes
 */
async function populateFormations() {
  console.log("\n📋 Poblando formaciones de partidos recientes...\n");

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: FOOTBALL_API_KEY no configurada");
    return;
  }

  const externalApi = new FootballApiServer(apiKey);
  const firestoreService = new FirestoreFootballService();
  const currentSeason = new Date().getFullYear();

  // Obtener partidos recientes de las ligas principales
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split("T")[0];

  try {
    // Obtener partidos de ayer de una liga principal (para tener formaciones)
    const matches = await externalApi.getFixturesByDateAndLeague(
      dateStr,
      MAIN_LEAGUES[0] // Liga Profesional Argentina
    );

    if (!matches || matches.length === 0) {
      console.log(
        "  ⚠️  No se encontraron partidos recientes para obtener formaciones"
      );
      return;
    }

    console.log(`  📊 Procesando ${matches.length} partidos...`);

    // Obtener formaciones de los primeros 10 partidos
    const matchesToProcess = matches.slice(0, 10);

    for (const match of matchesToProcess) {
      try {
        // Verificar si ya existe la formación
        const formacionId = `form_${match.teams.home.id}_${match.fixture.id}_${dateStr}`;
        const formacionDoc = await adminDb
          .collection("formaciones")
          .doc(formacionId)
          .get();

        if (formacionDoc.exists) {
          console.log(
            `  ⏭️  Formación para partido ${match.fixture.id} ya existe, saltando...`
          );
          continue;
        }

        // Obtener formaciones de la API externa
        const lineups = await externalApi.getMatchLineups(
          match.fixture.id.toString(),
          match.teams.home.id.toString(),
          match.teams.away.id.toString()
        );

        if (!lineups.home && !lineups.away) {
          console.log(
            `  ⚠️  No se encontraron formaciones para el partido ${match.fixture.id}`
          );
          continue;
        }

        // Guardar formación del equipo local
        if (lineups.home) {
          await saveFormation(
            match,
            lineups.home,
            match.teams.home.id,
            "home",
            dateStr
          );
        }

        // Guardar formación del equipo visitante
        if (lineups.away) {
          await saveFormation(
            match,
            lineups.away,
            match.teams.away.id,
            "away",
            dateStr
          );
        }

        stats.formaciones.procesadas += lineups.home && lineups.away ? 2 : 1;
        stats.formaciones.creadas += lineups.home && lineups.away ? 2 : 1;

        // Pequeño delay para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `  ❌ Error al obtener formaciones del partido ${match.fixture.id}:`,
          error
        );
        stats.formaciones.errores++;
      }
    }
  } catch (error) {
    console.error("❌ Error al poblar formaciones:", error);
  }
}

/**
 * Guarda una formación en Firestore
 */
async function saveFormation(
  match: Match,
  lineup: LineupTeam,
  teamId: number,
  side: "home" | "away",
  dateStr: string
): Promise<void> {
  try {
    const now = Timestamp.now();
    const formacionId = `form_${teamId}_${match.fixture.id}_${dateStr}`;

    const formacion: Formacion = {
      id: formacionId,
      equipoId: teamId.toString(),
      partidoId: match.fixture.id.toString(),
      fecha: dateStr,
      competicion: match.league.name,
      ligaId: match.league.id.toString(),
      formacion: lineup.formation || "",
      entrenador: {
        id: lineup.coach.id.toString(),
        nombre: lineup.coach.name,
        foto: lineup.coach.photo || "",
      },
      alineacion: lineup.startXI.map(player => ({
        jugadorId: player.player.id.toString(),
        nombre: player.player.name,
        dorsal: player.player.number,
        posicion: player.player.pos,
        grid: player.player.grid,
        es_titular: true,
      })),
      suplentes: lineup.substitutes.map(player => ({
        jugadorId: player.player.id.toString(),
        nombre: player.player.name,
        dorsal: player.player.number || 0,
        posicion: player.player.pos || "",
        grid: null,
        es_titular: false,
      })),
      colores: lineup.team.colors
        ? {
            jugador: {
              principal: lineup.team.colors.player.primary,
              numero: lineup.team.colors.player.number,
              borde: lineup.team.colors.player.border,
            },
            portero: {
              principal: lineup.team.colors.goalkeeper.primary,
              numero: lineup.team.colors.goalkeeper.number,
              borde: lineup.team.colors.goalkeeper.border,
            },
          }
        : undefined,
      fecha_creacion: now,
      fecha_actualizacion: now,
    };

    await adminDb
      .collection("formaciones")
      .doc(formacionId)
      .set(formacion, { merge: true });

    console.log(
      `  ✅ Formación creada para equipo ${teamId} en partido ${match.fixture.id}`
    );
  } catch (error) {
    console.error(`  ❌ Error al guardar formación:`, error);
    throw error;
  }
}

/**
 * Función principal de población
 */
async function populateInitialData() {
  try {
    console.log("🌱 Iniciando población inicial de datos básicos...\n");

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

    // Verificar que la API key esté configurada
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      console.error("❌ Error: FOOTBALL_API_KEY no configurada");
      console.error("   Por favor, configura FOOTBALL_API_KEY en .env.local");
      process.exit(1);
    }

    // Poblar ligas
    await populateLeagues();

    // Poblar equipos
    await populateTeams();

    // Poblar formaciones (opcional, puede tomar tiempo)
    console.log(
      "\n⚠️  Nota: La población de formaciones es opcional y puede tomar tiempo."
    );
    console.log(
      "   Se poblarán formaciones de los últimos 10 partidos de la Liga Profesional Argentina."
    );

    await populateFormations();

    // Mostrar resumen
    console.log("\n✅ Población inicial completada.\n");
    console.log("📊 Resumen:");
    console.log(
      `  Ligas: ${stats.ligas.procesadas} procesadas, ${stats.ligas.creadas} creadas, ${stats.ligas.errores} errores`
    );
    console.log(
      `  Equipos: ${stats.equipos.procesadas} procesadas, ${stats.equipos.creadas} creadas, ${stats.equipos.errores} errores`
    );
    console.log(
      `  Formaciones: ${stats.formaciones.procesadas} procesadas, ${stats.formaciones.creadas} creadas, ${stats.formaciones.errores} errores`
    );

    console.log("\n✨ Script finalizado.");
  } catch (error) {
    console.error("❌ Error durante la población:", error);
    process.exit(1);
  }
}

// Ejecutar el script
populateInitialData()
  .then(() => {
    console.log("\n✨ Script finalizado.");
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });
