const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIVE_STATUSES = ["1H", "2H", "LIVE", "ET", "P", "HT"] as const;

export const FINISHED_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"] as const;

export type MatchStatus = string | undefined | null;

export function isLiveStatus(status: MatchStatus): boolean {
  if (!status) {
    return false;
  }
  return LIVE_STATUSES.includes(
    status.toUpperCase() as (typeof LIVE_STATUSES)[number]
  );
}

export function isFinishedStatus(status: MatchStatus): boolean {
  if (!status) {
    return false;
  }
  return FINISHED_STATUSES.includes(
    status.toUpperCase() as (typeof FINISHED_STATUSES)[number]
  );
}

function isSameUtcDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

function isPastUtcDay(date: Date, comparedTo: Date): boolean {
  const normalizedDate = new Date(date);
  normalizedDate.setUTCHours(0, 0, 0, 0);

  const normalizedCompare = new Date(comparedTo);
  normalizedCompare.setUTCHours(0, 0, 0, 0);

  return normalizedDate.getTime() < normalizedCompare.getTime();
}

/**
 * TTL for fixtures (core match data) based on PRELOAD_SYSTEM.md
 * Partidos históricos (más de 30 días) tienen TTL muy largo ya que los datos no cambian
 */
export function calculateFixtureTtlMs(
  matchDate: Date,
  status: MatchStatus,
  now: Date = new Date()
): number {
  if (isLiveStatus(status)) {
    return 5 * MINUTE;
  }

  if (matchDate.getTime() > now.getTime()) {
    // Future fixtures
    return 2 * HOUR;
  }

  if (isFinishedStatus(status) && isSameUtcDay(matchDate, now)) {
    // Finished today
    return 24 * HOUR;
  }

  if (isFinishedStatus(status) || isPastUtcDay(matchDate, now)) {
    // Calcular días desde el partido
    const daysSinceMatch = (now.getTime() - matchDate.getTime()) / DAY;
    
    // Partidos muy antiguos (más de 30 días) tienen TTL muy largo (1 año)
    // ya que los datos históricos no cambian
    if (daysSinceMatch > 30) {
      return 365 * DAY; // 1 año para partidos históricos
    }
    
    // Partidos terminados recientemente (últimos 30 días)
    return 30 * DAY;
  }

  // Default fallback
  return HOUR;
}

/**
 * TTL for stats/events (details)
 */
export function calculateDetailsTtlMs(status: MatchStatus): number {
  if (isLiveStatus(status)) {
    return 5 * MINUTE;
  }

  if (isFinishedStatus(status)) {
    return 24 * HOUR;
  }

  return HOUR;
}

/**
 * TTL for lineups (static data)
 */
export function calculateLineupsTtlMs(): number {
  return 30 * DAY;
}
