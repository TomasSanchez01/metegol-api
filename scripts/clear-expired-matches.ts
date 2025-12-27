#!/usr/bin/env node
/**
 * Script para limpiar partidos expirados de la colección 'partidos' en Firestore
 * basado en los campos TTL (ttl_fixture y ttl_detalles)
 *
 * Uso:
 *  npx tsx scripts/clear-expired-matches.ts                 # pedirá confirmación (borrar solo expirados)
 *  npx tsx scripts/clear-expired-matches.ts --yes --all     # eliminar TODO sin confirmar
 *  npx tsx scripts/clear-expired-matches.ts --dry-run      # mostrar cuántos docs habría que borrar
 *  npx tsx scripts/clear-expired-matches.ts --batch-size=200 --limit=1000
 *  npx tsx scripts/clear-expired-matches.ts --ttl-field=fixture  # solo verificar ttl_fixture
 *  npx tsx scripts/clear-expired-matches.ts --ttl-field=detalles # solo verificar ttl_detalles
 *
 * Opciones:
 *  --dry-run       No borra, solo muestra conteo estimado
 *  --yes           Ejecuta sin confirmación
 *  --batch-size=N  Tamaño de batch para borrado (default 500)
 *  --limit=N       Límite máximo de documentos a borrar
 *  --all           Borrar todos los documentos en la colección (por defecto borra solo expirados)
 *  --ttl-field     Campo TTL a verificar: 'fixture', 'detalles', o 'both' (default: 'both')
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";
import { Timestamp } from "firebase-admin/firestore";

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
const TTL_FIELD = (argMap["ttl-field"] as string) || "both";
const COLLECTION = "partidos";

type TtlFieldOption = "fixture" | "detalles" | "both";

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

function isExpired(
  doc: FirebaseFirestore.DocumentData,
  ttlField: TtlFieldOption
): boolean {
  try {
    const now = Date.now();

    if (ttlField === "fixture" || ttlField === "both") {
      const ttlFixture = doc.ttl_fixture;
      if (ttlFixture) {
        const ttlTimestamp =
          ttlFixture instanceof Timestamp
            ? ttlFixture.toMillis()
            : typeof ttlFixture === "number"
              ? ttlFixture
              : ttlFixture._seconds
                ? ttlFixture._seconds * 1000 +
                  (ttlFixture._nanoseconds || 0) / 1000000
                : null;

        if (ttlTimestamp && now > ttlTimestamp) {
          return true;
        }
      }
    }

    if (ttlField === "detalles" || ttlField === "both") {
      const ttlDetalles = doc.ttl_detalles;
      if (ttlDetalles) {
        const ttlTimestamp =
          ttlDetalles instanceof Timestamp
            ? ttlDetalles.toMillis()
            : typeof ttlDetalles === "number"
              ? ttlDetalles
              : ttlDetalles._seconds
                ? ttlDetalles._seconds * 1000 +
                  (ttlDetalles._nanoseconds || 0) / 1000000
                : null;

        if (ttlTimestamp && now > ttlTimestamp) {
          return true;
        }
      }
    }

    // Si se verifica 'both' y ninguno de los dos está expirado, retornar false
    // Si se verifica uno específico y no está expirado, retornar false
    return false;
  } catch (e) {
    console.warn(`⚠️  Error verificando TTL del documento ${doc.id}:`, e);
    return false;
  }
}

function getTtlFieldDescription(ttlField: TtlFieldOption): string {
  switch (ttlField) {
    case "fixture":
      return "solo ttl_fixture";
    case "detalles":
      return "solo ttl_detalles";
    case "both":
      return "ttl_fixture o ttl_detalles";
    default:
      return "ttl_fixture o ttl_detalles";
  }
}

async function clearExpiredMatches() {
  if (!adminDb) {
    console.error(
      "❌ adminDb no está inicializado. Revisa tu configuración de Firebase."
    );
    process.exit(1);
  }

  const colRef = adminDb.collection(COLLECTION);
  const ttlFieldOption = TTL_FIELD as TtlFieldOption;

  if (!["fixture", "detalles", "both"].includes(ttlFieldOption)) {
    console.error(
      `❌ Valor inválido para --ttl-field: ${TTL_FIELD}. Debe ser 'fixture', 'detalles' o 'both'`
    );
    process.exit(1);
  }

  console.log(`🔎 Preparando limpieza de colección '${COLLECTION}'`);
  console.log(
    `  Modo: ${DELETE_ALL ? "Borrar TODOS los documentos" : "Borrar solo documentos expirados"}`
  );
  console.log(
    `  Campo TTL verificado: ${getTtlFieldDescription(ttlFieldOption)}`
  );
  console.log(`  Batch size: ${BATCH_SIZE}`);
  if (LIMIT) console.log(`  Límite: ${LIMIT}`);

  if (DRY_RUN) {
    // Count documents to be deleted (best-effort)
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let total = 0;
    let totalProcessed = 0;

    while (true) {
      let q = colRef.limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      // eslint-disable-next-line no-await-in-loop
      const snap = await q.get();
      if (snap.empty) break;

      if (DELETE_ALL) {
        total += snap.size;
      } else {
        for (const d of snap.docs) {
          const data = d.data();
          if (isExpired(data, ttlFieldOption)) {
            total++;
          }
        }
      }

      totalProcessed += snap.size;
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;

      // Mostrar progreso cada 1000 documentos
      if (totalProcessed % 1000 === 0) {
        console.log(
          `  📊 Procesados ${totalProcessed} documentos, encontrados ${total} expirados...`
        );
      }
    }

    console.log(
      `📋 DRY RUN: documentos que se borrarían: ${total} (de ${totalProcessed} procesados)`
    );
    return;
  }

  const ok = await confirmPrompt(
    `⚠️  Esto eliminará documentos de '${COLLECTION}' ${DELETE_ALL ? "(TODOS)" : `(expirados según ${getTtlFieldDescription(ttlFieldOption)})`}. Continuar?`
  );
  if (!ok) {
    console.log("Abortado por el usuario.");
    process.exit(0);
  }

  let totalDeleted = 0;
  let totalProcessed = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let done = false;

  while (!done) {
    let q = colRef.limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    // eslint-disable-next-line no-await-in-loop
    const snap = await q.get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    let toDelete = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (DELETE_ALL || isExpired(data, ttlFieldOption)) {
        batch.delete(doc.ref);
        toDelete++;
      }
    }

    if (toDelete > 0) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      totalDeleted += toDelete;
      console.log(
        `🗑️  Borrados ${toDelete} documentos (total borrados: ${totalDeleted}, procesados: ${totalProcessed + snap.size})`
      );
    } else {
      console.log(
        `  ⏭️  Batch sin documentos expirados (procesados: ${totalProcessed + snap.size})`
      );
    }

    totalProcessed += snap.size;

    // Move cursor forward
    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.size < BATCH_SIZE) {
      done = true;
    }

    if (LIMIT && totalDeleted >= LIMIT) {
      console.log(`📌 Límite alcanzado (${LIMIT}). Terminando.`);
      break;
    }

    // small delay to avoid throttling
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(
    `✅ Operación completada. Documentos eliminados: ${totalDeleted} (de ${totalProcessed} procesados)`
  );
}

clearExpiredMatches().catch(err => {
  console.error("Error durante la limpieza:", err);
  process.exit(1);
});
