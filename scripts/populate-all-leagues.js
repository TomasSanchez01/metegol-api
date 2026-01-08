#!/usr/bin/env node

/**
 * Script para poblar Firebase con datos de TODAS las ligas disponibles
 * Incluye todas las ligas del sistema con prioridades
 * Uso: node scripts/populate-all-leagues.js
 */

const https = require("https");

// Configuración
const BASE_URL = "http://localhost:3006";

// TODAS las ligas disponibles del sistema con prioridades
const ALL_LEAGUES = [
  // South America - HIGH PRIORITY
  {
    id: 128,
    name: "Liga Profesional Argentina",
    priority: "high",
    region: "South America",
  },
  {
    id: 129,
    name: "Primera Nacional Argentina",
    priority: "high",
    region: "South America",
  },
  {
    id: 130,
    name: "Copa Argentina",
    priority: "high",
    region: "South America",
  },
  {
    id: 71,
    name: "Brasileirão Serie A",
    priority: "high",
    region: "South America",
  },
  {
    id: 72,
    name: "Brasileirão Serie B",
    priority: "medium",
    region: "South America",
  },
  { id: 73, name: "Copa do Brasil", priority: "high", region: "South America" },
  {
    id: 13,
    name: "Copa Libertadores",
    priority: "high",
    region: "South America",
  },
  {
    id: 11,
    name: "Copa Sudamericana",
    priority: "medium",
    region: "South America",
  },

  // Europe - HIGH PRIORITY
  { id: 2, name: "UEFA Champions League", priority: "high", region: "Europe" },
  { id: 3, name: "UEFA Europa League", priority: "high", region: "Europe" },
  {
    id: 848,
    name: "UEFA Conference League",
    priority: "medium",
    region: "Europe",
  },
  { id: 39, name: "Premier League", priority: "high", region: "Europe" },
  { id: 140, name: "La Liga", priority: "high", region: "Europe" },
  { id: 135, name: "Serie A", priority: "high", region: "Europe" },
  { id: 78, name: "Bundesliga", priority: "high", region: "Europe" },
  { id: 61, name: "Ligue 1", priority: "high", region: "Europe" },

  // Additional European Leagues - MEDIUM PRIORITY
  {
    id: 144,
    name: "Belgian First Division A",
    priority: "medium",
    region: "Europe",
  },
  { id: 88, name: "Eredivisie", priority: "medium", region: "Europe" },
  { id: 94, name: "Primeira Liga", priority: "medium", region: "Europe" },
  {
    id: 203,
    name: "Super League Turkey",
    priority: "medium",
    region: "Europe",
  },

  // International - MEDIUM PRIORITY
  {
    id: 15,
    name: "FIFA Club World Cup",
    priority: "medium",
    region: "International",
  },
  { id: 1, name: "World Cup", priority: "high", region: "International" },
  {
    id: 4,
    name: "Euro Championship",
    priority: "high",
    region: "International",
  },
  { id: 9, name: "Copa America", priority: "high", region: "International" },

  // Rest of World - LOW PRIORITY
  { id: 188, name: "Chinese Super League", priority: "low", region: "Asia" },
  { id: 218, name: "A-League", priority: "low", region: "Oceania" },
  { id: 169, name: "Saudi Pro League", priority: "low", region: "Asia" },
];

// Función para hacer requests HTTP
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    // Log the outgoing URL for easier debugging
    try {
      console.log(`📡 makeRequest -> ${url}`);
    } catch (e) {}
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

    req.setTimeout(45000, () => {
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

// Función para generar fechas (hacia atrás y adelante)
function generateDates(pastDays = 10, futureDays = 10) {
  const dates = [];
  const today = new Date();

  // Fechas pasadas (de más reciente a más antigua)
  for (let i = pastDays; i >= 1; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push({ date: formatDate(date), type: "past" });
  }

  // Hoy
  dates.push({ date: formatDate(today), type: "today" });

  // Fechas futuras
  for (let i = 1; i <= futureDays; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push({ date: formatDate(date), type: "future" });
  }

  return dates;
}

async function populateAllLeagues() {
  console.log("🚀 Iniciando población masiva con TODAS las ligas...");
  console.log(`📡 Servidor: ${BASE_URL}`);
  console.log(`🏆 Total de ligas: ${ALL_LEAGUES.length}`);
  console.log("📅 Rango: Últimos 10 días + Hoy + Próximos 10 días");

  // Agrupar ligas por prioridad
  const leaguesByPriority = {
    high: ALL_LEAGUES.filter(l => l.priority === "high"),
    medium: ALL_LEAGUES.filter(l => l.priority === "medium"),
    low: ALL_LEAGUES.filter(l => l.priority === "low"),
  };

  console.log("\n📊 Distribución por prioridad:");
  console.log(`🔴 Alta prioridad: ${leaguesByPriority.high.length} ligas`);
  console.log(`🟡 Media prioridad: ${leaguesByPriority.medium.length} ligas`);
  console.log(`🟢 Baja prioridad: ${leaguesByPriority.low.length} ligas`);

  const dateObjects = generateDates(10, 10);
  const dates = dateObjects.map(d => d.date);
  console.log(`📅 Procesando ${dates.length} días:`, dates);

  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let totalMatches = 0;
  let leaguesWithMatches = new Set();

  try {
    // Verificar que el servidor esté corriendo
    console.log("\n🔍 Verificando conexión con el servidor...");
    await makeRequest(`${BASE_URL}/api/fixtures`);
    console.log("✅ Servidor disponible");

    // Procesar por prioridad
    const priorities = ["high", "medium", "low"];

    for (const priority of priorities) {
      const leagues = leaguesByPriority[priority];
      console.log(
        `\n🎯 PROCESANDO PRIORIDAD ${priority.toUpperCase()}: ${leagues.length} ligas`
      );

      // Procesar cada fecha
      for (let i = 0; i < dateObjects.length; i++) {
        const { date, type } = dateObjects[i];
        const dayNum = i + 1;

        let typeIcon = "📅";
        if (type === "past") typeIcon = "⏪";
        else if (type === "today") typeIcon = "📅";
        else if (type === "future") typeIcon = "⏩";

        console.log(
          `\n${typeIcon} ${dayNum}/${dateObjects.length}: Procesando ${date} (${type}) para ${leagues.length} ligas de prioridad ${priority}...`
        );

        // Crear grupos de ligas para procesar en paralelo (máximo 5 por grupo)
        const leagueGroups = [];
        for (let j = 0; j < leagues.length; j += 5) {
          leagueGroups.push(leagues.slice(j, j + 5));
        }

        for (
          let groupIndex = 0;
          groupIndex < leagueGroups.length;
          groupIndex++
        ) {
          const leagueGroup = leagueGroups[groupIndex];
          const leagueIds = leagueGroup.map(l => l.id);
          const leagueNames = leagueGroup.map(l => l.name);

          console.log(
            `  🔄 Grupo ${groupIndex + 1}/${leagueGroups.length}: ${leagueNames.join(", ")}`
          );

          // Solicitar fixtures para este grupo de ligas
          const leaguesParam = leagueIds.join(",");
          const url = `${BASE_URL}/api/fixtures?date=${date}&leagues=${leaguesParam}`;

          try {
            const response = await makeRequest(url);
            totalRequests++;

            if (response.statusCode === 200) {
              successfulRequests++;
              const matchCount = response.data.matches
                ? response.data.matches.length
                : 0;
              totalMatches += matchCount;

              if (matchCount > 0) {
                // Identificar qué ligas tuvieron partidos
                const matchLeagues = new Set();
                response.data.matches.forEach(match => {
                  matchLeagues.add(match.league.id);
                  leaguesWithMatches.add(match.league.name);
                });

                console.log(
                  `    ✅ ${matchCount} partidos encontrados en ${matchLeagues.size} ligas`
                );
              } else {
                console.log(`    ⚪ Sin partidos en este grupo`);
              }
            } else {
              failedRequests++;
              console.log(`    ❌ Error ${response.statusCode}`);
            }

            // Pausa entre grupos para no sobrecargar
            if (groupIndex < leagueGroups.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            totalRequests++;
            failedRequests++;
            console.log(`    ❌ Error - ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        // Pausa entre fechas
        if (i < dateObjects.length - 1) {
          console.log(`  ⏳ Fecha completada. Esperando 3 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Pausa entre prioridades
      if (priority !== "low") {
        console.log(
          `\n⏸️ PRIORIDAD ${priority.toUpperCase()} COMPLETADA. Pausa de 10 segundos antes de la siguiente prioridad...`
        );
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    console.log("\n🎉 ¡Población masiva completada!");
    console.log("📊 Estadísticas finales:", {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalMatches,
      leaguesWithMatches: leaguesWithMatches.size,
      successRate: `${Math.round((successfulRequests / totalRequests) * 100)}%`,
    });

    console.log("\n🏆 Ligas con partidos encontrados:");
    Array.from(leaguesWithMatches)
      .sort()
      .forEach(league => {
        console.log(`  - ${league}`);
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
  populateAllLeagues()
    .then(() => {
      console.log("🎉 Script completado exitosamente!");
      process.exit(0);
    })
    .catch(error => {
      console.error("💥 Script falló:", error);
      process.exit(1);
    });
}

module.exports = { populateAllLeagues };
