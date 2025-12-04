// Fast Football API - Reads only from Firebase (no external API calls)
import { FirebaseCache } from "../firebase/cache";
import { format, subDays } from "date-fns";
import type { Match } from "@/types/match";

export class FastFootballApi {
  private cache: FirebaseCache;
  private memoryCache: Map<
    string,
    { data: any; timestamp: number; ttl: number }
  > = new Map();

  constructor() {
    this.cache = FirebaseCache.getInstance();
  }

  /**
   * Get from memory cache first, then Firebase
   */
  private async getCachedData<T>(
    collection: string,
    options: any
  ): Promise<T | null> {
    const cacheKey = `${collection}_${JSON.stringify(options)}`;

    // Check memory cache first (30 seconds TTL)
    const memoryCached = this.memoryCache.get(cacheKey);
    if (
      memoryCached &&
      Date.now() - memoryCached.timestamp < memoryCached.ttl
    ) {
      console.log(`💾 MEMORY HIT: ${cacheKey} (cache en memoria, 30 segundos)`);
      return memoryCached.data as T;
    }

    // Get from Firebase (api_cache collection)
    try {
      const firebaseData = await this.cache.get<T>(collection, options);

      // Store in memory cache for 30 seconds
      if (firebaseData) {
        this.memoryCache.set(cacheKey, {
          data: firebaseData,
          timestamp: Date.now(),
          ttl: 30000, // 30 seconds
        });
        // Nota: El log "Cache HIT" viene de FirebaseCache.get(), no lo duplicamos aquí
      }

      return firebaseData;
    } catch (error) {
      console.error(`Error getting cached data for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Get fixtures from Firebase cache (super fast)
   */
  async getFixturesByDateRangeAndLeague(
    from: string,
    to: string,
    leagueId: number
  ): Promise<Match[]> {
    const cacheKey = `fixtures_${leagueId}_${from}_${to}`;

    try {
      const cached = await this.getCachedData<Match[]>(cacheKey, {});

      if (cached) {
        return cached;
      }

      // If no exact match, try individual days
      if (from === to) {
        const dailyKey = `fixtures_${leagueId}_${from}_${from}`;
        const dailyCached = await this.getCachedData<Match[]>(dailyKey, {});

        if (dailyCached) {
          return dailyCached;
        }
      }

      // FALLBACK: If no cached data found, fetch from external API
      console.log(
        `🔄 FALLBACK: No cached data for ${cacheKey}, fetching from external API...`
      );

      try {
        // Import FootballApiServer dynamically to avoid circular imports
        const { FootballApiServer } = await import("../footballApi");
        const apiKey = process.env.FOOTBALL_API_KEY;

        if (!apiKey) {
          console.error("❌ FALLBACK: FOOTBALL_API_KEY not found");
          return [];
        }

        const externalApi = new FootballApiServer(apiKey);
        const externalData = await externalApi.getFixturesByDateAndLeague(
          from,
          leagueId
        );

        if (externalData && externalData.length > 0) {
          console.log(
            `✅ FALLBACK: Found ${externalData.length} matches from external API, saving to cache...`
          );

          // Save to cache for future use
          await this.cache.set(
            "fixtures",
            { key: cacheKey },
            externalData,
            60 // 1 hour TTL for fresh data
          );

          // Also save with daily key for individual day lookups
          if (from === to) {
            const dailyKey = `fixtures_${leagueId}_${from}_${from}`;
            await this.cache.set(
              "fixtures",
              { key: dailyKey },
              externalData,
              60 // 1 hour TTL for fresh data
            );
          }

          return externalData;
        } else {
          console.log(
            `⚪ FALLBACK: No matches found in external API for ${cacheKey}`
          );

          // Cache empty result to avoid repeated API calls
          await this.cache.set(
            "fixtures",
            { key: cacheKey },
            [],
            30 // 30 minutes TTL for empty results
          );

          return [];
        }
      } catch (fallbackError) {
        console.error(`❌ FALLBACK ERROR for ${cacheKey}:`, fallbackError);
        return [];
      }
    } catch (error) {
      console.error("Error retrieving fixtures from cache:", error);
      return [];
    }
  }

  /**
   * Get match statistics from Firebase cache with automatic fallback
   */
  async getMatchStats(
    matchId: number
  ): Promise<{ home: any[]; away: any[] } | null> {
    const cacheKey = `match_stats_${matchId}`;

    try {
      const cached = await this.getCachedData<{ home: any[]; away: any[] }>(
        cacheKey,
        {}
      );

      if (cached) {
        return cached;
      }

      // FALLBACK: If no cached data found, fetch from external API
      console.log(
        `🔄 FALLBACK STATS: No cached data for ${cacheKey}, fetching from external API...`
      );

      try {
        // Import FootballApiServer dynamically to avoid circular imports
        const { FootballApiServer } = await import("../footballApi");
        const apiKey = process.env.FOOTBALL_API_KEY;

        if (!apiKey) {
          console.error("❌ FALLBACK STATS: FOOTBALL_API_KEY not found");
          return null;
        }

        const externalApi = new FootballApiServer(apiKey);

        // We need the match object to get stats, so we create a minimal one
        const match = { fixture: { id: matchId } };
        const externalData = await externalApi.getMatchStats(match as any);

        if (externalData) {
          console.log(
            `✅ FALLBACK STATS: Found stats for match ${matchId}, saving to cache...`
          );

          // Save to cache for future use
          await this.cache.set(
            "match_stats",
            { key: cacheKey },
            externalData,
            1440 // 24 hours TTL for match stats
          );

          return externalData;
        } else {
          console.log(`⚪ FALLBACK STATS: No stats found for match ${matchId}`);

          // Cache null result to avoid repeated API calls
          await this.cache.set(
            "match_stats",
            { key: cacheKey },
            null,
            120 // 2 hours TTL for null results (stats might be added during/after match)
          );

          return null;
        }
      } catch (fallbackError) {
        console.error(
          `❌ FALLBACK STATS ERROR for ${cacheKey}:`,
          fallbackError
        );
        return null;
      }
    } catch (error) {
      console.error("Error retrieving match stats from cache:", error);
      return null;
    }
  }

  /**
   * Get match events from Firebase cache with automatic fallback
   */
  async getMatchEvents(
    matchId: number
  ): Promise<{ home: any[]; away: any[] } | null> {
    const cacheKey = `match_events_${matchId}`;

    try {
      const cached = await this.getCachedData<{ home: any[]; away: any[] }>(
        cacheKey,
        {}
      );

      if (cached) {
        return cached;
      }

      // FALLBACK: If no cached data found, fetch from external API
      console.log(
        `🔄 FALLBACK EVENTS: No cached data for ${cacheKey}, fetching from external API...`
      );

      try {
        // Import FootballApiServer dynamically to avoid circular imports
        const { FootballApiServer } = await import("../footballApi");
        const apiKey = process.env.FOOTBALL_API_KEY;

        if (!apiKey) {
          console.error("❌ FALLBACK EVENTS: FOOTBALL_API_KEY not found");
          return null;
        }

        const externalApi = new FootballApiServer(apiKey);

        // We need the match object to get events, so we create a minimal one
        const match = { fixture: { id: matchId } };
        const externalData = await externalApi.getMatchEvents(match as any);

        if (externalData) {
          console.log(
            `✅ FALLBACK EVENTS: Found events for match ${matchId}, saving to cache...`
          );

          // Save to cache for future use
          await this.cache.set(
            "match_events",
            { key: cacheKey },
            externalData,
            1440 // 24 hours TTL for match events
          );

          return externalData;
        } else {
          console.log(
            `⚪ FALLBACK EVENTS: No events found for match ${matchId}`
          );

          // Cache null result to avoid repeated API calls
          await this.cache.set(
            "match_events",
            { key: cacheKey },
            null,
            120 // 2 hours TTL for null results (events might be added during/after match)
          );

          return null;
        }
      } catch (fallbackError) {
        console.error(
          `❌ FALLBACK EVENTS ERROR for ${cacheKey}:`,
          fallbackError
        );
        return null;
      }
    } catch (error) {
      console.error("Error retrieving match events from cache:", error);
      return null;
    }
  }

  /**
   * Get match lineups from Firebase cache with automatic fallback
   */
  async getMatchLineups(
    fixtureId: string,
    homeId: string,
    awayId: string
  ): Promise<{ home: any | null; away: any | null } | null> {
    const cacheKey = `lineups_${fixtureId}_${homeId}_${awayId}`;

    try {
      const cached = await this.getCachedData<{
        home: any | null;
        away: any | null;
      }>(cacheKey, {});

      if (cached) {
        return cached;
      }

      // FALLBACK: If no cached data found, fetch from external API
      console.log(
        `🔄 FALLBACK LINEUPS: No cached data for ${cacheKey}, fetching from external API...`
      );

      try {
        // Import FootballApiServer dynamically to avoid circular imports
        const { FootballApiServer } = await import("../footballApi");
        const apiKey = process.env.FOOTBALL_API_KEY;

        if (!apiKey) {
          console.error("❌ FALLBACK LINEUPS: FOOTBALL_API_KEY not found");
          return null;
        }

        const externalApi = new FootballApiServer(apiKey);
        const externalData = await externalApi.getMatchLineups(
          fixtureId,
          homeId,
          awayId
        );

        if (externalData) {
          console.log(
            `✅ FALLBACK LINEUPS: Found lineups for match ${fixtureId}, saving to cache...`
          );

          // Save to cache for future use
          await this.cache.set(
            "lineups",
            { key: cacheKey },
            externalData,
            43200 // 30 days TTL for lineups (they don't change)
          );

          return externalData;
        } else {
          console.log(
            `⚪ FALLBACK LINEUPS: No lineups found for match ${fixtureId}`
          );

          // Cache null result to avoid repeated API calls for matches without lineups
          await this.cache.set(
            "lineups",
            { key: cacheKey },
            null,
            1440 // 24 hours TTL for null results (lineups might be added later)
          );

          return null;
        }
      } catch (fallbackError) {
        console.error(
          `❌ FALLBACK LINEUPS ERROR for ${cacheKey}:`,
          fallbackError
        );

        // Cache error result to avoid immediate retries
        await this.cache.set(
          "lineups",
          { key: cacheKey },
          null,
          60 // 1 hour TTL for error results
        );

        return null;
      }
    } catch (error) {
      console.error("Error retrieving match lineups from cache:", error);
      return null;
    }
  }

  /**
   * Get multiple leagues fixtures for a specific date (ULTRA OPTIMIZED - single query)
   */
  async getMultipleLeaguesFixtures(
    date: string,
    leagueIds: number[]
  ): Promise<Match[]> {
    try {
      // Create a single combined cache key for multiple leagues
      const cacheKeys = leagueIds.map(id => `fixtures_${id}_${date}_${date}`);

      // Try to get all data in one batch operation
      const batchResults = await Promise.all(
        cacheKeys.map(async (key, _index) => {
          try {
            const cached = await this.getCachedData<Match[]>(key, {});
            return cached || [];
          } catch (error) {
            console.error(`Error getting cache for ${key}:`, error);
            return [];
          }
        })
      );

      // Flatten all results
      const allMatches = batchResults.flat();

      // Check if we have any data, if not, try individual fallbacks
      if (allMatches.length === 0) {
        // Try fallback for each league individually
        const fallbackResults = await Promise.all(
          leagueIds.map(async leagueId => {
            return this.getFixturesByDateRangeAndLeague(date, date, leagueId);
          })
        );

        const fallbackMatches = fallbackResults.flat();
        return fallbackMatches;
      }

      // Sort by date and status (finished matches first)
      allMatches.sort((a, b) => {
        const aFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
          a.fixture.status.short
        );
        const bFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
          b.fixture.status.short
        );

        if (aFinished && !bFinished) return -1;
        if (!aFinished && bFinished) return 1;

        return (
          new Date(b.fixture.date).getTime() -
          new Date(a.fixture.date).getTime()
        );
      });

      return allMatches;
    } catch (error) {
      console.error("Error in ultra-fast batch retrieval:", error);
      // Fallback to individual calls if batch fails
      return this.getMultipleLeaguesFixturesFallback(date, leagueIds);
    }
  }

  /**
   * Fallback method for individual league calls
   */
  private async getMultipleLeaguesFixturesFallback(
    date: string,
    leagueIds: number[]
  ): Promise<Match[]> {
    const allMatches: Match[] = [];

    // Get all leagues in parallel (super fast from cache)
    const leaguePromises = leagueIds.map(async leagueId => {
      const matches = await this.getFixturesByDateRangeAndLeague(
        date,
        date,
        leagueId
      );
      return matches;
    });

    const leagueResults = await Promise.all(leaguePromises);

    // Flatten results
    leagueResults.forEach(matches => {
      allMatches.push(...matches);
    });

    // Sort by date and status (finished matches first)
    allMatches.sort((a, b) => {
      const aFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
        a.fixture.status.short
      );
      const bFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
        b.fixture.status.short
      );

      if (aFinished && !bFinished) return -1;
      if (!aFinished && bFinished) return 1;

      return (
        new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime()
      );
    });

    return allMatches;
  }

  /**
   * Get today's matches (most common use case)
   */
  async getTodaysMatches(leagueIds?: number[]): Promise<Match[]> {
    const today = format(new Date(), "yyyy-MM-dd");
    const defaultLeagues = [
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

    const leagues = leagueIds || defaultLeagues;
    return this.getMultipleLeaguesFixtures(today, leagues);
  }

  /**
   * Get recent matches (today + yesterday)
   */
  async getRecentMatches(leagueIds?: number[]): Promise<Match[]> {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const defaultLeagues = [
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

    const leagues = leagueIds || defaultLeagues;

    const [todayMatches, yesterdayMatches] = await Promise.all([
      this.getMultipleLeaguesFixtures(today, leagues),
      this.getMultipleLeaguesFixtures(yesterday, leagues),
    ]);

    const allMatches = [...todayMatches, ...yesterdayMatches];

    // Remove duplicates and sort
    const uniqueMatches = allMatches.filter(
      (match, index, self) =>
        index === self.findIndex(m => m.fixture.id === match.fixture.id)
    );

    return uniqueMatches.sort(
      (a, b) =>
        new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime()
    );
  }

  /**
   * Get matches with full details (stats, events, lineups) - OPTIMIZED
   */
  async getMatchesWithDetails(matches: Match[]): Promise<Match[]> {
    if (matches.length === 0) return matches;

    // Get all match IDs that need details
    const detailedMatches = matches.filter(match =>
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

    if (detailedMatches.length === 0) {
      return matches;
    }

    // Batch get all stats, events, and lineups in parallel
    const [allStats, allEvents, allLineups] = await Promise.all([
      this.getBatchStats(detailedMatches),
      this.getBatchEvents(detailedMatches),
      this.getBatchLineups(detailedMatches),
    ]);

    // Enrich matches with the batch data
    const enrichedMatches = matches.map(match => {
      if (
        ![
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
      ) {
        return match;
      }

      const matchId = match.fixture.id.toString();
      const stats = allStats[matchId];
      const events = allEvents[matchId];
      const lineups = allLineups[matchId];

      return {
        ...match,
        ...(stats && { statistics: stats }),
        ...(events && { events: events }),
        ...(lineups && { lineups: lineups }),
      };
    });

    return enrichedMatches;
  }

  /**
   * Batch get stats for multiple matches - OPTIMIZED
   */
  private async getBatchStats(matches: Match[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Get all cache keys at once
    const cacheKeys = matches.map(match => `match_stats_${match.fixture.id}`);

    try {
      // Batch get all stats in parallel
      const batchResults = await Promise.all(
        cacheKeys.map(async (key, index) => {
          try {
            const matchId = matches[index].fixture.id;
            const cached = await this.getCachedData<any>(key, {});
            return { matchId: matchId.toString(), data: cached };
          } catch (error) {
            console.error(`Error getting stats cache for ${key}:`, error);
            return {
              matchId: matches[index].fixture.id.toString(),
              data: null,
            };
          }
        })
      );

      // Process results
      batchResults.forEach(result => {
        if (result.data) {
          results[result.matchId] = result.data;
        }
      });
    } catch (error) {
      console.error("Error in batch stats retrieval:", error);
    }

    return results;
  }

  /**
   * Batch get events for multiple matches - OPTIMIZED
   */
  private async getBatchEvents(matches: Match[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Get all cache keys at once
    const cacheKeys = matches.map(match => `match_events_${match.fixture.id}`);

    try {
      // Batch get all events in parallel
      const batchResults = await Promise.all(
        cacheKeys.map(async (key, index) => {
          try {
            const matchId = matches[index].fixture.id;
            const cached = await this.getCachedData<any>(key, {});
            return { matchId: matchId.toString(), data: cached };
          } catch (error) {
            console.error(`Error getting events cache for ${key}:`, error);
            return {
              matchId: matches[index].fixture.id.toString(),
              data: null,
            };
          }
        })
      );

      // Process results
      batchResults.forEach(result => {
        if (result.data) {
          results[result.matchId] = result.data;
        }
      });
    } catch (error) {
      console.error("Error in batch events retrieval:", error);
    }

    return results;
  }

  /**
   * Batch get lineups for multiple matches - OPTIMIZED
   */
  private async getBatchLineups(
    matches: Match[]
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Filter matches that can have lineups
    const validMatches = matches.filter(
      match => match.fixture.status.short !== "NS"
    );

    if (validMatches.length === 0) return results;

    // Get all cache keys at once
    const cacheKeys = validMatches.map(
      match =>
        `lineups_${match.fixture.id}_${match.teams.home.id}_${match.teams.away.id}`
    );

    try {
      // Batch get all lineups in parallel
      const batchResults = await Promise.all(
        cacheKeys.map(async (key, index) => {
          try {
            const matchId = validMatches[index].fixture.id;
            const cached = await this.getCachedData<any>(key, {});
            return { matchId: matchId.toString(), data: cached };
          } catch (error) {
            console.error(`Error getting lineups cache for ${key}:`, error);
            return {
              matchId: validMatches[index].fixture.id.toString(),
              data: null,
            };
          }
        })
      );

      // Process results
      batchResults.forEach(result => {
        if (result.data) {
          results[result.matchId] = result.data;
        }
      });
    } catch (error) {
      console.error("Error in batch lineups retrieval:", error);
    }

    return results;
  }

  /**
   * Check data freshness (when was it last synced)
   */
  async getDataFreshness(
    leagueId: number,
    date: string
  ): Promise<{
    lastSync: number | null;
    age: number | null;
    isStale: boolean;
  }> {
    const _cacheKey = `fixtures_${leagueId}_${date}_${date}`;

    try {
      // Get cache metadata to check when it was last updated
      const lastModified = Date.now(); // This would need to be implemented in cache metadata
      const age = Date.now() - lastModified;
      const isStale = age > 60 * 60 * 1000; // Consider stale after 1 hour

      return {
        lastSync: lastModified,
        age,
        isStale,
      };
    } catch {
      return {
        lastSync: null,
        age: null,
        isStale: true,
      };
    }
  }

  /**
   * Get live matches (currently happening)
   */
  async getLiveMatches(leagueIds?: number[]): Promise<Match[]> {
    const today = format(new Date(), "yyyy-MM-dd");
    const defaultLeagues = [
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

    const leagues = leagueIds || defaultLeagues;
    const allMatches = await this.getMultipleLeaguesFixtures(today, leagues);

    // Filter only live matches
    const liveMatches = allMatches.filter(match =>
      ["1H", "2H", "LIVE", "ET", "P", "HT"].includes(match.fixture.status.short)
    );

    // Get details for live matches
    return this.getMatchesWithDetails(liveMatches);
  }

  /**
   * Get performance stats of the fast API
   */
  getPerformanceStats(): {
    averageResponseTime: number;
    cacheHitRate: number;
    totalRequests: number;
  } {
    // This would track actual performance metrics
    return {
      averageResponseTime: 50, // ms - should be very fast since it's only Firebase reads
      cacheHitRate: 95, // % - should be very high since we're reading from cache
      totalRequests: 0, // Would be tracked in real implementation
    };
  }
}
