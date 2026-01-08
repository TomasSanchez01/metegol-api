import { apiCall } from "@/lib/utils";
import type {
  Match,
  Team,
  TeamMatchStats,
  League,
  TeamMatchEvents,
  LineupTeam,
} from "@/types/match";
import { EventsKeys } from "@/types/match";

export class FootballApi {
  private static baseUrl: string =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000");

  static async getMatches(date?: string, league?: number): Promise<Match[]> {
    // console.log(`🌐 FRONTEND: Using base URL: ${this.baseUrl}`);

    // Primero intentar carga normal
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (league) params.append("league", league.toString());

    const url =
      this.baseUrl + "/api/fixtures" + (params.toString() ? `?${params}` : "");
    const data = await apiCall<{ matches: Match[] }>(url, {
      cache: "no-store",
    });

    // Just return what we have from cache (no external API calls)

    return data.matches || [];
  }

  static async getMultipleLeaguesMatches(
    date?: string,
    leagues?: number[]
  ): Promise<Match[]> {
    // Primero intentar carga normal
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (leagues?.length) params.append("leagues", leagues.join(","));

    const url =
      this.baseUrl + "/api/fixtures" + (params.toString() ? `?${params}` : "");
    const data = await apiCall<{ matches: Match[] }>(url, {
      cache: "no-store",
    });

    // Just return what we have from cache (no external API calls)

    return data.matches || [];
  }

  static async getLeagues(): Promise<League[]> {
    const url = this.baseUrl + "/api/leagues";
    const data = await apiCall<{ leagues: League[] }>(url, {
      cache: "no-store",
    });
    return data.leagues || [];
  }

  static async getLeaguesByCountry(country: string): Promise<League[]> {
    const url =
      this.baseUrl + `/api/leagues?country=${encodeURIComponent(country)}`;
    const data = await apiCall<{ leagues: League[] }>(url, {
      cache: "no-store",
    });
    return data.leagues || [];
  }

  static async checkDataAvailability(
    date: string,
    leagues?: number[]
  ): Promise<{
    available: number;
    missing: number;
    needsLoading: boolean;
    matches: Match[];
  } | null> {
    try {
      const params = new URLSearchParams({ date });
      if (leagues?.length) {
        params.append("leagues", leagues.join(","));
      }

      const response = await fetch(
        `${this.baseUrl}/api/load-on-demand?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.availability : null;
    } catch (error) {
      // console.error("Error checking data availability:", error);
      return null;
    }
  }

  static async preloadData(
    days: number = 14,
    leagues?: number[]
  ): Promise<{ successful: number; total: number } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/preload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          days,
          leagues,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.stats : null;
    } catch (error) {
      // console.error("Error in preload:", error);
      return null;
    }
  }

  static async getPreloadStatus(): Promise<any | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/preload?action=status`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.status : null;
    } catch (error) {
      // console.error("Error getting preload status:", error);
      return null;
    }
  }

  static async getStandings(leagueId: number | string): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/standings?id=${leagueId}`;
      const data = await apiCall<any>(url, {
        cache: "no-store",
      });
      return data;
    } catch (error) {
      // console.error("Error fetching standings:", error);
      return null;
    }
  }
}

// Contador global compartido para todas las instancias de FootballApiServer
// Esto permite que las API calls se cuenten correctamente incluso cuando se usan diferentes instancias
let globalApiCallCount: number = 0;
let globalLastResetDate: string = "";

// Función para inicializar la fecha del último reset si no está establecida
function initializeResetDate(): void {
  if (!globalLastResetDate) {
    const now = new Date();
    globalLastResetDate = now.toISOString().split("T")[0]; // YYYY-MM-DD en UTC
    // console.log(
    // `📅 Initializing API calls counter for date: ${globalLastResetDate} (UTC)`
    // );
  }
}

export class FootballApiServer {
  private apiKey: string;
  private baseUrl: string = "https://v3.football.api-sports.io";
  private apiCallCount: number = 0; // Contador local para esta instancia

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Inicializar la fecha del último reset si es la primera vez
    initializeResetDate();
  }

  /**
   * Verificar y resetear el contador global si es un nuevo día (UTC)
   */
  private checkAndResetGlobalCounter(): void {
    const now = new Date();
    const todayUTC = now.toISOString().split("T")[0]; // YYYY-MM-DD en UTC

    // Inicializar si no está establecido (primera vez que se usa)
    if (!globalLastResetDate) {
      globalLastResetDate = todayUTC;
      // NO resetear el contador en la inicialización, solo establecer la fecha
      return;
    }

    // Si es un nuevo día, resetear el contador global
    if (globalLastResetDate !== todayUTC) {
      // console.log(
      //   `🔄 Resetting global API calls counter for new day: ${globalLastResetDate} -> ${todayUTC} (UTC)`
      // );
      globalApiCallCount = 0;
      globalLastResetDate = todayUTC;
    }
  }

  /**
   * Obtener el número de llamadas a la API externa realizadas por esta instancia
   */
  getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Obtener el número total de llamadas a la API externa (todas las instancias)
   */
  getGlobalApiCallCount(): number {
    this.checkAndResetGlobalCounter();
    return globalApiCallCount;
  }

  /**
   * Resetear el contador local de llamadas a la API (solo para esta instancia)
   */
  resetApiCallCount(): void {
    this.apiCallCount = 0;
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number> = {}
  ) {
    const url = new URL(this.baseUrl + endpoint);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.append(key, String(value))
    );

    // Verificar y resetear contador global si es un nuevo día
    this.checkAndResetGlobalCounter();

    // Incrementar contador local y global de llamadas a la API externa
    this.apiCallCount++;
    globalApiCallCount++;

    // Log the outgoing external API URL (helps trace which endpoint is being used)
    try {
      // console.log(`📡 FootballApiServer request -> ${url.toString()}`);
    } catch {
      // ignore logging errors
    }

    // Incrementar contador de API calls (solo para llamadas reales a la API externa)
    this.apiCallCount++;

    const res = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": this.apiKey,
        Accept: "application/json",
      },
    });

    const json = await res.json();
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return json.response as T;
  }

  async getMatchStats(
    match: Match
  ): Promise<{ home: TeamMatchStats; away: TeamMatchStats }> {
    try {
      const obj = await this.request<
        { team: { id: number }; statistics: TeamMatchStats }[]
      >("/fixtures/statistics", { fixture: match.fixture.id });

      const home =
        obj.find(x => x.team.id === match.teams.home.id)?.statistics ?? [];
      const away =
        obj.find(x => x.team.id === match.teams.away.id)?.statistics ?? [];

      return { home, away };
    } catch (error) {
      // console.error(
      //   `Error fetching team stats for match ${match.fixture.id}:`,
      //   error
      // );
      return { home: [], away: [] };
    }
  }

  async getMatchLineups(
    fixtureId: string,
    homeId: string,
    awayId: string
  ): Promise<{ home: LineupTeam | null; away: LineupTeam | null }> {
    try {
      const obj = await this.request<LineupTeam[]>("/fixtures/lineups", {
        fixture: fixtureId,
      });

      const home = obj.find(x => x.team.id === +homeId) ?? null;
      const away = obj.find(x => x.team.id === +awayId) ?? null;

      return { home, away };
    } catch (error) {
      // console.error(`Error fetching lineups for match ${fixtureId}:`, error);
      return { home: null, away: null };
    }
  }

  async getMatchEvents(
    match: Match
  ): Promise<{ home: TeamMatchEvents; away: TeamMatchEvents }> {
    try {
      const events = await this.request<
        Array<{
          type: string;
          time: { elapsed: number; extra: number | null };
          team: { id: number; name: string; logo: string };
          player: { id: number; name: string };
          assist: { id: number | null; name: string | null };
          detail: string;
          comments: string | null;
        }>
      >("/fixtures/events", { fixture: match.fixture.id });

      // Debug logging for problematic matches
      if (
        match.teams.home.name.includes("Kairat") ||
        match.teams.home.name.includes("Celtic") ||
        match.teams.away.name.includes("Kairat") ||
        match.teams.away.name.includes("Celtic")
      ) {
        // console.log(
        //   `EVENTS API DEBUG for ${match.teams.home.name} vs ${match.teams.away.name}:`,
        //   {
        //     fixtureId: match.fixture.id,
        //     totalEvents: events.length,
        //     homeTeamId: match.teams.home.id,
        //     awayTeamId: match.teams.away.id,
        //     allEvents: events.map(e => ({
        //       type: e.type,
        //       time: e.time.elapsed,
        //       teamId: e.team.id,
        //       teamName: e.team.name,
        //       player: e.player.name,
        //     })),
        //   }
        // );
      }

      const home = events
        .filter(x => x.team.id === match.teams.home.id)
        .map(event => ({
          ...event,
          type: event.type as EventsKeys,
        }));
      const away = events
        .filter(x => x.team.id === match.teams.away.id)
        .map(event => ({
          ...event,
          type: event.type as EventsKeys,
        }));

      return { home, away };
    } catch (error) {
      // console.error(
      //   `Error fetching events for match ${match.fixture.id}:`,
      //   error
      // );
      return { home: [], away: [] };
    }
  }

  async getTeamMatches(teamId: number, season: number): Promise<Match[]> {
    const match = await this.request<Match[]>("/fixtures", {
      team: teamId,
      season,
      league: 128,
    });
    return match ?? [];
  }

  async getTeamAllMatches(teamId: number, season: number): Promise<Match[]> {
    try {
      // Get matches from all leagues, not just Liga Profesional
      const matches = await this.request<Match[]>("/fixtures", {
        team: teamId,
        season,
        last: 50, // Get last 50 matches to show more data
      });

      return (matches ?? []).sort(
        (a, b) =>
          new Date(b.fixture.date).getTime() -
          new Date(a.fixture.date).getTime()
      );
    } catch (error) {
      // console.error(`Error fetching all matches for team ${teamId}:`, error);
      return [];
    }
  }

  async getFixturesByDateAndLeague(
    date: string,
    league: number
  ): Promise<Match[]> {
    const season = new Date(date).getFullYear();
    const fixtures = await this.request<Match[]>("/fixtures", {
      date,
      league,
      season,
    });

    return (fixtures ?? [])
      .sort(
        (a, b) =>
          new Date(b.fixture.date).getTime() -
          new Date(a.fixture.date).getTime()
      )
      .slice(0, 20);
  }

  async getFixturesByDateRangeAndLeague(
    fromDate: string,
    toDate: string,
    league: number
  ): Promise<Match[]> {
    const season = new Date(fromDate).getFullYear();
    const fixtures = await this.request<Match[]>("/fixtures", {
      from: fromDate,
      to: toDate,
      league,
      season,
    });

    return (fixtures ?? [])
      .sort(
        (a, b) =>
          new Date(b.fixture.date).getTime() -
          new Date(a.fixture.date).getTime()
      )
      .slice(0, 20);
  }

  async getTeams(season: number): Promise<Team[]> {
    const teamData =
      (await this.request<{ team: Team }[]>("/teams", {
        league: 128,
        season,
      })) ?? [];
    return teamData.map(({ team }) => team);
  }

  async getTeamsByLeague(leagueId: number, season?: number): Promise<Team[]> {
    try {
      const currentSeason = season || new Date().getFullYear();
      const teamData =
        (await this.request<{ team: Team }[]>("/teams", {
          league: leagueId,
          season: currentSeason,
        })) ?? [];
      return teamData.map(({ team }) => team);
    } catch (error) {
      // console.error(`Error fetching teams for league ${leagueId}:`, error);
      return [];
    }
  }

  async getAllLeagues(): Promise<League[]> {
    const leagueData =
      (await this.request<{ league: League }[]>("/leagues", {})) ?? [];
    return leagueData.map(({ league }) => league);
  }

  async getLeaguesByCountry(country: string): Promise<League[]> {
    const leagueData =
      (await this.request<{ league: League }[]>("/leagues", {
        country,
      })) ?? [];
    return leagueData.map(({ league }) => league);
  }

  async getStandings(
    leagueId: number,
    season: number
  ): Promise<
    {
      league: {
        id: number;
        name: string;
        season: number;
        standings: Array<
          Array<{
            rank: number;
            team: { id: number; name: string; logo: string };
            points: number;
            all: {
              played: number;
              win: number;
              draw: number;
              lose: number;
              goals: { for: number; against: number };
            };
            form?: string;
          }>
        >;
      };
    }[]
  > {
    try {
      const standings = await this.request<
        {
          league: {
            id: number;
            name: string;
            season: number;
            standings: Array<
              Array<{
                rank: number;
                team: { id: number; name: string; logo: string };
                points: number;
                all: {
                  played: number;
                  win: number;
                  draw: number;
                  lose: number;
                  goals: { for: number; against: number };
                };
                form?: string;
              }>
            >;
          };
        }[]
      >("/standings", {
        league: leagueId,
        season,
      });
      return standings ?? [];
    } catch (error) {
      // console.error(`Error fetching standings for league ${leagueId}:`, error);
      return [];
    }
  }

  async getLeagues(): Promise<
    {
      league: { id: number; name: string; logo: string };
      country: { name: string };
    }[]
  > {
    try {
      const leagues = await this.request<
        {
          league: { id: number; name: string; logo: string };
          country: { name: string };
        }[]
      >("/leagues", {});
      return leagues ?? [];
    } catch (error) {
      // console.error("Error fetching leagues:", error);
      return [];
    }
  }
}
