#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Script para poblar Firebase con datos desde hoy hasta los próximos 15 días
 * Uso: node scripts/populate-next-15-days.js
 */

const { DataSyncer } = require("../lib/background-sync/DataSyncer");
require("dotenv").config({ path: ".env.local" });

async function populateNext15Days() {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: FOOTBALL_API_KEY no encontrada en .env.local");
    process.exit(1);
  }

  console.log("🚀 Iniciando población de próximos 15 días...");
  console.log("📅 Rango: Hoy hasta +15 días");

  const syncer = new DataSyncer(apiKey);

  // Función para obtener fecha en formato yyyy-MM-dd
  const formatDate = date => {
    return date.toISOString().split("T")[0];
  };

  // Generar fechas desde hoy hasta +15 días
  const dates = [];
  const today = new Date();

  for (let i = 0; i <= 15; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(formatDate(date));
  }

  console.log(`📊 Procesando ${dates.length} días:`, dates);

  try {
    // Procesar cada fecha individualmente para evitar sobrecargar la API
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dayNum = i + 1;

      console.log(`\n📅 ${dayNum}/${dates.length}: Procesando ${date}...`);

      // Sync fixtures para esta fecha específica
      await syncer.queueFixturesSync([date]);
      await syncer.processQueue();

      // Pequeña pausa entre fechas para respetar rate limits
      if (i < dates.length - 1) {
        console.log("⏳ Esperando 10 segundos antes del siguiente día...");
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      const stats = syncer.getStats();
      console.log(
        `✅ Día ${dayNum} completado. API calls hoy: ${stats.apiCallsToday}`
      );
    }

    const finalStats = syncer.getStats();
    console.log("\n🎉 ¡Población de 15 días completada!");
    console.log("📊 Estadísticas finales:", {
      totalJobs: finalStats.totalJobs,
      completedJobs: finalStats.completedJobs,
      failedJobs: finalStats.failedJobs,
      apiCallsToday: finalStats.apiCallsToday,
      dataItemsSynced: finalStats.dataItemsSynced,
    });
  } catch (error) {
    console.error("❌ Error durante la población:", error);
    process.exit(1);
  }
}

// Manejar Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n🛑 Recibido SIGINT, deteniendo población...");
  setTimeout(() => {
    console.log("👋 Script detenido");
    process.exit(0);
  }, 1000);
});

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  populateNext15Days()
    .then(() => {
      console.log("🎉 Script completado exitosamente!");
      process.exit(0);
    })
    .catch(error => {
      console.error("💥 Script falló:", error);
      process.exit(1);
    });
}

module.exports = { populateNext15Days };
