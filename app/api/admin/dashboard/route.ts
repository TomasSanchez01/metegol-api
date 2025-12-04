// Admin dashboard con estadísticas de Firestore
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/config";
import { withAdminAuth } from "@/lib/middleware/auth";

export const GET = withAdminAuth(async () => {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin no está inicializado" },
        { status: 500 }
      );
    }

    // Obtener estadísticas de colecciones estructuradas
    const collections = [
      "ligas",
      "equipos",
      "jugadores",
      "partidos",
      "standings",
      "formaciones",
      "empty_queries",
    ];

    const stats: Record<string, any> = {};

    // Obtener conteos de cada colección
    for (const collectionName of collections) {
      try {
        const countSnapshot = await adminDb
          .collection(collectionName)
          .count()
          .get();
        stats[collectionName] = {
          totalEntries: countSnapshot.data().count || 0,
        };
      } catch (error) {
        console.error(`Error getting stats for ${collectionName}:`, error);
        stats[collectionName] = {
          totalEntries: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Calcular totales
    const totalStructuredCollections =
      (stats.ligas?.totalEntries || 0) +
      (stats.equipos?.totalEntries || 0) +
      (stats.jugadores?.totalEntries || 0) +
      (stats.partidos?.totalEntries || 0) +
      (stats.standings?.totalEntries || 0) +
      (stats.formaciones?.totalEntries || 0);

    const dashboard = {
      timestamp: new Date().toISOString(),
      summary: {
        structuredCollections: totalStructuredCollections,
        totalEntries: totalStructuredCollections,
        emptyQueries: stats.empty_queries?.totalEntries || 0,
        status: "Healthy",
      },
      collections: stats,
      actions: {
        syncData: "/api/admin/sync",
        refreshCache: "/api/cron/refresh-cache",
      },
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to generate dashboard" },
      { status: 500 }
    );
  }
});

export const POST = withAdminAuth(async request => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    switch (action) {
      case "refresh-stats":
        // Simplemente devolver éxito, las stats se obtienen en GET
        return NextResponse.json({
          success: true,
          message: "Statistics refreshed",
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Dashboard action error:", error);
    return NextResponse.json(
      { error: "Failed to execute action" },
      { status: 500 }
    );
  }
});
