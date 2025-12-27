/**
 * Tests para /api/admin/dashboard
 */

import { GET, POST } from "@/app/api/admin/dashboard/route";
import { adminDb } from "@/lib/firebase/config";
import { AuthService } from "@/lib/auth";

// Mock de Firebase Admin
jest.mock("@/lib/firebase/config");
jest.mock("@/lib/middleware/auth");
jest.mock("@/lib/auth");

// Mock de withAdminAuth para que pase la autenticación
jest.mock("@/lib/middleware/auth", () => ({
  withAdminAuth: (handler: any) => handler,
}));

describe("/api/admin/dashboard", () => {
  let mockAdminDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock de AuthService
    (AuthService.verifyToken as jest.Mock) = jest
      .fn()
      .mockReturnValue({ id: "1", email: "admin@test.com", role: "admin" });
    (AuthService.isAdmin as jest.Mock) = jest.fn().mockReturnValue(true);

    // Mock de adminDb - crear una cadena de mocks que funcione correctamente
    const mockCollection = jest.fn().mockReturnValue({
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 50 }),
        }),
      }),
    });

    mockAdminDb = {
      collection: mockCollection,
    };

    (adminDb as any) = mockAdminDb;
  });

  describe("GET", () => {
    it("debe devolver estadísticas del dashboard", async () => {
      // Crear request con cookie de admin
      const request = new Request("http://localhost:3000/api/admin/dashboard", {
        headers: {
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await GET(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("summary");
      expect(data).toHaveProperty("collections");
      expect(data).toHaveProperty("actions");
      expect(data.summary).toHaveProperty("structuredCollections");
      expect(data.summary).toHaveProperty("totalEntries");
      expect(data.summary).toHaveProperty("emptyQueries");
      expect(data.summary).toHaveProperty("status");
      expect(data.collections).toHaveProperty("ligas");
      expect(data.collections).toHaveProperty("equipos");
      expect(data.collections).toHaveProperty("partidos");
    });

    it("debe manejar errores correctamente", async () => {
      // Mock de error en count().get() - configurar el mock para que falle
      const mockCollectionWithError = jest.fn().mockReturnValue({
        count: jest.fn().mockReturnValue({
          get: jest.fn().mockRejectedValue(new Error("Test error")),
        }),
      });

      (adminDb as any).collection = mockCollectionWithError;

      // Crear request con cookie de admin
      const request = new Request("http://localhost:3000/api/admin/dashboard", {
        headers: {
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await GET(request as any);
      const data = await response.json();

      // Verificar respuesta - debe seguir funcionando aunque haya errores
      // El código maneja errores y devuelve 0 para las colecciones con error
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("summary");
      expect(data).toHaveProperty("collections");
      // Verificar que las colecciones con error tienen totalEntries: 0
      expect(data.collections.ligas?.totalEntries).toBe(0);
    });
  });

  describe("POST", () => {
    it("debe refrescar estadísticas", async () => {
      // Crear request con action=refresh-stats usando NextRequest mock
      const url = new URL(
        "http://localhost:3000/api/admin/dashboard?action=refresh-stats"
      );
      const request = {
        nextUrl: url,
        method: "POST",
        headers: new Headers({
          Cookie: "admin-token=test-token",
        }),
      } as any;

      // Ejecutar
      const response = await POST(request);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("success");
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("message");
    });

    it("debe devolver error para acción inválida", async () => {
      // Crear request con action inválida usando NextRequest mock
      const url = new URL(
        "http://localhost:3000/api/admin/dashboard?action=invalid"
      );
      const request = {
        nextUrl: url,
        method: "POST",
        headers: new Headers({
          Cookie: "admin-token=test-token",
        }),
      } as any;

      // Ejecutar
      const response = await POST(request);
      const data = await response.json();

      // Verificar respuesta de error
      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
    });
  });
});
