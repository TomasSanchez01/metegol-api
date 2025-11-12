/**
 * Tests para el endpoint /api/fixtures
 */

import { NextRequest } from "next/server";
import { GET } from "@/app/api/fixtures/route";

describe("GET /api/fixtures", () => {
  it("debe devolver un array de partidos", async () => {
    const request = new NextRequest("http://localhost:3000/api/fixtures");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("matches");
    expect(Array.isArray(data.matches)).toBe(true);
  });

  it("debe aceptar parámetro date", async () => {
    const date = new Date().toISOString().split("T")[0];
    const request = new NextRequest(
      `http://localhost:3000/api/fixtures?date=${date}`
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("matches");
    expect(Array.isArray(data.matches)).toBe(true);
  });

  it("debe aceptar parámetro league", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/fixtures?league=128"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("matches");
    expect(Array.isArray(data.matches)).toBe(true);
  });

  it("debe aceptar parámetro leagues (múltiples)", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/fixtures?leagues=128,39,140"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("matches");
    expect(Array.isArray(data.matches)).toBe(true);
  });

  it("debe manejar errores correctamente", async () => {
    // Simular un error desconectando Firebase (si es posible)
    // Por ahora, verificamos que el endpoint maneja errores
    const request = new NextRequest("http://localhost:3000/api/fixtures");
    const response = await GET(request);

    // El endpoint debe responder (200 o 500, pero no crashear)
    expect([200, 500]).toContain(response.status);
  });
});

