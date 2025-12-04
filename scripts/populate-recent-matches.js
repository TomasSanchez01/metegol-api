#!/usr/bin/env node

/**
 * Script para poblar Firebase con datos de partidos recientes y próximos
 * Busca desde hace 7 días hasta dentro de 7 días
 * Uso: node scripts/populate-recent-matches.js
 */

const https = require("https");

// Configuración
const BASE_URL = "http://localhost:3006";
const DEFAULT_LEAGUES = [128, 129, 130, 2, 3, 848, 15];

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

// Función para generar fechas (hacia atrás y adelante)
function generateDates(pastDays = 7, futureDays = 7) {
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

async function populateRecentMatches() {
    console.log("🚀 Iniciando población de partidos recientes y próximos...");
    console.log(`📡 Servidor: ${BASE_URL}`);
    console.log("📅 Rango: Últimos 7 días + Hoy + Próximos 7 días");

    const dateObjects = generateDates(7, 7);
    const dates = dateObjects.map(d => d.date);
    console.log(`📊 Procesando ${dates.length} días:`, dates);

    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalMatches = 0;

    try {
        // Verificar que el servidor esté corriendo
        console.log("\n🔍 Verificando conexión con el servidor...");
        await makeRequest(`${BASE_URL}/api/fixtures`);
        console.log("✅ Servidor disponible");

        // Procesar cada fecha
        for (let i = 0; i < dateObjects.length; i++) {
            const { date, type } = dateObjects[i];
            const dayNum = i + 1;

            let typeIcon = "📅";
            if (type === "past") typeIcon = "⏪";
            else if (type === "today") typeIcon = "📅";
            else if (type === "future") typeIcon = "⏩";

            console.log(
                `\n${typeIcon} ${dayNum}/${dateObjects.length}: Procesando ${date} (${type})...`
            );

            // Solicitar fixtures para todas las ligas en esta fecha
            const leaguesParam = DEFAULT_LEAGUES.join(",");
            const url = `${BASE_URL}/api/fixtures?date=${date}&leagues=${leaguesParam}`;

            try {
                console.log(`🔄 Solicitando: ${url}`);
                const response = await makeRequest(url);

                totalRequests++;

                if (response.statusCode === 200) {
                    successfulRequests++;
                    const matchCount = response.data.matches ?
                        response.data.matches.length :
                        0;
                    totalMatches += matchCount;

                    if (matchCount > 0) {
                        console.log(`✅ ${date}: ${matchCount} partidos encontrados`);
                    } else {
                        console.log(`⚪ ${date}: Sin partidos programados`);
                    }
                } else {
                    failedRequests++;
                    console.log(`❌ ${date}: Error ${response.statusCode}`);
                }

                // Pausa entre requests para no sobrecargar el servidor
                if (i < dateObjects.length - 1) {
                    console.log("⏳ Esperando 3 segundos...");
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (error) {
                totalRequests++;
                failedRequests++;
                console.log(`❌ ${date}: Error - ${error.message}`);

                // Pausa extra en caso de error
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log("\n🎉 ¡Población completada!");
        console.log("📊 Estadísticas finales:", {
            totalRequests,
            successfulRequests,
            failedRequests,
            totalMatches,
            successRate: `${Math.round((successfulRequests / totalRequests) * 100)}%`,
        });

        if (totalMatches === 0) {
            console.log("\n💡 No se encontraron partidos en el rango de fechas.");
            console.log("   Esto puede ser normal si:");
            console.log("   - Las ligas están en pausa temporada");
            console.log("   - Los partidos se programan con menos anticipación");
            console.log("   - Es época de receso entre temporadas");
        }
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
    populateRecentMatches()
        .then(() => {
            console.log("🎉 Script completado exitosamente!");
            process.exit(0);
        })
        .catch(error => {
            console.error("💥 Script falló:", error);
            process.exit(1);
        });
}

module.exports = { populateRecentMatches };