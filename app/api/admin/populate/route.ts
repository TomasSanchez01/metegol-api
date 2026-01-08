/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { MassiveDataPopulator } from "@/lib/background-sync/MassiveDataPopulator";
import { withAdminAuth } from "@/lib/middleware/auth";

// Global populator instance to maintain state
let globalPopulator: MassiveDataPopulator | null = null;

export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const body = await request.json();
    const { action, type: _type, config } = body;

    // Initialize populator if needed
    if (!globalPopulator) {
      globalPopulator = new MassiveDataPopulator(apiKey);
    }

    let result: { message: string; status: string; stats?: any };

    switch (action) {
      case "start_massive":
        // Don't await - let it run in background
        globalPopulator.startMassivePopulation(config);
        result = {
          message: "Massive population started in background",
          status: "started",
          stats: globalPopulator.getStats(),
        };
        break;

      case "start_quick":
        // Don't await - let it run in background
        globalPopulator.quickPopulation();
        result = {
          message: "Quick population started (essential leagues only)",
          status: "started",
          stats: globalPopulator.getStats(),
        };
        break;

      case "start_full":
        // Don't await - let it run in background
        globalPopulator.fullPopulation();
        result = {
          message: "Full population started (all leagues, 60 days)",
          status: "started",
          stats: globalPopulator.getStats(),
        };
        break;

      case "stop":
        globalPopulator.stop();
        result = {
          message: "Population stopped",
          status: "stopped",
          stats: globalPopulator.getStats(),
        };
        break;

      case "status":
        result = {
          message: "Population status retrieved",
          status: "info",
          stats: globalPopulator.getStats(),
        };
        break;

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: start_massive, start_quick, start_full, stop, status",
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin populate error:", error);
    return NextResponse.json(
      { error: "Population operation failed" },
      { status: 500 }
    );
  }
});

export const GET = withAdminAuth(async () => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    if (!globalPopulator) {
      globalPopulator = new MassiveDataPopulator(apiKey);
    }

    const stats = globalPopulator.getStats();

    return NextResponse.json({
      stats,
      message: "Population statistics retrieved",
      timestamp: new Date().toISOString(),
      availableActions: [
        "start_massive - Start comprehensive population with custom config",
        "start_quick - Quick population (essential leagues, 7 days)",
        "start_full - Full population (all leagues, 60 days)",
        "stop - Stop current population",
        "status - Get current status",
      ],
    });
  } catch (error) {
    console.error("Admin populate stats error:", error);
    return NextResponse.json(
      { error: "Failed to get populate stats" },
      { status: 500 }
    );
  }
});
