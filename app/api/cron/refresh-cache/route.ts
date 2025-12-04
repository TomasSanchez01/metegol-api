import { NextRequest, NextResponse } from "next/server";
import { DataSyncer } from "@/lib/background-sync/DataSyncer";
import { checkAuthentication } from "@/lib/middleware/auth";

async function performSmartSync(triggeredBy: string, apiKey: string) {
  const syncer = new DataSyncer(apiKey);
  console.log(`🔄 Starting cache refresh (triggered by: ${triggeredBy})...`);
  await syncer.smartSync();
  const syncStats = syncer.getStats();
  console.log("✅ Cache refresh completed!");

  return NextResponse.json({
    success: true,
    message: "Smart sync completed using DataSyncer",
    syncStats,
    triggeredBy,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "FOOTBALL_API_KEY not configured" },
        { status: 500 }
      );
    }

    return await performSmartSync("cron", apiKey);
  } catch (error) {
    console.error("❌ Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh cache",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Allow POST requests for manual triggering (authenticated admins)
export async function POST(request: NextRequest) {
  try {
    const user = await checkAuthentication(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "FOOTBALL_API_KEY not configured" },
        { status: 500 }
      );
    }

    return await performSmartSync(user.email, apiKey);
  } catch (error) {
    console.error("❌ Manual cache refresh error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh cache",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
