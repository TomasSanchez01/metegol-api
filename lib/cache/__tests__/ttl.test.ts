import {
  calculateDetailsTtlMs,
  calculateFixtureTtlMs,
  calculateLineupsTtlMs,
  isFinishedStatus,
  isLiveStatus,
} from "@/lib/cache/ttl";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("TTL helpers", () => {
  const now = new Date("2025-11-19T12:00:00.000Z");

  describe("isLiveStatus / isFinishedStatus", () => {
    it("detects live statuses", () => {
      expect(isLiveStatus("1H")).toBe(true);
      expect(isLiveStatus("live")).toBe(true);
      expect(isLiveStatus("FT")).toBe(false);
    });

    it("detects finished statuses", () => {
      expect(isFinishedStatus("FT")).toBe(true);
      expect(isFinishedStatus("pen")).toBe(true);
      expect(isFinishedStatus("NS")).toBe(false);
    });
  });

  describe("calculateFixtureTtlMs", () => {
    it("returns 5 minutes for live matches", () => {
      const ttl = calculateFixtureTtlMs(now, "LIVE", now);
      expect(ttl).toBe(5 * MINUTE);
    });

    it("returns 2 hours for future matches", () => {
      const futureDate = new Date("2025-11-20T15:00:00.000Z");
      const ttl = calculateFixtureTtlMs(futureDate, "NS", now);
      expect(ttl).toBe(2 * HOUR);
    });

    it("returns 24 hours for matches finished today", () => {
      const matchDate = new Date("2025-11-19T03:00:00.000Z");
      const ttl = calculateFixtureTtlMs(matchDate, "FT", now);
      expect(ttl).toBe(24 * HOUR);
    });

    it("returns 30 days for matches finished in the past", () => {
      const matchDate = new Date("2025-11-10T15:00:00.000Z");
      const ttl = calculateFixtureTtlMs(matchDate, "FT", now);
      expect(ttl).toBe(30 * DAY);
    });

    it("falls back to 1 hour when no rule matches", () => {
      const pastDate = new Date("2025-11-19T08:00:00.000Z");
      const ttl = calculateFixtureTtlMs(pastDate, "NS", now);
      expect(ttl).toBe(HOUR);
    });
  });

  describe("calculateDetailsTtlMs", () => {
    it("returns 5 minutes for live stats", () => {
      expect(calculateDetailsTtlMs("LIVE")).toBe(5 * MINUTE);
    });

    it("returns 24 hours for finished stats", () => {
      expect(calculateDetailsTtlMs("FT")).toBe(24 * HOUR);
    });

    it("returns 1 hour for default", () => {
      expect(calculateDetailsTtlMs("NS")).toBe(HOUR);
    });
  });

  describe("calculateLineupsTtlMs", () => {
    it("always returns 30 days", () => {
      expect(calculateLineupsTtlMs()).toBe(30 * DAY);
    });
  });
});
