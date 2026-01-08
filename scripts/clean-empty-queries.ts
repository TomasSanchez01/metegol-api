#!/usr/bin/env node
/**
 * Script para eliminar documentos de la colección `empty_queries` en Firestore
 *
 * Uso:
 *  npx tsx scripts/clean-empty-queries.ts         # pedirá confirmación interactiva
 *  npx tsx scripts/clean-empty-queries.ts --yes  # elimina sin pedir confirmación
 *  npx tsx scripts/clean-empty-queries.ts --dry-run  # muestra cuántos docs habría que borrar
 *  npx tsx scripts/clean-empty-queries.ts --batch-size=200 --limit=1000
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

async function deleteEmptyQueries() {
  if (!adminDb) {
    console.error(
      "❌ adminDb no está inicializado. Revisa tu configuración de Firebase."
    );
    process.exit(1);
  }

  const colRef = adminDb.collection("empty_queries");

  // Count documents first (best-effort). If collection large, this can be slow.
  console.log(`🔎 Preparando para borrar documentos de 'empty_queries'`);

  // If dry run, just count and exit
  let totalDeleted = 0;
  let shouldContinue = true;

  if (DRY_RUN) {
    // Count documents (may be expensive) by paginating
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let total = 0;
    while (shouldContinue) {
      let q = colRef.limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;
      total += snap.size;
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;
    }
    console.log(
      `📋 DRY RUN: documentos encontrados en 'empty_queries': ${total}`
    );
    return;
  }

  // Ask confirmation
  const ok = await confirmPrompt(
    `⚠️  Esto eliminará documentos en la colección 'empty_queries'. Continuar?`
  );
  if (!ok) {
    console.log("Abortado por el usuario.");
    process.exit(0);
  }

  console.log(`⚙️  Borrando en batches de ${BATCH_SIZE} documentos...`);

  // Main loop: delete in batches until none left or limit reached
  while (shouldContinue) {
    const q = colRef.limit(BATCH_SIZE);
    const snap = await q.get();
    if (snap.empty) {
      shouldContinue = false;
      break;
    }

    const batch = adminDb.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();

    const deletedNow = snap.size;
    totalDeleted += deletedNow;

    console.log(
      `🗑️  Borrados ${deletedNow} documentos (total borrados: ${totalDeleted})`
    );

    if (LIMIT && totalDeleted >= LIMIT) {
      console.log(`📌 Límite alcanzado (${LIMIT}). Terminando.`);
      break;
    }

    // small delay to avoid throttling
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(
    `✅ Operación completada. Documentos eliminados: ${totalDeleted}`
  );
}

deleteEmptyQueries().catch(err => {
  console.error("Error durante la limpieza:", err);
  process.exit(1);
});
