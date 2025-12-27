/**
 * Tests para /api/admin/sync
 */

import { GET, POST } from "@/app/api/admin/sync/route";
import { DataSyncer } from "@/lib/background-sync/DataSyncer";
import { AuthService } from "@/lib/auth";

// Mock de DataSyncer
jest.mock("@/lib/background-sync/DataSyncer");
jest.mock("@/lib/middleware/auth");
jest.mock("@/lib/auth");

// Mock de withAdminAuth para que pase la autenticación
jest.mock("@/lib/middleware/auth", () => ({
  withAdminAuth: (handler: any) => handler,
}));

// Mock del singleton
jest.mock("@/lib/background-sync/syncer-singleton");

import {
  getSyncer,
  resetGlobalSyncer,
} from "@/lib/background-sync/syncer-singleton";

describe("/api/admin/sync", () => {
  let mockSyncer: jest.Mocked<DataSyncer>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Resetear el singleton antes de cada test
    resetGlobalSyncer();

    // Mock de AuthService
    (AuthService.verifyToken as jest.Mock) = jest
      .fn()
      .mockReturnValue({ id: "1", email: "admin@test.com", role: "admin" });
    (AuthService.isAdmin as jest.Mock) = jest.fn().mockReturnValue(true);

    // Mock de DataSyncer
    mockSyncer = {
      syncTodaysData: jest.fn().mockResolvedValue(undefined),
      smartSync: jest.fn().mockResolvedValue(undefined),
      forceSync: jest.fn().mockResolvedValue(undefined),
      syncHistoricalData: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      clearQueue: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        totalJobs: 10,
        completedJobs: 8,
        failedJobs: 2,
        lastSyncTime: Date.now(),
        apiCallsToday: 100,
        dataItemsSynced: 50,
        queueLength: 2,
        runningJobs: 1,
      }),
    } as any;

    (DataSyncer as jest.MockedClass<typeof DataSyncer>).mockImplementation(
      () => mockSyncer
    );

    // Mock getSyncer para que retorne nuestro mockSyncer
    (getSyncer as jest.Mock).mockReturnValue(mockSyncer);
  });

  describe("GET", () => {
    it("debe devolver estadísticas de sincronización", async () => {
      // Crear request con cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        headers: {
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await GET(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("stats");
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("timestamp");
      expect(data.stats).toHaveProperty("totalJobs");
      expect(data.stats).toHaveProperty("completedJobs");
      expect(data.stats).toHaveProperty("failedJobs");
      expect(mockSyncer.getStats).toHaveBeenCalled();
    });
  });

  describe("POST", () => {
    it("debe iniciar sincronización manual", async () => {
      // Crear request con action=start_sync y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "start_sync" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("started");
      expect(mockSyncer.syncTodaysData).toHaveBeenCalled();
    });

    it("debe ejecutar smart sync", async () => {
      // Crear request con action=smart_sync y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "smart_sync" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("completed");
      expect(mockSyncer.smartSync).toHaveBeenCalled();
    });

    it("debe ejecutar force sync", async () => {
      // Crear request con action=force_sync y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "force_sync", type: "today" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("completed");
      expect(mockSyncer.forceSync).toHaveBeenCalledWith("today");
    });

    it("debe ejecutar sincronización histórica", async () => {
      // Crear request con action=historical_sync y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "historical_sync" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("completed");
      expect(mockSyncer.syncHistoricalData).toHaveBeenCalled();
    });

    it("debe detener sincronización", async () => {
      // Crear request con action=stop y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("stopped");
      expect(mockSyncer.stop).toHaveBeenCalled();
    });

    it("debe limpiar cola", async () => {
      // Crear request con action=clear_queue y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "clear_queue" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("status");
      expect(data.status).toBe("cleared");
      expect(mockSyncer.clearQueue).toHaveBeenCalled();
    });

    it("debe devolver error para acción inválida", async () => {
      // Crear request con action inválida y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "invalid" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta de error
      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
    });

    it("debe devolver error si falta type para force_sync", async () => {
      // Crear request con action=force_sync sin type y cookie de admin
      const request = new Request("http://localhost:3000/api/admin/sync", {
        method: "POST",
        body: JSON.stringify({ action: "force_sync" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: "admin-token=test-token",
        },
      });

      // Ejecutar
      const response = await POST(request as any);
      const data = await response.json();

      // Verificar respuesta de error
      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
    });
  });
});
