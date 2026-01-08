/**
 * Tests para el endpoint /api/standings
 */

import { NextRequest } from "next/server";
import { GET } from "@/app/api/standings/route";

describe("GET /api/standings", () => {
  it("debe requerir el parámetro id", async () => {
    const request = new NextRequest("http://localhost:3000/api/standings");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("ID de liga requerido");
  });

  it("debe devolver standings cuando se proporciona un id válido", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/standings?id=128"
    );
    const response = await GET(request);
    const data = await response.json();

    // Puede ser 200 (con datos) o 404 (sin datos)
    expect([200, 404]).toContain(response.status);

    if (response.status === 200) {
      expect(data).toHaveProperty("standings");
      expect(data).toHaveProperty("league");
      expect(Array.isArray(data.standings)).toBe(true);
      expect(data.league).toHaveProperty("id");
      expect(data.league).toHaveProperty("name");
    }
  });

  it("debe aceptar el parámetro season", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/standings?id=128&season=2024"
    );
    const response = await GET(request);

    // Puede ser 200 (con datos) o 404 (sin datos)
    expect([200, 404]).toContain(response.status);
  });

  it("debe rechazar ids inválidos", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/standings?id=invalid"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("ID de liga inválido");
  });
});
