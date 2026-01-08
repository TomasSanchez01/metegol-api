#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Script para poblar Firebase con datos desde hoy hasta los próximos 15 días
 * Usa los endpoints de la API directamente (requiere que el servidor esté corriendo)
 * Uso: node scripts/populate-via-api.js
 */

// Configuración
const BASE_URL = "http://localhost:3006";
const DEFAULT_LEAGUES = [128, 129, 130, 2, 3, 848, 15];

// Función para hacer requests HTTP
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    // Log the outgoing URL for easier debugging
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
    };

    const req = require("http").request(options, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: jsonData });
        } catch (error) {
          reject(new Error(`Error parsing JSON: ${error.message}`));
        }
      });
    });

    req.on("error", error => {
      reject(error);
    });

    req.setTimeout(30000, () => {
      req.abort();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

// Función para obtener fecha en formato yyyy-MM-dd
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Función para generar fechas
function generateDates(days = 15) {
  const dates = [];
  const today = new Date();

  for (let i = 0; i <= days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(formatDate(date));
  }

  return dates;
}

async function populateNext15Days() {
  console.log("🚀 Iniciando población de próximos 15 días vía API...");
  console.log(`📡 Servidor: ${BASE_URL}`);
  console.log("📅 Rango: Hoy hasta +15 días");

  const dates = generateDates(15);
  console.log(`📊 Procesando ${dates.length} días:`, dates);

  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;

  try {
    // Verificar que el servidor esté corriendo
    console.log("\n🔍 Verificando conexión con el servidor...");
    await makeRequest(`${BASE_URL}/api/fixtures`);
    console.log("✅ Servidor disponible");

    // Procesar cada fecha
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dayNum = i + 1;

      console.log(`\n📅 ${dayNum}/${dates.length}: Procesando ${date}...`);

      // Solicitar fixtures para todas las ligas en esta fecha
      const leaguesParam = DEFAULT_LEAGUES.join(",");
      const url = `${BASE_URL}/api/fixtures?date=${date}&leagues=${leaguesParam}`;

      try {
        console.log(`🔄 Solicitando: ${url}`);
        const response = await makeRequest(url);

        totalRequests++;

        if (response.statusCode === 200) {
          successfulRequests++;
          const matchCount = response.data.matches
            ? response.data.matches.length
            : 0;
          console.log(`✅ ${date}: ${matchCount} partidos cargados`);
        } else {
          failedRequests++;
          console.log(`❌ ${date}: Error ${response.statusCode}`);
        }

        // Pausa entre requests para no sobrecargar el servidor
        if (i < dates.length - 1) {
          console.log("⏳ Esperando 5 segundos...");
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        totalRequests++;
        failedRequests++;
        console.log(`❌ ${date}: Error - ${error.message}`);

        // Pausa extra en caso de error
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    console.log("\n🎉 ¡Población completada!");
    console.log("📊 Estadísticas finales:", {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: `${Math.round((successfulRequests / totalRequests) * 100)}%`,
    });
  } catch (error) {
    console.error("❌ Error durante la población:", error.message);

    if (error.message.includes("ECONNREFUSED")) {
      console.log("💡 Asegúrate de que el servidor esté corriendo:");
      console.log("   yarn dev");
    }

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
