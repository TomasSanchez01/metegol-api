// Massive Data Populator - Populates Firebase with extensive league data
import { DataSyncer } from "./DataSyncer";
import { FirestoreFootballService } from "../firestore-football-service";
import { format, subDays, addDays } from "date-fns";

interface PopulationConfig {
  leagues: {
    id: number;
    name: string;
    priority: "high" | "medium" | "low";
    region: string;
  }[];
  dateRange: {
    pastDays: number;
    futureDays: number;
  };
  throttling: {
    batchSize: number;
    delayBetweenBatches: number; // milliseconds
    maxApiCallsPerHour: number;
  };
}

export class MassiveDataPopulator {
  private syncer: DataSyncer;
  private firestoreService: FirestoreFootballService;
  private isRunning = false;
  private stats = {
    totalBatches: 0,
    completedBatches: 0,
    failedBatches: 0,
    totalApiCalls: 0,
    startTime: 0,
    estimatedCompletion: 0,
  };

  // Comprehensive league list with priorities
  private readonly COMPREHENSIVE_LEAGUES: PopulationConfig["leagues"] = [
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
    {
      id: 73,
      name: "Copa do Brasil",
      priority: "high",
      region: "South America",
    },

    // Europe - HIGH PRIORITY
    {
      id: 2,
      name: "UEFA Champions League",
      priority: "high",
      region: "Europe",
    },
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

    // Additional South American
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

    // Rest of World - LOW PRIORITY
    { id: 188, name: "Chinese Super League", priority: "low", region: "Asia" },
    { id: 218, name: "A-League", priority: "low", region: "Oceania" },
    { id: 169, name: "Saudi Pro League", priority: "low", region: "Asia" },
  ];

  constructor(apiKey: string) {
    this.syncer = new DataSyncer(apiKey);
    this.firestoreService = new FirestoreFootballService();
    // Inicializar API externa en FirestoreFootballService
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FootballApiServer } = require("../footballApi");
    const api = new FootballApiServer(apiKey);
    this.firestoreService.setExternalApi(api);
  }

  /**
   * Start massive population with custom configuration
   */
  async startMassivePopulation(
    config?: Partial<PopulationConfig>
  ): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️ POPULATION: Already running, stopping previous run...");
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    const finalConfig: PopulationConfig = {
      leagues: this.COMPREHENSIVE_LEAGUES,
      dateRange: {
        pastDays: 30,
        futureDays: 7,
      },
      throttling: {
        batchSize: 5, // 5 leagues per batch
        delayBetweenBatches: 30000, // 30 seconds between batches
        maxApiCallsPerHour: 300, // Conservative limit
      },
      ...config,
    };

    this.isRunning = true;
    this.stats = {
      totalBatches: 0,
      completedBatches: 0,
      failedBatches: 0,
      totalApiCalls: 0,
      startTime: Date.now(),
      estimatedCompletion: 0,
    };

    console.log(
      "🚀 MASSIVE POPULATION: Starting comprehensive data population"
    );
    console.log("📊 Configuration:", {
      totalLeagues: finalConfig.leagues.length,
      dateRange: `${finalConfig.dateRange.pastDays} days past + ${finalConfig.dateRange.futureDays} days future`,
      batchSize: finalConfig.throttling.batchSize,
      throttling: `${finalConfig.throttling.delayBetweenBatches}ms between batches`,
    });

    try {
      await this.populateByPriority(finalConfig);
      console.log("✅ MASSIVE POPULATION: Completed successfully!");
    } catch (error) {
      console.error("❌ MASSIVE POPULATION: Failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Populate data by priority (high -> medium -> low)
   */
  private async populateByPriority(config: PopulationConfig): Promise<void> {
    const priorities: Array<"high" | "medium" | "low"> = [
      "high",
      "medium",
      "low",
    ];

    for (const priority of priorities) {
      if (!this.isRunning) break;

      const leaguesForPriority = config.leagues.filter(
        l => l.priority === priority
      );

      console.log(
        `\n🎯 PRIORITY ${priority.toUpperCase()}: Starting ${leaguesForPriority.length} leagues`
      );

      await this.populateLeaguesBatch(leaguesForPriority, config);

      // Longer break between priority levels
      if (priority !== "low" && this.isRunning) {
        console.log(
          `⏳ PRIORITY BREAK: Waiting 60s before next priority level...`
        );
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  /**
   * Populate leagues in batches
   */
  private async populateLeaguesBatch(
    leagues: PopulationConfig["leagues"],
    config: PopulationConfig
  ): Promise<void> {
    // Split leagues into batches
    const batches = [];
    for (let i = 0; i < leagues.length; i += config.throttling.batchSize) {
      batches.push(leagues.slice(i, i + config.throttling.batchSize));
    }

    this.stats.totalBatches += batches.length;

    for (const batch of batches) {
      if (!this.isRunning) break;

      console.log(
        `\n📦 BATCH: Processing ${batch.map(l => l.name).join(", ")}`
      );

      try {
        await this.processBatch(batch, config);
        this.stats.completedBatches++;

        console.log(
          `✅ BATCH: Completed (${this.stats.completedBatches}/${this.stats.totalBatches})`
        );

        // Throttling between batches
        if (this.isRunning && batches.indexOf(batch) < batches.length - 1) {
          console.log(
            `⏳ THROTTLING: Waiting ${config.throttling.delayBetweenBatches}ms...`
          );
          await new Promise(resolve =>
            setTimeout(resolve, config.throttling.delayBetweenBatches)
          );
        }
      } catch (error) {
        this.stats.failedBatches++;
        console.error(`❌ BATCH: Failed processing batch:`, error);
      }
    }
  }

  /**
   * Process a single batch of leagues
   */
  private async processBatch(
    batch: PopulationConfig["leagues"],
    config: PopulationConfig
  ): Promise<void> {
    // Generate date range
    const dates: string[] = [];
    const today = new Date();

    // Past dates
    for (let i = config.dateRange.pastDays; i >= 1; i--) {
      dates.push(format(subDays(today, i), "yyyy-MM-dd"));
    }

    // Today
    dates.push(format(today, "yyyy-MM-dd"));

    // Future dates
    for (let i = 1; i <= config.dateRange.futureDays; i++) {
      dates.push(format(addDays(today, i), "yyyy-MM-dd"));
    }

    // Process each league for all dates
    for (const league of batch) {
      if (!this.isRunning) break;

      console.log(`⚽ LEAGUE: ${league.name} (${league.region})`);

      for (const date of dates) {
        if (!this.isRunning) break;

        try {
          // Usar FirestoreFootballService para sincronizar fixtures para esta liga y fecha
          // getFixtures ya maneja Firestore, API externa, enriquecimiento y guardado
          console.log(`📅 Syncing ${league.name} for ${date}...`);
          const matches = await this.firestoreService.getFixtures(
            date,
            date,
            league.id
          );

          console.log(
            `✅ Synced ${matches.length} matches for ${league.name} on ${date}`
          );

          // Increment API call counter (aproximado, ya que getFixtures puede usar cache)
          this.stats.totalApiCalls++;

          // Rate limiting: respect API limits
          if (this.stats.totalApiCalls % 10 === 0) {
            console.log(
              `⏱️ RATE LIMIT: Brief pause (${this.stats.totalApiCalls} API calls made)`
            );
            await new Promise(resolve => setTimeout(resolve, 600)); // 6 second pause every 10 calls
          } else {
            // Pequeña pausa entre llamadas para respetar rate limits
            await new Promise(resolve => setTimeout(resolve, 600)); // 600ms entre llamadas
          }
        } catch (error) {
          console.error(`❌ Failed to sync ${league.name} for ${date}:`, error);
        }
      }
    }
  }

  /**
   * Get population statistics
   */
  getStats() {
    const elapsed = Date.now() - this.stats.startTime;
    const progress =
      this.stats.totalBatches > 0
        ? (this.stats.completedBatches / this.stats.totalBatches) * 100
        : 0;

    return {
      ...this.stats,
      isRunning: this.isRunning,
      elapsed,
      progress: Math.round(progress),
      apiCallsPerHour: this.stats.totalApiCalls / (elapsed / (1000 * 60 * 60)),
    };
  }

  /**
   * Stop the population process
   */
  stop(): void {
    console.log("🛑 MASSIVE POPULATION: Stopping...");
    this.isRunning = false;
    this.syncer.stop();
  }

  /**
   * Quick population for essential leagues only
   */
  async quickPopulation(): Promise<void> {
    const essentialLeagues = this.COMPREHENSIVE_LEAGUES.filter(
      l =>
        l.priority === "high" && ["South America", "Europe"].includes(l.region)
    );

    await this.startMassivePopulation({
      leagues: essentialLeagues,
      dateRange: { pastDays: 7, futureDays: 3 },
      throttling: {
        batchSize: 3,
        delayBetweenBatches: 20000,
        maxApiCallsPerHour: 200,
      },
    });
  }

  /**
   * Full population for all leagues
   */
  async fullPopulation(): Promise<void> {
    await this.startMassivePopulation({
      leagues: this.COMPREHENSIVE_LEAGUES,
      dateRange: { pastDays: 60, futureDays: 14 },
      throttling: {
        batchSize: 4,
        delayBetweenBatches: 45000, // 45 seconds between batches
        maxApiCallsPerHour: 250,
      },
    });
  }
}
