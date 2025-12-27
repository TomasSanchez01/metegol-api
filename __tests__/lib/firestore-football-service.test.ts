/**
 * Tests para el servicio FirestoreFootballService
 */

import { FirestoreFootballService } from "@/lib/firestore-football-service";

describe("FirestoreFootballService", () => {
  let service: FirestoreFootballService;

  beforeAll(() => {
    service = new FirestoreFootballService();
  });

  describe("getFixtures", () => {
    it("debe devolver un array de partidos", async () => {
      const from = "2024-01-01";
      const to = "2024-01-01";
      const matches = await service.getFixtures(from, to);

      expect(Array.isArray(matches)).toBe(true);
    });

    it("debe aceptar un leagueId opcional", async () => {
      const from = "2024-01-01";
      const to = "2024-01-01";
      const leagueId = 128;
      const matches = await service.getFixtures(from, to, leagueId);

      expect(Array.isArray(matches)).toBe(true);
    });
  });

  describe("getStandings", () => {
    it("debe devolver standings y league", async () => {
      const leagueId = 128;
      const season = 2024;
      const result = await service.getStandings(leagueId, season);

      expect(result).toHaveProperty("standings");
      expect(result).toHaveProperty("league");
      expect(Array.isArray(result.standings)).toBe(true);
      expect(result.league).toHaveProperty("id");
      expect(result.league).toHaveProperty("name");
    });
  });

  describe("getTeams", () => {
    it("debe devolver un array de equipos", async () => {
      const leagueId = 128;
      const teams = await service.getTeams(leagueId);

      expect(Array.isArray(teams)).toBe(true);
    });

    it("debe aceptar leagueId opcional", async () => {
      const teams = await service.getTeams();

      expect(Array.isArray(teams)).toBe(true);
    });
  });

  describe("getLeagues", () => {
    it("debe devolver un array de ligas", async () => {
      const leagues = await service.getLeagues();

      expect(Array.isArray(leagues)).toBe(true);
    });

    it("debe aceptar country opcional", async () => {
      const country = "Argentina";
      const leagues = await service.getLeagues(country);

      expect(Array.isArray(leagues)).toBe(true);
    });
  });

  describe("getTeamById", () => {
    it("debe devolver un equipo o null", async () => {
      const teamId = 1;
      const team = await service.getTeamById(teamId);

      expect(team === null || typeof team === "object").toBe(true);

      if (team) {
        expect(team).toHaveProperty("id");
        expect(team).toHaveProperty("name");
        expect(team).toHaveProperty("logo");
      }
    });
  });

  describe("getTeamMatches", () => {
    it("debe devolver un array de partidos", async () => {
      const teamId = 1;
      const matches = await service.getTeamMatches(teamId);

      expect(Array.isArray(matches)).toBe(true);
    });

    it("debe aceptar season opcional", async () => {
      const teamId = 1;
      const season = 2024;
      const matches = await service.getTeamMatches(teamId, season);

      expect(Array.isArray(matches)).toBe(true);
    });
  });
});
