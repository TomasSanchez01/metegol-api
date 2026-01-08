/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { AutoScheduler } from "@/lib/background-sync/AutoScheduler";
import { withAdminAuth } from "@/lib/middleware/auth";

// Global scheduler instance
let globalScheduler: AutoScheduler | null = null;

export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const body = await request.json();
    const { action, config } = body;

    // Initialize scheduler if needed
    if (!globalScheduler) {
      globalScheduler = new AutoScheduler(apiKey, config);
    }

    let result: { message: string; status: string; schedulerStatus?: any };

    switch (action) {
      case "start":
        globalScheduler.start();
        result = {
          message: "Auto scheduler started",
          status: "started",
          schedulerStatus: globalScheduler.getStatus(),
        };
        break;

      case "stop":
        globalScheduler.stop();
        result = {
          message: "Auto scheduler stopped",
          status: "stopped",
          schedulerStatus: globalScheduler.getStatus(),
        };
        break;

      case "restart":
        globalScheduler.stop();
        setTimeout(() => globalScheduler?.start(), 2000);
        result = {
          message: "Auto scheduler restarting",
          status: "restarting",
          schedulerStatus: globalScheduler.getStatus(),
        };
        break;

      case "update_config":
        if (config) {
          globalScheduler.updateConfig(config);
          result = {
            message: "Scheduler configuration updated",
            status: "updated",
            schedulerStatus: globalScheduler.getStatus(),
          };
        } else {
          return NextResponse.json(
            { error: "Missing config parameter for update_config" },
            { status: 400 }
          );
        }
        break;

      case "status":
        result = {
          message: "Scheduler status retrieved",
          status: "info",
          schedulerStatus: globalScheduler.getStatus(),
        };
        break;

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: start, stop, restart, update_config, status",
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin scheduler error:", error);
    return NextResponse.json(
      { error: "Scheduler operation failed" },
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

    if (!globalScheduler) {
      globalScheduler = new AutoScheduler(apiKey);
    }

    const status = globalScheduler.getStatus();

    return NextResponse.json({
      schedulerStatus: status,
      message: "Scheduler status retrieved",
      timestamp: new Date().toISOString(),
      availableActions: [
        "start - Start the auto scheduler",
        "stop - Stop the auto scheduler",
        "restart - Restart the auto scheduler",
        "update_config - Update scheduler configuration",
        "status - Get current status",
      ],
      defaultConfig: {
        enabled: true,
        intervals: {
          quickSync: 30, // minutes
          smartSync: 120, // minutes
          fullPopulation: 1440, // minutes (24 hours)
        },
        timeWindows: {
          lowActivity: { start: 2, end: 6 }, // 2 AM - 6 AM
          highActivity: { start: 14, end: 22 }, // 2 PM - 10 PM
        },
        throttling: {
          maxConcurrentOperations: 1,
          respectRateLimit: true,
        },
      },
    });
  } catch (error) {
    console.error("Admin scheduler status error:", error);
    return NextResponse.json(
      { error: "Failed to get scheduler status" },
      { status: 500 }
    );
  }
});
