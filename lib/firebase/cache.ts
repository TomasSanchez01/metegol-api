/* eslint-disable @typescript-eslint/no-explicit-any */
// Simplified Firebase cache service
import { adminDb } from "./config";
import type { Match } from "@/types/match";

interface CacheDocument {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  key: string;
  lastModified?: number; // For incremental updates
  dataHash?: string; // To detect changes
}

// interface ChangeDetectionMeta {
//   lastCheck: number;
//   changedItems: string[];
// }

export class FirebaseCache {
  private static instance: FirebaseCache;
  private readonly collectionName = "api_cache";
  private readonly changesCollectionName = "cache_changes";

  static getInstance(): FirebaseCache {
    if (!FirebaseCache.instance) {
      FirebaseCache.instance = new FirebaseCache();
    }
    return FirebaseCache.instance;
  }

  private generateCacheKey(collection: string, params: any): string {
    const baseKey = `${collection}_${JSON.stringify(params)}`;
    return baseKey
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .substring(0, 100);
  }

  async get<T>(collection: string, params: any): Promise<T | null> {
    try {
      const key = this.generateCacheKey(collection, params);
      const doc = await adminDb.collection(this.collectionName).doc(key).get();

      if (!doc.exists) {
        return null;
      }

      const cacheDoc = doc.data() as CacheDocument;

      // Check if cache has expired
      if (Date.now() > cacheDoc.timestamp + cacheDoc.ttl) {
        console.log(`⏰ Cache EXPIRED for ${key}`);
        return null;
      }

      console.log(
        `✅ Cache HIT for ${key} (api_cache collection en Firestore)`
      );
      return cacheDoc.data as T;
    } catch (error) {
      console.error(`❌ Cache GET error for ${collection}:`, error);
      return null;
    }
  }

  async set<T>(
    collection: string,
    params: any,
    data: T,
    ttlMinutes: number = 60
  ): Promise<void> {
    try {
      const key = this.generateCacheKey(collection, params);
      const ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds

      const cacheDoc: CacheDocument = {
        data: data,
        timestamp: Date.now(),
        ttl: ttl,
        key: key,
        lastModified: Date.now(),
      };

      await adminDb.collection(this.collectionName).doc(key).set(cacheDoc);

      console.log(`💾 Cache SET for ${key} (TTL: ${ttlMinutes}m)`);
    } catch (error) {
      console.error(`❌ Cache SET error for ${collection}:`, error);
    }
  }

  async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    sizeBytes: number;
  }> {
    try {
      const snapshot = await adminDb.collection(this.collectionName).get();
      let totalEntries = 0;
      let expiredEntries = 0;
      let sizeBytes = 0;

      snapshot.forEach(doc => {
        totalEntries++;
        const data = doc.data() as CacheDocument;

        // Estimate size
        sizeBytes += JSON.stringify(data).length;

        // Check if expired
        if (Date.now() > data.timestamp + data.ttl) {
          expiredEntries++;
        }
      });

      return {
        totalEntries,
        expiredEntries,
        sizeBytes,
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      return { totalEntries: 0, expiredEntries: 0, sizeBytes: 0 };
    }
  }

  async cleanup(): Promise<void> {
    try {
      console.log("🧹 Starting cache cleanup...");
      const snapshot = await adminDb.collection(this.collectionName).get();
      const batch = adminDb.batch();
      let deletedCount = 0;

      snapshot.forEach(doc => {
        const data = doc.data() as CacheDocument;
        if (Date.now() > data.timestamp + data.ttl) {
          batch.delete(doc.ref);
          deletedCount++;
        }
      });

      await batch.commit();
      console.log(`🧹 Cleaned up ${deletedCount} expired cache entries`);
    } catch (error) {
      console.error("Error during cache cleanup:", error);
    }
  }
}

// TTL constants (in minutes)
export const CACHE_TTL = {
  // Live matches - very short TTL
  LIVE_FIXTURES: 2,

  // Future matches - moderate TTL
  FUTURE_FIXTURES: 120, // 2 hours

  // Past matches - long TTL
  PAST_FIXTURES: 1440, // 24 hours

  // Static data - very long TTL
  TEAMS: 10080, // 1 week
  LEAGUES: 10080, // 1 week
  LINEUPS: 43200, // 30 days

  // Match details based on status
  LIVE_STATS: 2,
  LIVE_EVENTS: 2,
  FINISHED_STATS: 1440, // 24 hours
  FINISHED_EVENTS: 1440, // 24 hours
} as const;

/**
 * Calculate dynamic TTL based on match status and date
 */
export function calculateDynamicTTL(matches: Match[]): number {
  if (!matches.length) return CACHE_TTL.FUTURE_FIXTURES;

  const now = new Date();
  const hasLiveMatches = matches.some(
    match =>
      match.fixture?.status?.short === "1H" ||
      match.fixture?.status?.short === "2H" ||
      match.fixture?.status?.short === "HT"
  );

  if (hasLiveMatches) {
    return CACHE_TTL.LIVE_FIXTURES;
  }

  // Check if matches are in the past
  const allPast = matches.every(match => {
    if (!match.fixture?.date) return false;
    const matchDate = new Date(match.fixture.date);
    return matchDate < now;
  });

  if (allPast) {
    return CACHE_TTL.PAST_FIXTURES;
  }

  return CACHE_TTL.FUTURE_FIXTURES;
}
