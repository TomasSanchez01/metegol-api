#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Massive Firebase Population Script
 *
 * Usage:
 *   node scripts/massive-populate.js quick      # Essential leagues, 7 days
 *   node scripts/massive-populate.js full       # All leagues, 60 days
 *   node scripts/massive-populate.js custom     # Custom configuration
 */

const {
  MassiveDataPopulator,
} = require("../lib/background-sync/MassiveDataPopulator");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: FOOTBALL_API_KEY not found in .env.local");
    process.exit(1);
  }

  const mode = process.argv[2] || "quick";
  const populator = new MassiveDataPopulator(apiKey);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log("\n🛑 Received SIGINT, stopping population...");
    populator.stop();
    setTimeout(() => {
      console.log("👋 Population stopped gracefully");
      process.exit(0);
    }, 2000);
  });

  // Status monitoring
  const statusInterval = setInterval(() => {
    const stats = populator.getStats();
    if (stats.isRunning) {
      console.log(
        `📊 STATUS: ${stats.progress}% complete, ${stats.completedBatches}/${stats.totalBatches} batches, ${stats.totalApiCalls} API calls`
      );
    } else if (stats.totalBatches > 0) {
      clearInterval(statusInterval);
      console.log("✅ Population completed!");
      console.log("📈 Final stats:", {
        totalBatches: stats.totalBatches,
        completedBatches: stats.completedBatches,
        failedBatches: stats.failedBatches,
        totalApiCalls: stats.totalApiCalls,
        elapsed: `${Math.round(stats.elapsed / 1000)}s`,
      });
      process.exit(0);
    }
  }, 30000); // Status every 30 seconds

  try {
    console.log(`🚀 Starting ${mode} population...`);

    switch (mode) {
      case "quick":
        console.log(
          "⚡ QUICK MODE: Essential leagues, last 7 days + next 3 days"
        );
        await populator.quickPopulation();
        break;

      case "full":
        console.log("🌍 FULL MODE: All leagues, last 60 days + next 14 days");
        await populator.fullPopulation();
        break;

      case "custom":
        console.log("🎛️ CUSTOM MODE: Custom configuration");
        await populator.startMassivePopulation({
          leagues: undefined, // Use all leagues
          dateRange: {
            pastDays: parseInt(process.argv[3]) || 30,
            futureDays: parseInt(process.argv[4]) || 7,
          },
          throttling: {
            batchSize: parseInt(process.argv[5]) || 5,
            delayBetweenBatches: parseInt(process.argv[6]) || 30000,
            maxApiCallsPerHour: parseInt(process.argv[7]) || 300,
          },
        });
        break;

      default:
        console.error("❌ Invalid mode. Use: quick, full, or custom");
        console.log("📖 Usage:");
        console.log("  node scripts/massive-populate.js quick");
        console.log("  node scripts/massive-populate.js full");
        console.log(
          "  node scripts/massive-populate.js custom [pastDays] [futureDays] [batchSize] [delay] [maxCallsPerHour]"
        );
        process.exit(1);
    }
  } catch (error) {
    console.error("💥 Population failed:", error);
    clearInterval(statusInterval);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
