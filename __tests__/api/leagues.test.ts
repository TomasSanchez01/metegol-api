/**
 * Tests para el endpoint /api/leagues
 */

import { NextRequest } from "next/server";
import { GET } from "@/app/api/leagues/route";

describe("GET /api/leagues", () => {
  it("debe devolver un array de ligas", async () => {
    const request = new NextRequest("http://localhost:3000/api/leagues");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("leagues");
    expect(Array.isArray(data.leagues)).toBe(true);
    expect(data.leagues.length).toBeGreaterThan(0);
  });

  it("debe aceptar el parámetro country", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/leagues?country=Argentina"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("leagues");
    expect(Array.isArray(data.leagues)).toBe(true);

    // Todas las ligas deben ser del país especificado
    data.leagues.forEach((league: any) => {
      expect(league.country.toLowerCase()).toBe("argentina");
    });
  });

  it("debe filtrar correctamente por país", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/leagues?country=Spain"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("leagues");
    expect(Array.isArray(data.leagues)).toBe(true);

    // Todas las ligas deben ser de España
    data.leagues.forEach((league: any) => {
      expect(league.country.toLowerCase()).toBe("spain");
    });
  });

  it("debe devolver ligas con estructura correcta", async () => {
    const request = new NextRequest("http://localhost:3000/api/leagues");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.leagues.length).toBeGreaterThan(0);

    // Verificar estructura de la primera liga
    const firstLeague = data.leagues[0];
    expect(firstLeague).toHaveProperty("id");
    expect(firstLeague).toHaveProperty("name");
    expect(firstLeague).toHaveProperty("logo");
    expect(firstLeague).toHaveProperty("country");
    expect(typeof firstLeague.id).toBe("number");
    expect(typeof firstLeague.name).toBe("string");
    expect(typeof firstLeague.logo).toBe("string");
    expect(typeof firstLeague.country).toBe("string");
  });
});
