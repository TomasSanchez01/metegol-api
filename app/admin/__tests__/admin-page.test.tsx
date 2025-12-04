import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AdminContent } from "../AdminContent";

const mockStats = {
  totalJobs: 5,
  completedJobs: 3,
  failedJobs: 1,
  lastSyncTime: Date.now(),
  apiCallsToday: 120,
  dataItemsSynced: 450,
  queueLength: 2,
  runningJobs: 1,
};

const updatedStats = {
  ...mockStats,
  totalJobs: 6,
  completedJobs: 4,
  queueLength: 1,
};

const createFetchResponse = (data: any, ok = true) =>
  Promise.resolve({
    ok,
    json: async () => data,
  } as Response);

describe("AdminContent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("muestra estadísticas y ejecuta acciones correctamente", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() => createFetchResponse({ stats: mockStats }))
      .mockImplementationOnce(() =>
        createFetchResponse({
          message: "Smart sync completada",
          stats: updatedStats,
        })
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          stats: updatedStats,
        })
      );

    render(<AdminContent autoRefresh={false} />);

    await waitFor(() =>
      expect(
        screen.getByText(mockStats.totalJobs.toString())
      ).toBeInTheDocument()
    );

    const smartSyncButton = screen.getByRole("button", { name: /smart sync/i });
    fireEvent.click(smartSyncButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/admin/sync",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "smart_sync", type: undefined }),
        })
      )
    );

    await waitFor(() =>
      expect(screen.getByText(/smart sync completada/i)).toBeInTheDocument()
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/admin/sync")
    );
  });
});
