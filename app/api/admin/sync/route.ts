import { NextRequest, NextResponse } from "next/server";
import { getSyncer } from "@/lib/background-sync/syncer-singleton";
import { withAdminAuth } from "@/lib/middleware/auth";

export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const body = await request.json();
    const { action, type } = body;

    const syncer = getSyncer(apiKey);

    let result: { message: string; status: string };

    switch (action) {
      case "start_sync":
        await syncer.syncTodaysData();
        result = {
          message: "Manual sync started",
          status: "started",
        };
        break;

      case "smart_sync":
        await syncer.smartSync();
        result = {
          message: "Smart sync completed",
          status: "completed",
        };
        break;

      case "force_sync":
        if (!type) {
          return NextResponse.json(
            { error: "Missing type parameter for force_sync" },
            { status: 400 }
          );
        }
        await syncer.forceSync(type);
        result = {
          message: `Force sync completed for ${type}`,
          status: "completed",
        };
        break;

      case "historical_sync":
        await syncer.syncHistoricalData();
        result = {
          message: "Historical sync completed (last 30 days)",
          status: "completed",
        };
        break;

      case "stop":
        syncer.stop();
        result = {
          message: "Syncer stopped",
          status: "stopped",
        };
        break;

      case "clear_queue":
        syncer.clearQueue();
        result = {
          message: "Queue cleared",
          status: "cleared",
        };
        break;

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: start_sync, smart_sync, force_sync, historical_sync, stop, clear_queue",
          },
          { status: 400 }
        );
    }

    const stats = syncer.getStats();

    return NextResponse.json({
      ...result,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin sync error:", error);
    return NextResponse.json({ error: "Admin sync failed" }, { status: 500 });
  }
});

export const GET = withAdminAuth(async () => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const syncer = getSyncer(apiKey);
    const stats = syncer.getStats();

    return NextResponse.json({
      stats,
      message: "Sync statistics retrieved",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin sync stats error:", error);
    return NextResponse.json(
      { error: "Failed to get sync stats" },
      { status: 500 }
    );
  }
});
