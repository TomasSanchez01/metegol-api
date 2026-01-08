#!/usr/bin/env node
/**
 * Script para forzar borrar TODA la cache de Firestore
 *
 * Este script borra las siguientes colecciones:
 * - api_cache: Cache de respuestas de la API externa
 * - empty_queries: Registros de queries que no devolvieron resultados
 * - partidos: Partidos expirados (opcional, requiere --include-partidos)
 *
 * Uso:
 *  npx tsx scripts/clear-all-cache.ts                    # pedirá confirmación
 *  npx tsx scripts/clear-all-cache.ts --yes              # elimina sin confirmar
 *  npx tsx scripts/clear-all-cache.ts --dry-run          # muestra cuántos docs habría que borrar
 *  npx tsx scripts/clear-all-cache.ts --include-partidos # también borra partidos expirados
 *  npx tsx scripts/clear-all-cache.ts --yes --all        # borra TODO (incluyendo partidos no expirados)
 *
 * Opciones:
 *  --dry-run           No borra, solo muestra conteo estimado
 *  --yes               Ejecuta sin confirmación
 *  --batch-size=N      Tamaño de batch para borrado (default 500)
 *  --limit=N           Límite máximo de documentos a borrar por colección
 *  --include-partidos  También borra partidos expirados (requiere --all para borrar todos)
 *  --all               Borrar TODOS los documentos (no solo expirados/vacíos)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";
import type { Partido } from "@/types/futbol";

const args = process.argv.slice(2);
const argMap: Record<string, string | boolean> = {};
args.forEach(a => {
  if (a.startsWith("--")) {
    const [k, v] = a.replace(/^--/, "").split("=");
    argMap[k] = v === undefined ? true : v;
  }
});

const DRY_RUN = !!argMap["dry-run"];
const YES = !!argMap["yes"];
const BATCH_SIZE = parseInt((argMap["batch-size"] as string) || "500", 10);
const LIMIT = argMap["limit"] ? parseInt(argMap["limit"] as string, 10) : null;
const DELETE_ALL = !!argMap["all"];
const INCLUDE_PARTIDOS = !!argMap["include-partidos"];

interface CollectionStats {
  name: string;
  total: number;
  deleted: number;
}

async function confirmPrompt(message: string): Promise<boolean> {
  if (YES) return true;
  return new Promise<boolean>(resolve => {
    process.stdout.write(message + " (y/N): ");
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", data => {
      const text = String(data).trim().toLowerCase();
      resolve(text === "y" || text === "yes");
    });
  });
}

function isExpiredCache(doc: FirebaseFirestore.DocumentData): boolean {
  try {
    const ts =
      typeof doc.timestamp === "number" ? doc.timestamp : Number(doc.timestamp);
    const ttl = typeof doc.ttl === "number" ? doc.ttl : Number(doc.ttl);
    if (!ts || !ttl) return false;
    return Date.now() > ts + ttl;
  } catch {
    return false;
  }
}

function isExpiredMatch(doc: Partido): boolean {
  const now = Date.now();
  if (doc.ttl_fixture && doc.ttl_fixture.toMillis() < now) {
    return true;
  }
  if (doc.ttl_detalles && doc.ttl_detalles.toMillis() < now) {
    return true;
  }
  return false;
}

async function deleteCollection(
  collectionName: string,
  shouldDelete: (doc: FirebaseFirestore.DocumentData) => boolean
): Promise<CollectionStats> {
  const colRef = adminDb!.collection(collectionName);
  const stats: CollectionStats = {
    name: collectionName,
    total: 0,
    deleted: 0,
  };

  if (DRY_RUN) {
    // Count documents
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let q = colRef.limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;

      for (const d of snap.docs) {
        const data = d.data();
        if (shouldDelete(data)) {
          stats.total++;
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;
    }
    return stats;
  }

  // Delete documents
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let done = false;

  while (!done) {
    let q = colRef.limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = adminDb!.batch();
    let toDelete = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (shouldDelete(data)) {
        batch.delete(doc.ref);
        toDelete++;
      }
    }

    if (toDelete > 0) {
      await batch.commit();
      stats.deleted += toDelete;
      console.log(
        `  🗑️  ${collectionName}: Borrados ${toDelete} documentos (total: ${stats.deleted})`
      );
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.size < BATCH_SIZE) {
      done = true;
    }

    if (LIMIT && stats.deleted >= LIMIT) {
      console.log(`  📌 ${collectionName}: Límite alcanzado (${LIMIT}).`);
      break;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return stats;
}

async function clearAllCache() {
  if (!adminDb) {
    console.error(
      "❌ adminDb no está inicializado. Revisa tu configuración de Firebase."
    );
    process.exit(1);
  }

  console.log("🔎 Preparando limpieza completa de cache");
  console.log(
    `  Modo: ${DELETE_ALL ? "Borrar TODOS los documentos" : "Borrar solo documentos expirados/vacíos"}`
  );
  console.log(`  Batch size: ${BATCH_SIZE}`);
  if (LIMIT) console.log(`  Límite por colección: ${LIMIT}`);
  console.log(`  Incluir partidos: ${INCLUDE_PARTIDOS ? "Sí" : "No"}`);

  const collectionsToClean: Array<{
    name: string;
    shouldDelete: (doc: FirebaseFirestore.DocumentData) => boolean;
  }> = [
    {
      name: "api_cache",
      shouldDelete: DELETE_ALL ? () => true : isExpiredCache,
    },
    {
      name: "empty_queries",
      shouldDelete: () => true, // Siempre borrar todos los empty_queries
    },
  ];

  if (INCLUDE_PARTIDOS) {
    collectionsToClean.push({
      name: "partidos",
      shouldDelete: DELETE_ALL
        ? () => true
        : doc => isExpiredMatch(doc as Partido),
    });
  }

  if (DRY_RUN) {
    console.log("\n📋 DRY RUN: Contando documentos a borrar...\n");
    const stats: CollectionStats[] = [];
    for (const col of collectionsToClean) {
      const stat = await deleteCollection(col.name, col.shouldDelete);
      stats.push(stat);
      console.log(`  📊 ${col.name}: ${stat.total} documentos a borrar`);
    }
    console.log("\n📋 RESUMEN DRY RUN:");
    stats.forEach(s => {
      console.log(`  ${s.name}: ${s.total} documentos`);
    });
    return;
  }

  const ok = await confirmPrompt(
    `\n⚠️  ⚠️  ⚠️  ADVERTENCIA ⚠️  ⚠️  ⚠️\n` +
      `Esto eliminará documentos de las siguientes colecciones:\n` +
      `  - api_cache\n` +
      `  - empty_queries\n` +
      `${INCLUDE_PARTIDOS ? "  - partidos\n" : ""}` +
      `\n¿Estás seguro de que quieres continuar?`
  );

  if (!ok) {
    console.log("❌ Abortado por el usuario.");
    process.exit(0);
  }

  console.log("\n🚀 Iniciando borrado de cache...\n");

  const allStats: CollectionStats[] = [];

  for (const col of collectionsToClean) {
    console.log(`📦 Procesando colección: ${col.name}`);
    const stats = await deleteCollection(col.name, col.shouldDelete);
    allStats.push(stats);
    console.log(
      `✅ ${col.name}: Completado (${stats.deleted} documentos eliminados)\n`
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ LIMPIEZA COMPLETA FINALIZADA");
  console.log("=".repeat(60));
  console.log("\n📊 RESUMEN:");
  allStats.forEach(s => {
    console.log(`  ${s.name}: ${s.deleted} documentos eliminados`);
  });
  const totalDeleted = allStats.reduce((sum, s) => sum + s.deleted, 0);
  console.log(`\n📈 Total: ${totalDeleted} documentos eliminados`);
  console.log("\n✨ La cache ha sido limpiada completamente.");
}

clearAllCache().catch(err => {
  console.error("❌ Error durante la limpieza:", err);
  process.exit(1);
});
