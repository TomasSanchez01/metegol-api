/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CacheContent } from "../CacheContent";

const statsPayload = {
  success: true,
  stats: {
    ligas: { totalEntries: 10 },
    equipos: { totalEntries: 20 },
    jugadores: { totalEntries: 30 },
    partidos: { totalEntries: 40 },
    standings: { totalEntries: 5 },
    formaciones: { totalEntries: 8 },
    empty_queries: { totalEntries: 2 },
    totals: {
      structuredCollections: 113,
      emptyQueries: 2,
      total: 115,
    },
  },
};

const createFetchResponse = (data: any, ok = true) =>
  Promise.resolve({
    ok,
    json: async () => data,
  } as Response);

describe("CacheContent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renderiza estadísticas de cache", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      createFetchResponse(statsPayload)
    );

    render(<CacheContent autoRefresh={false} />);

    await waitFor(() => expect(screen.getByText("Ligas:")).toBeInTheDocument());
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(
      screen.getByText(statsPayload.stats.totals.total.toLocaleString())
    ).toBeInTheDocument();
  });

  it("limpia consultas vacías y actualiza stats", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() => createFetchResponse(statsPayload))
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          message: "Limpiadas 2 consultas vacías antiguas",
          deletedCount: 2,
        })
      )
      .mockImplementationOnce(() => createFetchResponse(statsPayload));

    render(<CacheContent autoRefresh={false} />);

    await waitFor(() => expect(screen.getByText("Ligas:")).toBeInTheDocument());

    fireEvent.click(
      screen.getByRole("button", { name: /limpiar consultas vacías/i })
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/cache?action=clear-expired"
      )
    );

    await waitFor(() =>
      expect(
        screen.getByText(/limpiadas 2 consultas vacías/i)
      ).toBeInTheDocument()
    );
  });

  it("dispara la actualización del cache manual", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() => createFetchResponse(statsPayload))
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          message: "Cache actualizado correctamente",
          syncStats: {},
        })
      )
      .mockImplementationOnce(() => createFetchResponse(statsPayload));

    render(<CacheContent autoRefresh={false} />);

    await waitFor(() => expect(screen.getByText("Ligas:")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /actualizar cache/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/cron/refresh-cache",
        expect.objectContaining({ method: "POST" })
      )
    );

    await waitFor(() =>
      expect(
        screen.getByText(/cache actualizado correctamente/i)
      ).toBeInTheDocument()
    );
  });
});
