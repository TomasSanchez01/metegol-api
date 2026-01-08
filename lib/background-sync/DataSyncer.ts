// Background Data Syncer - Syncs external API data to Firestore
import { FootballApiServer } from "../footballApi";
import { FirestoreFootballService } from "../firestore-football-service";
import { format, subDays, addDays } from "date-fns";
import type { Match } from "@/types/match";

interface SyncJob {
  id: string;
  type: "fixtures" | "stats" | "events" | "lineups" | "teams" | "leagues";
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata: Record<string, unknown>;
}

interface SyncStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastSyncTime: number;
  apiCallsToday: number;
  dataItemsSynced: number;
}

export class DataSyncer {
  private api: FootballApiServer;
  private firestoreService: FirestoreFootballService;
  private syncQueue: SyncJob[] = [];
  private isRunning = false;
  private stats: SyncStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    lastSyncTime: 0,
    apiCallsToday: 0,
    dataItemsSynced: 0,
  };

  // Priority leagues to sync (most active/popular)
  private defaultLeagues = [
    128,
    129,
    130, // Argentina (Liga Profesional, Primera Nacional, Copa Argentina)
    2,
    3,
    848, // UEFA (Champions, Europa, Conference)
    140,
    39,
    135,
    78,
    61, // Top 5 European leagues
    13,
    11, // CONMEBOL (Libertadores, Sudamericana)
    71,
    73, // Brazil (Brasileirão A, Copa do Brasil)
    15, // Mundial de Clubes
  ];

  constructor(apiKey: string) {
    this.api = new FootballApiServer(apiKey);
    this.firestoreService = new FirestoreFootballService();
    // Inicializar API externa en FirestoreFootballService
    this.firestoreService.setExternalApi(this.api);
    // Inicializar fecha del último reset
    this.checkAndResetApiCalls();
  }

  /**
   * Verificar si es un nuevo día (UTC) y actualizar el contador de API calls desde el contador global
   */
  private checkAndResetApiCalls(): void {
    // El contador global se resetea automáticamente en FootballApiServer
    // SIEMPRE sincronizar nuestro contador local con el global
    // El contador global es la fuente de verdad para todas las instancias
    const globalApiCalls = this.api.getGlobalApiCallCount();

    // SIEMPRE actualizar el contador local con el global (no solo si es diferente)
    // Esto asegura que capturamos todas las llamadas, incluso las hechas desde otras instancias
    const previousCount = this.stats.apiCallsToday;
    this.stats.apiCallsToday = globalApiCalls;

    // Log solo si hay un cambio significativo
    const diff = globalApiCalls - previousCount;
    if (diff > 0) {
      // console.log(
      //   `🔄 Syncing API calls: ${previousCount} -> ${globalApiCalls} (+${diff})`
      // );
    } else if (diff < 0 && globalApiCalls === 0) {
      // Si el global es 0, puede ser que se haya reseteado (nuevo día o reinicio)
      // console.log(
      //   `🔄 API calls counter reset detected: ${previousCount} -> ${globalApiCalls}`
      // );
    }
  }

  /**
   * Sync today's fixtures and related data
   */
  async syncTodaysData(): Promise<void> {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

    // console.log(`🔄 SYNC: Starting sync for ${today}`);

    // Queue fixtures for today and yesterday (for late finishers)
    await this.queueFixturesSync([today, yesterday]);

    // Process the queue
    await this.processQueue();
  }

  /**
   * Sync historical data (last 30 days) - OPTIMIZED for API limits
   */
  async syncHistoricalData(): Promise<void> {
    const today = new Date();
    const dates: string[] = [];

    // Get last 30 days of data, prioritizing recent dates
    for (let i = 1; i <= 30; i++) {
      const date = format(subDays(today, i), "yyyy-MM-dd");
      dates.push(date);
    }

    // console.log(`📚 HISTORICAL SYNC: Starting sync for last 30 days`);

    // Process only 2-3 dates per batch to respect API limits
    const batches = [];
    for (let i = 0; i < dates.length; i += 3) {
      batches.push(dates.slice(i, i + 3));
    }

    for (const batch of batches) {
      // console.log(`📚 HISTORICAL SYNC: Processing batch ${batch.join(", ")}`);

      // Queue fixtures for this batch
      await this.queueFixturesSync(batch);

      // Queue detailed data for finished matches
      for (const date of batch) {
        await this.queueDetailedDataSync(date);
      }

      // Process this batch
      await this.processQueue();

      // Wait 6 seconds between batches to respect rate limits (10/minute)
      if (batch !== batches[batches.length - 1]) {
        // console.log(`⏳ HISTORICAL SYNC: Waiting 6s to respect rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    // console.log(`✅ HISTORICAL SYNC: Completed historical data sync`);
  }

  /**
   * Smart sync based on time of day - OPTIMIZED for API limits
   */
  async smartSync(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const today = format(now, "yyyy-MM-dd");
    const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
    const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

    // console.log(
    //   `🧠 SMART SYNC: Starting at ${hour}:${now.getMinutes()} (API: ${this.stats.apiCallsToday}/7500)`
    // );

    // Check if we're approaching API limits
    const apiUsagePercent = (this.stats.apiCallsToday / 7500) * 100;

    if (apiUsagePercent > 80) {
      // console.log(
      //   `⚠️ SMART SYNC: High API usage (${apiUsagePercent.toFixed(1)}%), limiting operations`
      // );
    }

    // Morning (6-10): Sync yesterday's final results + today's fixtures
    if (hour >= 6 && hour < 10) {
      await this.queueFixturesSync([yesterday, today]);
      if (apiUsagePercent < 60) {
        await this.queueDetailedDataSync(yesterday); // Only if we have API budget
      }
      // console.log(
      //   "🌅 MORNING SYNC: Yesterday + today" +
      //     (apiUsagePercent < 60 ? " + details" : "")
      // );
    }

    // Afternoon (10-18): Focus on today's matches + detailed data
    else if (hour >= 10 && hour < 18) {
      await this.queueFixturesSync([today]);
      await this.queueDetailedDataSync(today);
      // console.log("☀️ AFTERNOON SYNC: Today's matches + details");
    }

    // Evening (18-22): Live matches + tomorrow's fixtures + detailed data for today
    else if (hour >= 18 && hour < 22) {
      await this.queueFixturesSync([today, tomorrow]);
      await this.queueDetailedDataSync(today);
      await this.queueLiveMatchesSync();
      // console.log("🌆 EVENING SYNC: Live matches + tomorrow + today's details");
    }

    // Night (22-6): Light sync, tomorrow's fixtures only
    else {
      await this.queueFixturesSync([tomorrow]);
      // console.log("🌙 NIGHT SYNC: Tomorrow's fixtures only");
    }

    await this.processQueue();
  }

  /**
   * Queue fixtures sync for specific dates
   */
  private async queueFixturesSync(dates: string[]): Promise<void> {
    let jobsAdded = 0;
    for (const date of dates) {
      for (const leagueId of this.defaultLeagues) {
        const jobId = `fixtures_${leagueId}_${date}`;

        if (!this.syncQueue.find(job => job.id === jobId)) {
          this.syncQueue.push({
            id: jobId,
            type: "fixtures",
            status: "pending",
            createdAt: Date.now(),
            metadata: { date, leagueId },
          });
          jobsAdded++;
        }
      }
    }

    // Actualizar totalJobs cuando se agregan nuevos jobs
    // totalJobs debe reflejar el total acumulado de jobs que han pasado por la cola
    if (jobsAdded > 0) {
      // Sumar los nuevos jobs al total acumulado (no solo el máximo)
      this.stats.totalJobs += jobsAdded;
    }

    // console.log(
    //   `📅 QUEUED: Fixtures for ${dates.join(", ")} (${this.defaultLeagues.length} leagues each, ${jobsAdded} new jobs)`
    // );
  }

  /**
   * Queue detailed data sync (stats, events) for matches on a specific date
   * Usa FirestoreFootballService para obtener matches y enriquecerlos
   * NOTA: No crea jobs adicionales si ya hay jobs de fixtures para la misma fecha/liga
   * porque getFixtures() ya enriquece automáticamente cuando es necesario
   */
  private async queueDetailedDataSync(date: string): Promise<void> {
    // Verificar qué ligas ya tienen jobs de fixtures en la cola para esta fecha
    const existingFixtureJobs = new Set<string>();
    for (const job of this.syncQueue) {
      if (
        job.type === "fixtures" &&
        job.metadata.date === date &&
        job.metadata.leagueId
      ) {
        existingFixtureJobs.add(`${date}_${job.metadata.leagueId}`);
      }
    }

    // Solo crear jobs de enriquecimiento para matches que realmente lo necesiten
    // y que no tengan ya un job de fixtures en la cola
    for (const leagueId of this.defaultLeagues) {
      const fixtureJobKey = `${date}_${leagueId}`;

      // Si ya hay un job de fixtures para esta fecha/liga, no crear job de enriquecimiento
      // porque getFixtures() ya enriquecerá automáticamente
      if (existingFixtureJobs.has(fixtureJobKey)) {
        continue;
      }

      try {
        // Solo obtener matches desde Firestore (sin crear jobs adicionales)
        // getFixtures ya consulta Firestore primero, luego API si es necesario
        const fixtures = await this.firestoreService.getFixtures(
          date,
          date,
          leagueId
        );

        for (const match of fixtures) {
          // Solo enriquecer si no tiene todos los detalles
          const needsEnrichment =
            [
              "FT",
              "AET",
              "PEN",
              "AWD",
              "WO",
              "1H",
              "2H",
              "LIVE",
              "ET",
              "P",
              "HT",
            ].includes(match.fixture.status.short) &&
            (!match.statistics || !match.events || !match.lineups);

          if (needsEnrichment) {
            // Queue enrichment job (enriquece stats, events, lineups juntos)
            const enrichmentJobId = `enrich_${match.fixture.id}`;
            if (!this.syncQueue.find(job => job.id === enrichmentJobId)) {
              this.syncQueue.push({
                id: enrichmentJobId,
                type: "fixtures", // Usamos fixtures para indicar que es un match completo
                status: "pending",
                createdAt: Date.now(),
                metadata: { match, action: "enrich" },
              });
              // Actualizar totalJobs cuando se agregan nuevos jobs
              this.stats.totalJobs += 1;
              // Actualizar totalJobs cuando se agregan nuevos jobs
              this.stats.totalJobs = Math.max(
                this.stats.totalJobs,
                this.syncQueue.length
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `Error queuing detailed data for league ${leagueId}:`,
          error
        );
      }
    }

    // console.log(
    //   `📊 QUEUED: Detailed data enrichment for ${date} (${enrichmentJobsCreated} enrichment jobs)`
    // );
  }

  /**
   * Queue live matches for high-priority sync
   */
  private async queueLiveMatchesSync(): Promise<void> {
    const today = format(new Date(), "yyyy-MM-dd");

    for (const leagueId of this.defaultLeagues) {
      try {
        // Obtener matches desde Firestore (incluye matches en vivo)
        const fixtures = await this.firestoreService.getFixtures(
          today,
          today,
          leagueId
        );
        const liveMatches = fixtures.filter(match =>
          ["1H", "2H", "LIVE", "ET", "P", "HT"].includes(
            match.fixture.status.short
          )
        );

        for (const match of liveMatches) {
          // High priority enrichment for live matches
          const enrichmentJobId = `live_enrich_${match.fixture.id}`;

          // Remove existing jobs and add high priority one
          const jobsRemoved = this.syncQueue.filter(
            job =>
              job.id === `enrich_${match.fixture.id}` ||
              job.id === `live_enrich_${match.fixture.id}`
          ).length;

          this.syncQueue = this.syncQueue.filter(
            job =>
              job.id !== `enrich_${match.fixture.id}` &&
              job.id !== `live_enrich_${match.fixture.id}`
          );

          this.syncQueue.unshift({
            // Add to front of queue (high priority)
            id: enrichmentJobId,
            type: "fixtures",
            status: "pending",
            createdAt: Date.now(),
            metadata: { match, action: "enrich", priority: "high" },
          });

          // Actualizar totalJobs cuando se agregan nuevos jobs (solo si se agregó uno nuevo)
          if (jobsRemoved === 0) {
            this.stats.totalJobs += 1;
          }
        }

        if (liveMatches.length > 0) {
          // console.log(
          //   `🔴 PRIORITIZED: ${liveMatches.length} live matches from league ${leagueId}`
          // );
        }
      } catch (error) {
        console.error(
          `Error queuing live matches for league ${leagueId}:`,
          error
        );
      }
    }
  }

  /**
   * Process the sync queue - RESPECTS RATE LIMITS
   */
  private async processQueue(): Promise<void> {
    if (this.isRunning) {
      // console.log("⏸️ SYNC: Queue already processing");
      return;
    }

    // Verificar y resetear API calls si es un nuevo día
    this.checkAndResetApiCalls();

    this.isRunning = true;
    // console.log(
    //   `⚡ SYNC: Processing ${this.syncQueue.length} jobs (Rate limit: 10/min)`
    // );

    let jobsProcessed = 0;
    const startTime = Date.now();

    try {
      const pendingJobs = this.syncQueue.filter(
        job => job.status === "pending"
      );

      // Respect rate limit: maximum 10 requests per minute
      const maxRequestsPerMinute = 10;
      const delayBetweenRequests = (60 * 100) / maxRequestsPerMinute; // 6 seconds

      for (const job of pendingJobs) {
        // Verificar y resetear API calls si es un nuevo día (durante el procesamiento)
        this.checkAndResetApiCalls();

        // Check if we should abort due to high API usage
        const apiUsagePercent = (this.stats.apiCallsToday / 7500) * 100;
        if (apiUsagePercent > 90) {
          // console.log(
          //   `🛑 SYNC: Stopping due to high API usage (${apiUsagePercent.toFixed(1)}%)`
          // );
          break;
        }

        await this.processJob(job);
        jobsProcessed++;

        // Limpiar jobs completados inmediatamente después de procesarlos
        // Esto asegura que la cola se actualice correctamente
        this.updateStats();

        // Wait between requests to respect rate limit (except for last job)
        if (jobsProcessed < pendingJobs.length) {
          // console.log(
          //   `⏳ SYNC: Waiting ${delayBetweenRequests}ms for rate limit...`
          // );
          await new Promise(resolve =>
            setTimeout(resolve, delayBetweenRequests)
          );
        }
      }

      // Limpieza final
      this.updateStats();

      const totalTime = Date.now() - startTime;
      console.log(
        `✅ SYNC: Queue processing complete (${jobsProcessed}/${pendingJobs.length} successful) in ${totalTime}ms`
      );
    } finally {
      this.isRunning = false;
      // Actualizar lastSyncTime cuando se completa el procesamiento (incluso si hay errores)
      if (jobsProcessed > 0) {
        this.stats.lastSyncTime = Date.now();
      }
    }
  }

  /**
   * Process individual sync job
   * Usa FirestoreFootballService para guardar en colecciones estructuradas
   */
  private async processJob(job: SyncJob): Promise<void> {
    const startTime = Date.now();
    job.status = "running";
    job.startedAt = startTime;

    // Resetear contador de API calls antes de procesar el job
    // para contar solo las llamadas realizadas durante este job
    this.api.resetApiCallCount();

    try {
      // console.log(`🔄 SYNC JOB: ${job.type} - ${job.id}`);

      let matches: Match[] = [];

      switch (job.type) {
        case "fixtures":
          if (job.metadata.action === "enrich") {
            // Enriquecer un match existente con detalles
            const match = job.metadata.match as Match;
            const enrichedMatches =
              await this.firestoreService.enrichMatchesWithDetails([match]);
            matches = enrichedMatches;
            // Guardar matches enriquecidos en Firestore
            if (enrichedMatches.length > 0) {
              await this.firestoreService.saveMatchesToFirestore(
                enrichedMatches
              );
            }
          } else {
            // Sincronizar fixtures para una fecha y liga
            const { date, leagueId } = job.metadata;
            // getFixtures ya consulta Firestore, API si es necesario, enriquece y guarda
            matches = await this.firestoreService.getFixtures(
              date as string,
              date as string,
              leagueId as number
            );
          }
          break;

        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.status = "completed";
      job.completedAt = Date.now();

      // Contar solo las llamadas reales a la API externa (no cuando se usa Firestore)
      // Usar el contador global para obtener todas las llamadas (incluso de otras instancias)
      const globalApiCalls = this.api.getGlobalApiCallCount();
      const previousApiCalls = this.stats.apiCallsToday;

      // Actualizar el contador con el valor global (se resetea automáticamente a las 00:00 UTC)
      // Siempre usar el máximo entre el local y el global para asegurar que no se pierdan llamadas
      this.stats.apiCallsToday = Math.max(
        this.stats.apiCallsToday,
        globalApiCalls
      );

      const apiCallsMade = this.stats.apiCallsToday - previousApiCalls;
      if (apiCallsMade > 0) {
        // console.log(
        //   `📡 API Calls made in this job: ${apiCallsMade} (Total today: ${this.stats.apiCallsToday})`
        // );
      }

      // Resetear el contador local del API para el próximo job (solo para esta instancia)
      this.api.resetApiCallCount();

      this.stats.dataItemsSynced += matches.length;

      // Actualizar contadores acumulados
      this.stats.completedJobs = (this.stats.completedJobs || 0) + 1;

      const duration = job.completedAt - startTime;
      console.log(
        `✅ SYNC JOB: ${job.id} completed in ${duration}ms (${matches.length} matches)`
      );
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      // console.error(`❌ SYNC JOB: ${job.id} failed:`, job.error);

      // Actualizar contador de fallidos
      this.stats.failedJobs = (this.stats.failedJobs || 0) + 1;
    }
  }

  // Nota: TTL ya no es necesario, Firestore mantiene los datos permanentemente
  // La lógica de cache se maneja en FirestoreFootballService.getFixtures()
  // que verifica si los datos existen antes de consultar la API externa

  /**
   * Update sync statistics
   * Nota: Los contadores acumulados (completedJobs, failedJobs) se actualizan
   * directamente en processJob() cuando se completa o falla un job.
   * Este método limpia jobs completados inmediatamente para que la cola se actualice correctamente.
   */
  private updateStats(): void {
    // Limpiar jobs completados y fallidos inmediatamente (no esperar 1 hora)
    // Esto asegura que la "Cola Actual" se actualice correctamente
    const beforeCleanup = this.syncQueue.length;
    this.syncQueue = this.syncQueue.filter(
      job => job.status === "pending" || job.status === "running"
      // Jobs completados/fallidos se eliminan inmediatamente
    );
    const afterCleanup = this.syncQueue.length;
    if (beforeCleanup !== afterCleanup) {
      // console.log(
      //   `🧹 Cleaned up ${beforeCleanup - afterCleanup} completed/failed jobs from queue`
      // );
    }
  }

  /**
   * Get sync statistics
   */
  getStats(): SyncStats & { queueLength: number; runningJobs: number } {
    // Verificar y resetear API calls si es un nuevo día antes de devolver stats
    // Esto asegura que el contador siempre esté sincronizado con el global
    this.checkAndResetApiCalls();

    const runningJobs = this.syncQueue.filter(
      job => job.status === "running"
    ).length;

    // Devolver estadísticas con el contador sincronizado
    return {
      ...this.stats,
      queueLength: this.syncQueue.length,
      runningJobs,
    };
  }

  /**
   * Force sync specific data
   */
  async forceSync(
    type: "today" | "yesterday" | "tomorrow" | "live"
  ): Promise<void> {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

    switch (type) {
      case "today":
        await this.queueFixturesSync([today]);
        await this.queueDetailedDataSync(today);
        break;
      case "yesterday":
        await this.queueFixturesSync([yesterday]);
        await this.queueDetailedDataSync(yesterday);
        break;
      case "tomorrow":
        await this.queueFixturesSync([tomorrow]);
        break;
      case "live":
        await this.queueLiveMatchesSync();
        break;
    }

    await this.processQueue();
  }

  /**
   * Stop sync process
   */
  stop(): void {
    this.isRunning = false;
    this.syncQueue.forEach(job => {
      if (job.status === "running") {
        job.status = "failed";
        job.error = "Stopped by user";
      }
    });
    // console.log("⏹️ SYNC: Stopped by user");
  }

  /**
   * Clear sync queue
   */
  clearQueue(): void {
    const pendingCount = this.syncQueue.filter(
      job => job.status === "pending"
    ).length;
    this.syncQueue = this.syncQueue.filter(job => job.status === "running");
    console.log(`🗑️ SYNC: Cleared ${pendingCount} pending jobs`);
  }
}
