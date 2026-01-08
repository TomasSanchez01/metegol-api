/* eslint-disable @typescript-eslint/no-explicit-any */
// Background Sync - Simplified wrapper around DataSyncer for preloading
import { DataSyncer } from "./DataSyncer";
import { FirebaseCache } from "../firebase/cache";
// import { format } from "date-fns";
import type { Match } from "@/types/match";

export class BackgroundSync {
  private dataSyncer: DataSyncer;
  private cache: FirebaseCache;

  constructor() {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      throw new Error("FOOTBALL_API_KEY environment variable is required");
    }

    this.dataSyncer = new DataSyncer(apiKey);
    this.cache = FirebaseCache.getInstance();
  }

  /**
   * Sync fixtures for specific league and date range
   */
  async syncFixtures(
    leagueId: number,
    fromDate: string,
    toDate: string
  ): Promise<void> {
    try {
      console.log(
        `🔄 BACKGROUND SYNC: Syncing league ${leagueId} from ${fromDate} to ${toDate}`
      );

      // Use the DataSyncer to queue and process the sync
      await this.dataSyncer.forceSync("today"); // This will be enhanced below

      // For now, we'll implement a direct sync approach
      const cacheKey = `fixtures_${leagueId}_${fromDate}_${toDate}`;

      // Check if data already exists and is fresh
      const existingData = await this.cache.get<Match[]>(cacheKey, {});
      if (existingData && existingData.length > 0) {
        // Check if data is still fresh (less than 1 hour old for future dates)
        const isFutureDate = new Date(fromDate) > new Date();
        const shouldSkip = isFutureDate; // Skip if it's future data and we already have it

        if (shouldSkip) {
          console.log(
            `⏭️ BACKGROUND SYNC: Skipping ${cacheKey} (data already exists)`
          );
          return;
        }
      }

      // Import FootballApiServer to fetch new data
      const { FootballApiServer } = await import("../footballApi");
      const api = new FootballApiServer(process.env.FOOTBALL_API_KEY!);

      // Fetch fixtures
      const fixtures = await api.getFixturesByDateRangeAndLeague(
        fromDate,
        toDate,
        leagueId
      );

      // Calculate appropriate TTL
      const ttl = this.calculateTTL(fixtures);

      // Store in cache with the same format FastFootballApi expects
      await this.cache.set(
        cacheKey, // Use cacheKey directly as collection name
        {},
        fixtures,
        ttl
      );

      console.log(
        `✅ BACKGROUND SYNC: Synced ${fixtures.length} fixtures for ${cacheKey}`
      );

      // For finished or live matches, also sync detailed data
      const detailedMatches = fixtures.filter(match =>
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
        ].includes(match.fixture.status.short)
      );

      if (detailedMatches.length > 0) {
        console.log(
          `📊 BACKGROUND SYNC: Syncing details for ${detailedMatches.length} matches`
        );
        await this.syncMatchDetails(api, detailedMatches);
      }
    } catch (error) {
      console.error(
        `❌ BACKGROUND SYNC: Failed to sync ${leagueId} ${fromDate}-${toDate}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if we have fixtures data for a specific league and date
   */
  async hasFixturesData(leagueId: number, date: string): Promise<boolean> {
    try {
      const cacheKey = `fixtures_${leagueId}_${date}_${date}`;
      const data = await this.cache.get<Match[]>(cacheKey, {});

      return data !== null && Array.isArray(data);
    } catch (error) {
      console.error(
        `Error checking fixtures data for ${leagueId} ${date}:`,
        error
      );
      return false;
    }
  }

  /**
   * Sync detailed match data (stats, events, lineups)
   */
  private async syncMatchDetails(api: any, matches: Match[]): Promise<void> {
    const delay = (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));

    for (const match of matches) {
      try {
        // Sync stats
        const stats = await api.getMatchStats(match);
        const statsKey = `match_stats_${match.fixture.id}`;
        await this.cache.set(
          "synced_data",
          { key: statsKey },
          stats,
          this.calculateDetailsTTL(match)
        );

        // Small delay to respect rate limits
        await delay(100);

        // Sync events
        const events = await api.getMatchEvents(match);
        const eventsKey = `match_events_${match.fixture.id}`;
        await this.cache.set(
          "synced_data",
          { key: eventsKey },
          events,
          this.calculateDetailsTTL(match)
        );

        // Small delay to respect rate limits
        await delay(100);

        // Sync lineups for finished matches
        if (
          ["FT", "AET", "PEN", "AWD", "WO"].includes(match.fixture.status.short)
        ) {
          const lineups = await api.getMatchLineups(
            match.fixture.id.toString(),
            match.teams.home.id.toString(),
            match.teams.away.id.toString()
          );
          const lineupsKey = `lineups_${match.fixture.id}_${match.teams.home.id}_${match.teams.away.id}`;
          await this.cache.set(
            "synced_data",
            { key: lineupsKey },
            lineups,
            43200
          ); // 30 days for lineups

          // Small delay to respect rate limits
          await delay(100);
        }

        console.log(
          `📊 BACKGROUND SYNC: Synced details for match ${match.fixture.id}`
        );
      } catch (error) {
        console.warn(
          `⚠️ BACKGROUND SYNC: Failed to sync details for match ${match.fixture.id}:`,
          error
        );
        // Continue with other matches even if one fails
      }
    }
  }

  /**
   * Calculate TTL for fixtures based on match dates and status
   */
  private calculateTTL(matches: Match[]): number {
    if (!matches || matches.length === 0) return 3600; // 1 hour default

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasFinishedMatches = matches.some(match =>
      ["FT", "AET", "PEN", "AWD", "WO"].includes(match.fixture.status.short)
    );

    const hasLiveMatches = matches.some(match =>
      ["1H", "2H", "LIVE", "ET", "P", "HT"].includes(match.fixture.status.short)
    );

    const hasFutureMatches = matches.some(match => {
      const matchDate = new Date(match.fixture.date);
      return matchDate > now && match.fixture.status.short === "NS";
    });

    const hasPastMatches = matches.some(match => {
      const matchDate = new Date(match.fixture.date);
      matchDate.setHours(0, 0, 0, 0);
      return (
        matchDate < today &&
        ["FT", "AET", "PEN", "AWD", "WO"].includes(match.fixture.status.short)
      );
    });

    // Past finished matches - long cache (30 days)
    if (hasPastMatches) return 2592000; // 30 days

    // Today's finished matches - medium cache (24 hours)
    if (hasFinishedMatches && !hasLiveMatches) return 86400; // 24 hours

    // Live matches - short cache (5 minutes)
    if (hasLiveMatches) return 300; // 5 minutes

    // Future matches - medium cache (2 hours)
    if (hasFutureMatches) return 7200; // 2 hours

    // Default - 1 hour
    return 3600;
  }

  /**
   * Calculate TTL for match details (stats, events)
   */
  private calculateDetailsTTL(match: Match): number {
    const isLive = ["1H", "2H", "LIVE", "ET", "P", "HT"].includes(
      match.fixture.status.short
    );
    const isFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
      match.fixture.status.short
    );

    // Live matches - short cache
    if (isLive) return 300; // 5 minutes

    // Finished matches - long cache
    if (isFinished) return 86400; // 24 hours

    // Default
    return 3600; // 1 hour
  }

  /**
   * Get sync statistics from the underlying DataSyncer
   */
  getStats() {
    return this.dataSyncer.getStats();
  }

  /**
   * Force sync using the underlying DataSyncer
   */
  async forceSync(type: "today" | "yesterday" | "tomorrow" | "live") {
    return this.dataSyncer.forceSync(type);
  }
}
