/**
 * Script para poblar Firestore con datos de ejemplo iniciales
 * 
 * Uso: npx tsx scripts/seedFirebase.ts
 * 
 * Este script crea:
 * - Ligas de ejemplo (Liga Profesional Argentina, Premier League, etc.)
 * - Equipos de ejemplo (River Plate, Boca Juniors, etc.)
 * - Jugadores de ejemplo
 * 
 * Los datos se crean con merge: true para evitar duplicar si ya existen.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";
import type { Liga, Equipo, Jugador } from "@/types/futbol";
import { Timestamp } from "firebase-admin/firestore";

// Datos de ejemplo para ligas
const ligasEjemplo: Omit<Liga, "fecha_creacion" | "fecha_actualizacion">[] = [
  {
    id: "128",
    nombre: "Liga Profesional",
    pais: "Argentina",
    logo: "https://media.api-sports.io/football/leagues/128.png",
    temporada_actual: "2024",
    tipo: "league",
  },
  {
    id: "39",
    nombre: "Premier League",
    pais: "England",
    logo: "https://media.api-sports.io/football/leagues/39.png",
    temporada_actual: "2024",
    tipo: "league",
  },
  {
    id: "140",
    nombre: "La Liga",
    pais: "Spain",
    logo: "https://media.api-sports.io/football/leagues/140.png",
    temporada_actual: "2024",
    tipo: "league",
  },
];

// Datos de ejemplo para equipos
const equiposEjemplo: Omit<Equipo, "fecha_creacion" | "fecha_actualizacion">[] = [
  {
    id: "435",
    nombre: "River Plate",
    abreviatura: "RIV",
    escudo: "https://media.api-sports.io/football/teams/435.png",
    ligaId: "128",
    estadio: "Estadio Monumental",
    ciudad: "Buenos Aires",
    fundacion: 1901,
    colores: {
      principal: "#E91E63",
      secundario: "#FFFFFF",
    },
  },
  {
    id: "451",
    nombre: "Boca Juniors",
    abreviatura: "BOC",
    escudo: "https://media.api-sports.io/football/teams/451.png",
    ligaId: "128",
    estadio: "La Bombonera",
    ciudad: "Buenos Aires",
    fundacion: 1905,
    colores: {
      principal: "#0054A6",
      secundario: "#FFD700",
    },
  },
  {
    id: "33",
    nombre: "Manchester United",
    abreviatura: "MUN",
    escudo: "https://media.api-sports.io/football/teams/33.png",
    ligaId: "39",
    estadio: "Old Trafford",
    ciudad: "Manchester",
    fundacion: 1878,
    colores: {
      principal: "#DA020E",
      secundario: "#FFFFFF",
    },
  },
  {
    id: "541",
    nombre: "Real Madrid",
    abreviatura: "RMA",
    escudo: "https://media.api-sports.io/football/teams/541.png",
    ligaId: "140",
    estadio: "Santiago Bernabéu",
    ciudad: "Madrid",
    fundacion: 1902,
    colores: {
      principal: "#FFFFFF",
      secundario: "#FFD700",
    },
  },
];

// Datos de ejemplo para jugadores
const jugadoresEjemplo: Omit<Jugador, "fecha_creacion" | "fecha_actualizacion">[] = [
  {
    id: "276",
    nombre: "Lionel",
    apellido: "Messi",
    nombre_completo: "Lionel Messi",
    edad: 36,
    nacionalidad: "Argentina",
    posicion: "FW",
    dorsal: 10,
    equipoId: "435",
    fecha_nacimiento: "1987-06-24",
    altura: 170,
    peso: 72,
    pie_preferido: "left",
  },
  {
    id: "184",
    nombre: "Cristiano",
    apellido: "Ronaldo",
    nombre_completo: "Cristiano Ronaldo",
    edad: 39,
    nacionalidad: "Portugal",
    posicion: "FW",
    dorsal: 7,
    equipoId: "541",
    fecha_nacimiento: "1985-02-05",
    altura: 187,
    peso: 83,
    pie_preferido: "right",
  },
  {
    id: "889",
    nombre: "Marcus",
    apellido: "Rashford",
    nombre_completo: "Marcus Rashford",
    edad: 26,
    nacionalidad: "England",
    posicion: "FW",
    dorsal: 10,
    equipoId: "33",
    fecha_nacimiento: "1997-10-31",
    altura: 180,
    peso: 70,
    pie_preferido: "right",
  },
];

async function seedLigas() {
  console.log("🌍 Poblando ligas...");
  const now = Timestamp.now();

  for (const liga of ligasEjemplo) {
    try {
      await adminDb
        .collection("ligas")
        .doc(liga.id)
        .set(
          {
            ...liga,
            fecha_creacion: now,
            fecha_actualizacion: now,
          },
          { merge: true }
        );
      console.log(`  ✅ Liga creada/actualizada: ${liga.nombre} (${liga.id})`);
    } catch (error) {
      console.error(`  ❌ Error al crear liga ${liga.id}:`, error);
    }
  }
}

async function seedEquipos() {
  console.log("\n🏆 Poblando equipos...");
  const now = Timestamp.now();

  for (const equipo of equiposEjemplo) {
    try {
      // Verificar que la liga existe
      const ligaDoc = await adminDb.collection("ligas").doc(equipo.ligaId).get();
      if (!ligaDoc.exists) {
        console.warn(
          `  ⚠️  Liga ${equipo.ligaId} no existe. Saltando equipo ${equipo.nombre}.`
        );
        continue;
      }

      await adminDb
        .collection("equipos")
        .doc(equipo.id)
        .set(
          {
            ...equipo,
            fecha_creacion: now,
            fecha_actualizacion: now,
          },
          { merge: true }
        );
      console.log(`  ✅ Equipo creado/actualizado: ${equipo.nombre} (${equipo.id})`);
    } catch (error) {
      console.error(`  ❌ Error al crear equipo ${equipo.id}:`, error);
    }
  }
}

async function seedJugadores() {
  console.log("\n👤 Poblando jugadores...");
  const now = Timestamp.now();

  for (const jugador of jugadoresEjemplo) {
    try {
      // Verificar que el equipo existe
      const equipoDoc = await adminDb.collection("equipos").doc(jugador.equipoId).get();
      if (!equipoDoc.exists) {
        console.warn(
          `  ⚠️  Equipo ${jugador.equipoId} no existe. Saltando jugador ${jugador.nombre_completo}.`
        );
        continue;
      }

      await adminDb
        .collection("jugadores")
        .doc(jugador.id)
        .set(
          {
            ...jugador,
            fecha_creacion: now,
            fecha_actualizacion: now,
          },
          { merge: true }
        );
      console.log(
        `  ✅ Jugador creado/actualizado: ${jugador.nombre_completo} (${jugador.id})`
      );
    } catch (error) {
      console.error(`  ❌ Error al crear jugador ${jugador.id}:`, error);
    }
  }
}

async function seedFirebase() {
  try {
    console.log("🌱 Iniciando seed de Firebase...\n");

    // Verificar que adminDb esté inicializado
    if (!adminDb) {
      console.error("❌ Error: Firebase Admin no está inicializado.");
      console.error("   Por favor, verifica que las variables de entorno estén configuradas correctamente:");
      console.error("   - FIREBASE_SERVICE_ACCOUNT_KEY (JSON completo)");
      console.error("   - O FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
      process.exit(1);
    }

    await seedLigas();
    await seedEquipos();
    await seedJugadores();

    console.log("\n✅ Seed completado exitosamente.");
    console.log("\n📊 Resumen:");
    console.log(`  - Ligas: ${ligasEjemplo.length}`);
    console.log(`  - Equipos: ${equiposEjemplo.length}`);
    console.log(`  - Jugadores: ${jugadoresEjemplo.length}`);
  } catch (error) {
    console.error("❌ Error durante el seed:", error);
    process.exit(1);
  }
}

// Ejecutar el script
seedFirebase()
  .then(() => {
    console.log("\n✨ Script finalizado.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });

