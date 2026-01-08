#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Script para poblar Firebase con datos de múltiples días
 * Uso: node scripts/populate-firebase.js
 */

const { DataSyncer } = require("../lib/background-sync/DataSyncer");
require("dotenv").config({ path: ".env.local" });

async function populateFirebase() {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: FOOTBALL_API_KEY no encontrada en .env.local");
    process.exit(1);
  }

  console.log("🚀 Iniciando población de Firebase...");
  console.log("📅 Sincronizando múltiples días de datos...");

  const syncer = new DataSyncer(apiKey);

  try {
    // 1. Datos de hoy y mañana
    console.log("\n📊 1/4: Sincronizando hoy y mañana...");
    await syncer.syncTodaysData();

    // 2. Datos históricos (últimos 7 días)
    console.log(
      "\n📚 2/4: Sincronizando datos históricos (últimos 30 días)..."
    );
    await syncer.syncHistoricalData();

    // 3. Force sync para algunos días específicos
    console.log("\n🎯 3/4: Force sync para días específicos...");
    await syncer.forceSync("yesterday");
    await syncer.forceSync("tomorrow");

    // 4. Smart sync final
    console.log("\n🧠 4/4: Smart sync final...");
    await syncer.smartSync();

    const stats = syncer.getStats();
    console.log("\n✅ População completa!");
    console.log("📊 Estadísticas finales:", {
      totalJobs: stats.totalJobs,
      completedJobs: stats.completedJobs,
      failedJobs: stats.failedJobs,
      apiCallsToday: stats.apiCallsToday,
      dataItemsSynced: stats.dataItemsSynced,
    });
  } catch (error) {
    console.error("❌ Error durante la población:", error);
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  populateFirebase()
    .then(() => {
      console.log("🎉 Script completado exitosamente!");
      process.exit(0);
    })
    .catch(error => {
      console.error("💥 Script falló:", error);
      process.exit(1);
    });
}

module.exports = { populateFirebase };
