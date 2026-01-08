#!/usr/bin/env node
/**
 * Script para limpiar la colección de cache (api_cache) en Firestore
 *
 * Uso:
 *  npx tsx scripts/clear-cache.ts                 # pedirá confirmación (borrar solo expirados)
 *  npx tsx scripts/clear-cache.ts --yes --all     # eliminar TODO sin confirmar
 *  npx tsx scripts/clear-cache.ts --dry-run      # mostrar cuántos docs habría que borrar
 *  npx tsx scripts/clear-cache.ts --batch-size=200 --limit=1000
 *
 * Opciones:
 *  --dry-run       No borra, solo muestra conteo estimado
 *  --yes           Ejecuta sin confirmación
 *  --batch-size=N  Tamaño de batch para borrado (default 500)
 *  --limit=N       Límite máximo de documentos a borrar
 *  --all           Borrar todos los documentos en la colección (por defecto borra solo expirados)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";

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
const COLLECTION = "api_cache";

async function confirmPrompt(message: string) {
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

function isExpired(doc: FirebaseFirestore.DocumentData) {
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

async function clearCache() {
  if (!adminDb) {
    console.error(
      "❌ adminDb no está inicializado. Revisa tu configuración de Firebase."
    );
    process.exit(1);
  }

  const colRef = adminDb.collection(COLLECTION);

  console.log(`🔎 Preparando limpieza de colección '${COLLECTION}'`);
  console.log(
    `  Modo: ${DELETE_ALL ? "Borrar TODOS los documentos" : "Borrar solo documentos expirados"}`
  );
  console.log(`  Batch size: ${BATCH_SIZE}`);
  if (LIMIT) console.log(`  Límite: ${LIMIT}`);

  if (DRY_RUN) {
    // Count documents to be deleted (best-effort). If DELETE_ALL -> count all; else count expired manually
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let total = 0;
    while (true) {
      let q = colRef.limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;

      if (DELETE_ALL) {
        total += snap.size;
      } else {
        for (const d of snap.docs) {
          const data = d.data();
          if (isExpired(data)) total++;
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;
    }

    console.log(`📋 DRY RUN: documentos que se borrarían: ${total}`);
    return;
  }

  const ok = await confirmPrompt(
    `⚠️  Esto eliminará documentos de '${COLLECTION}'. Continuar?`
  );
  if (!ok) {
    console.log("Abortado por el usuario.");
    process.exit(0);
  }

  let totalDeleted = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let done = false;

  while (!done) {
    let q = colRef.limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    let toDelete = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (DELETE_ALL || isExpired(data)) {
        batch.delete(doc.ref);
        toDelete++;
      }
    }

    if (toDelete > 0) {
      await batch.commit();
      totalDeleted += toDelete;
      console.log(
        `🗑️  Borrados ${toDelete} documentos (total borrados: ${totalDeleted})`
      );
    }

    // Move cursor forward
    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.size < BATCH_SIZE) {
      done = true;
    }

    if (LIMIT && totalDeleted >= LIMIT) {
      console.log(`📌 Límite alcanzado (${LIMIT}). Terminando.`);
      break;
    }

    // small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(
    `✅ Operación completada. Documentos eliminados: ${totalDeleted}`
  );
}

clearCache().catch(err => {
  console.error("Error durante la limpieza:", err);
  process.exit(1);
});
