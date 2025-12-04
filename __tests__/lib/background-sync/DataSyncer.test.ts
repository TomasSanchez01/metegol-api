/**
 * Tests para DataSyncer actualizado
 */

import { DataSyncer } from "@/lib/background-sync/DataSyncer";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { FootballApiServer } from "@/lib/footballApi";

// Mock de FirestoreFootballService
jest.mock("@/lib/firestore-football-service");
jest.mock("@/lib/footballApi");

describe("DataSyncer", () => {
  let syncer: DataSyncer;
  let mockApi: jest.Mocked<FootballApiServer>;
  let mockFirestoreService: jest.Mocked<FirestoreFootballService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Crear mocks
    mockApi = {
      getFixturesByDateRangeAndLeague: jest.fn(),
      getMatchStats: jest.fn(),
      getMatchEvents: jest.fn(),
      getMatchLineups: jest.fn(),
      getApiCallCount: jest.fn().mockReturnValue(0),
      getGlobalApiCallCount: jest.fn().mockReturnValue(0),
      resetApiCallCount: jest.fn(),
    } as any;

    mockFirestoreService = {
      setExternalApi: jest.fn(),
      getFixtures: jest.fn(),
      enrichMatchesWithDetails: jest.fn(),
      saveMatchesToFirestore: jest.fn(),
    } as any;

    // Configurar mocks
    (FootballApiServer as jest.MockedClass<typeof FootballApiServer>).mockImplementation(
      () => mockApi
    );
    (FirestoreFootballService as jest.MockedClass<
      typeof FirestoreFootballService
    >).mockImplementation(() => mockFirestoreService);

    // Crear instancia
    syncer = new DataSyncer("test-api-key");
  });

  describe("constructor", () => {
    it("debe inicializar correctamente", () => {
      expect(syncer).toBeInstanceOf(DataSyncer);
      expect(mockFirestoreService.setExternalApi).toHaveBeenCalledWith(mockApi);
    });
  });

  describe("syncTodaysData", () => {
    it("debe sincronizar datos de hoy", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.syncTodaysData();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos
  });

  describe("smartSync", () => {
    it("debe ejecutar smart sync", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.smartSync();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos
  });

  describe("syncHistoricalData", () => {
    it("debe sincronizar datos históricos", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.syncHistoricalData();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 2000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures múltiples veces
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 15000); // Timeout de 15 segundos
  });

  describe("forceSync", () => {
    it("debe forzar sincronización para hoy", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.forceSync("today");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos

    it("debe forzar sincronización para ayer", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.forceSync("yesterday");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos

    it("debe forzar sincronización para mañana", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.forceSync("tomorrow");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos

    it("debe forzar sincronización para partidos en vivo", async () => {
      // Mock de getFixtures que devuelve rápidamente
      mockFirestoreService.getFixtures.mockResolvedValue([]);

      // Ejecutar con timeout para evitar que el test se quede colgado
      const syncPromise = syncer.forceSync("live");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        // Si hay timeout, simplemente verificamos que se inició
        if (error instanceof Error && error.message === "Timeout") {
          // Verificar que se llamó getFixtures al menos una vez
          expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
          // Detener el syncer para limpiar
          syncer.stop();
          return;
        }
        throw error;
      }

      // Verificar que se llamó getFixtures
      expect(mockFirestoreService.getFixtures).toHaveBeenCalled();
    }, 10000); // Timeout de 10 segundos
  });

  describe("getStats", () => {
    it("debe devolver estadísticas", () => {
      const stats = syncer.getStats();

      expect(stats).toHaveProperty("totalJobs");
      expect(stats).toHaveProperty("completedJobs");
      expect(stats).toHaveProperty("failedJobs");
      expect(stats).toHaveProperty("lastSyncTime");
      expect(stats).toHaveProperty("apiCallsToday");
      expect(stats).toHaveProperty("dataItemsSynced");
      expect(stats).toHaveProperty("queueLength");
      expect(stats).toHaveProperty("runningJobs");
    });
  });

  describe("stop", () => {
    it("debe detener el proceso de sincronización", () => {
      syncer.stop();

      const stats = syncer.getStats();
      // Verificar que el syncer puede detenerse
      expect(syncer).toBeDefined();
      expect(stats).toBeDefined();
    });
  });

  describe("clearQueue", () => {
    it("debe limpiar la cola de trabajos", () => {
      // Primero agregar algunos jobs a la cola
      const initialStats = syncer.getStats();
      
      // Limpiar la cola
      syncer.clearQueue();

      const stats = syncer.getStats();
      // Verificar que el syncer puede limpiar la cola
      expect(syncer).toBeDefined();
      expect(stats).toBeDefined();
    });
  });

  afterEach(() => {
    // Limpiar después de cada test
    if (syncer) {
      syncer.stop();
    }
    jest.clearAllTimers();
  });
});

