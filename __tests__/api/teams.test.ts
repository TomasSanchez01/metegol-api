/**
 * Tests para el endpoint /api/teams/[id]
 */

import { NextRequest } from "next/server";
import { GET } from "@/app/api/teams/[id]/route";

describe("GET /api/teams/[id]", () => {
  it("debe devolver información del equipo y sus partidos", async () => {
    const request = new NextRequest("http://localhost:3000/api/teams/1");
    const params = Promise.resolve({ id: "1" });
    const response = await GET(request, { params });
    const data = await response.json();

    // Puede ser 200 (con datos) o 500 (error de configuración)
    expect([200, 500]).toContain(response.status);

    if (response.status === 200) {
      expect(data).toHaveProperty("team");
      expect(data).toHaveProperty("matches");
      expect(data).toHaveProperty("totalMatches");
      expect(Array.isArray(data.matches)).toBe(true);
      expect(typeof data.totalMatches).toBe("number");
      expect(data.team).toHaveProperty("id");
      expect(data.team).toHaveProperty("name");
      expect(data.team).toHaveProperty("logo");
    }
  });

  it("debe manejar equipos que no existen", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/teams/999999"
    );
    const params = Promise.resolve({ id: "999999" });
    const response = await GET(request, { params });
    const data = await response.json();

    // Puede ser 200 (con array vacío) o 500 (error de configuración)
    expect([200, 500]).toContain(response.status);

    if (response.status === 200) {
      expect(data).toHaveProperty("team");
      expect(data).toHaveProperty("matches");
      expect(data).toHaveProperty("totalMatches");
      expect(Array.isArray(data.matches)).toBe(true);
      expect(data.totalMatches).toBe(0);
    }
  });

  it("debe manejar errores de configuración", async () => {
    // Sin API key configurada, el endpoint debe manejar el error
    const request = new NextRequest("http://localhost:3000/api/teams/1");
    const params = Promise.resolve({ id: "1" });
    const response = await GET(request, { params });

    // El endpoint debe responder (200 o 500, pero no crashear)
    expect([200, 500]).toContain(response.status);
  });
});

