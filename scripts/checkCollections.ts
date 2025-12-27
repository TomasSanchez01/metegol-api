/**
 * Script para listar las colecciones existentes en Firestore
 *
 * Uso: npx tsx scripts/checkCollections.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminDb } from "@/lib/firebase/config";

async function checkCollections() {
  try {
    console.log("🔍 Listando colecciones existentes en Firestore...\n");

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

    const collections = await adminDb.listCollections();

    if (collections.length === 0) {
      console.log("⚠️  No se encontraron colecciones en Firestore.");
      return;
    }

    console.log(`✅ Se encontraron ${collections.length} colección(es):\n`);

    for (const collection of collections) {
      console.log(`  📦 ${collection.id}`);

      // Opcional: contar documentos en cada colección
      try {
        const snapshot = await collection.limit(1).get();
        const count = snapshot.size;

        if (count > 0) {
          // Intentar obtener el conteo total (esto puede ser costoso para colecciones grandes)
          const allDocs = await collection.count().get();
          const totalCount = allDocs.data().count;
          console.log(`     └─ Documentos: ${totalCount.toLocaleString()}`);
        } else {
          console.log(`     └─ Vacía`);
        }
      } catch (error) {
        console.log(`     └─ Error al contar documentos: ${error}`);
      }
    }

    console.log("\n✅ Listado completado.");
  } catch (error) {
    console.error("❌ Error al listar colecciones:", error);
    process.exit(1);
  }
}

// Ejecutar el script
checkCollections()
  .then(() => {
    console.log("\n✨ Script finalizado.");
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });
