/* eslint-disable @typescript-eslint/no-require-imports */
// Setup for Jest tests
// Set up environment variables for tests
process.env.NODE_ENV = "test";
// Configurar variables de entorno necesarias para los tests
process.env.FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "test-api-key";

// Enable custom jest-dom matchers for React Testing Library
require("@testing-library/jest-dom");

// Polyfill para Request/Response (Next.js API routes)
// Usamos una implementación simple sin dependencias externas
if (typeof globalThis.Request === "undefined") {
  // Mock básico de Request
  globalThis.Request = class Request {
    constructor(input, init = {}) {
      const url =
        typeof input === "string" ? input : input?.url || "http://localhost";
      Object.defineProperty(this, "url", {
        value: url,
        writable: false,
        enumerable: true,
        configurable: false,
      });

      this.method = init.method || "GET";
      this.headers = new Map();
      this.body = init.body || null;

      if (init.headers) {
        if (init.headers instanceof Map) {
          init.headers.forEach((value, key) => {
            this.headers.set(key, value);
          });
        } else if (typeof init.headers === "object") {
          Object.entries(init.headers).forEach(([key, value]) => {
            this.headers.set(key, value);
          });
        }
      }
    }

    async json() {
      return JSON.parse(this.body || "{}");
    }

    async text() {
      return this.body || "";
    }
  };

  // Mock básico de Response
  globalThis.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || "OK";
      this.headers = new Map();
      this.ok = this.status >= 200 && this.status < 300;

      if (init.headers) {
        if (init.headers instanceof Map) {
          init.headers.forEach((value, key) => {
            this.headers.set(key, value);
          });
        } else if (typeof init.headers === "object") {
          Object.entries(init.headers).forEach(([key, value]) => {
            this.headers.set(key, value);
          });
        }
      }
    }

    async json() {
      return typeof this.body === "string" ? JSON.parse(this.body) : this.body;
    }

    async text() {
      return typeof this.body === "string"
        ? this.body
        : JSON.stringify(this.body);
    }

    static json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    }
  };

  // Mock básico de Headers
  globalThis.Headers = class Headers {
    constructor(init) {
      this._headers = new Map();
      if (init) {
        if (init instanceof Map) {
          init.forEach((value, key) => {
            this._headers.set(key, value);
          });
        } else if (typeof init === "object") {
          Object.entries(init).forEach(([key, value]) => {
            this._headers.set(key, value);
          });
        }
      }
    }

    get(name) {
      return this._headers.get(name.toLowerCase()) || null;
    }

    set(name, value) {
      this._headers.set(name.toLowerCase(), value);
    }

    has(name) {
      return this._headers.has(name.toLowerCase());
    }

    forEach(callback) {
      this._headers.forEach(callback);
    }
  };
}

// Mock Firebase Admin
jest.mock("@/lib/firebase/config", () => {
  // Crear un mock más completo que soporte encadenamiento de métodos
  const createMockQuery = () => {
    const query = {
      where: jest.fn(function () {
        return this; // Retornar el mismo objeto para encadenamiento
      }),
      limit: jest.fn(function () {
        return this; // Retornar el mismo objeto para encadenamiento
      }),
      get: jest.fn().mockResolvedValue({
        docs: [],
        empty: true,
        size: 0,
      }),
    };
    return query;
  };

  const createMockCollection = () => {
    const collection = {
      where: jest.fn(function () {
        // Cuando se llama where en una colección, devolver un query
        return createMockQuery();
      }),
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: false,
          data: () => null,
          id: "mock-doc-id",
        }),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        collection: jest.fn(() => createMockCollection()),
      })),
      get: jest.fn().mockResolvedValue({
        docs: [],
        empty: true,
        size: 0,
      }),
      // También permitir limit directamente en la colección
      limit: jest.fn(function () {
        return createMockQuery();
      }),
    };
    return collection;
  };

  const mockFirestore = {
    collection: jest.fn(() => createMockCollection()),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  };

  return {
    adminDb: mockFirestore,
    db: null,
  };
});

// Mock FootballApiServer para evitar requests HTTP reales en tests
jest.mock("@/lib/footballApi", () => {
  const mockApiCalls = { count: 0 }; // Internal counter for mock API calls
  const mockFootballApiServer = jest.fn().mockImplementation(() => ({
    apiKey: "test-api-key",
    apiCallCount: 0,
    getFixturesByDateAndLeague: jest.fn().mockResolvedValue([]),
    getStandings: jest.fn().mockResolvedValue([
      {
        league: {
          id: 128,
          name: "Test League",
          country: { name: "Test Country" },
          season: 2024,
        },
        standings: [
          [
            {
              rank: 1,
              team: { id: 1, name: "Test Team", logo: "test.png" },
              points: 10,
              all: {
                played: 5,
                win: 3,
                draw: 1,
                lose: 1,
                goals: { for: 10, against: 5 },
              },
              form: "WWLWD",
            },
          ],
        ],
      },
    ]),
    getTeamsByLeague: jest.fn().mockResolvedValue([]),
    getLeagues: jest.fn().mockResolvedValue([]),
    getLeaguesByCountry: jest.fn().mockResolvedValue([]),
    getTeamById: jest.fn().mockResolvedValue(null),
    getTeamMatches: jest.fn().mockResolvedValue([]),
    getTeamAllMatches: jest.fn().mockResolvedValue([]),
    getFixtureDetails: jest.fn().mockResolvedValue(null),
    getMatchStats: jest.fn().mockResolvedValue({ home: [], away: [] }),
    getMatchEvents: jest.fn().mockResolvedValue([]),
    getMatchLineups: jest.fn().mockResolvedValue({ home: null, away: null }),
    getApiCallCount: jest.fn(() => mockApiCalls.count),
    getGlobalApiCallCount: jest.fn(() => mockApiCalls.count),
    resetApiCallCount: jest.fn(() => {
      mockApiCalls.count = 0;
    }),
    request: jest.fn(async () => {
      mockApiCalls.count++;
      return { response: [], errors: [] };
    }),
  }));

  return {
    FootballApiServer: mockFootballApiServer,
  };
});
