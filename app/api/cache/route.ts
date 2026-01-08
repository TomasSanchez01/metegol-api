/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/config";
import { Timestamp } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Firebase Admin no está inicializado" },
        { status: 500 }
      );
    }

    switch (action) {
      case "stats":
        // Obtener estadísticas de todas las colecciones estructuradas
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

        // Obtener estadísticas de cada colección
        for (const collectionName of collections) {
          try {
            // Intentar usar count() para obtener el conteo eficientemente
            const countSnapshot = await adminDb
              .collection(collectionName)
              .count()
              .get();
            const count = countSnapshot.data().count || 0;
            stats[collectionName] = {
              totalEntries: count,
            };
          } catch {
            // Si count() falla, intentar con get() como fallback
            try {
              const snapshot = await adminDb
                .collection(collectionName)
                .limit(1)
                .get();
              // Si la colección existe pero está vacía, count será 0
              if (snapshot.empty) {
                stats[collectionName] = {
                  totalEntries: 0,
                };
              } else {
                // Si tiene documentos, obtener el conteo real
                const fullSnapshot = await adminDb
                  .collection(collectionName)
                  .get();
                stats[collectionName] = {
                  totalEntries: fullSnapshot.size,
                };
              }
            } catch (fallbackError) {
              console.error(
                `Error getting stats for ${collectionName}:`,
                fallbackError
              );
              stats[collectionName] = {
                totalEntries: 0,
                error:
                  fallbackError instanceof Error
                    ? fallbackError.message
                    : String(fallbackError),
              };
            }
          }
        }

        // Calcular totales (usar 0 si la colección no existe o tiene error)
        const totalEntries =
          (stats.ligas?.totalEntries || 0) +
          (stats.equipos?.totalEntries || 0) +
          (stats.jugadores?.totalEntries || 0) +
          (stats.partidos?.totalEntries || 0) +
          (stats.standings?.totalEntries || 0) +
          (stats.formaciones?.totalEntries || 0);

        return NextResponse.json({
          success: true,
          stats: {
            ...stats,
            totals: {
              structuredCollections: totalEntries,
              emptyQueries: stats.empty_queries?.totalEntries || 0,
              total: totalEntries + (stats.empty_queries?.totalEntries || 0),
            },
          },
        });

      case "clear-expired":
        // Limpiar consultas vacías antiguas (más de 30 días)
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const emptyQueriesSnapshot = await adminDb
            .collection("empty_queries")
            .where("last_checked", "<", Timestamp.fromDate(thirtyDaysAgo))
            .get();

          const batch = adminDb.batch();
          let deletedCount = 0;

          emptyQueriesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
            deletedCount++;
          });

          await batch.commit();

          return NextResponse.json({
            success: true,
            message: `Limpiadas ${deletedCount} consultas vacías antiguas`,
            deletedCount,
          });
        } catch (error) {
          console.error("Error clearing expired empty queries:", error);
          return NextResponse.json({
            success: false,
            error: "Error al limpiar consultas vacías antiguas",
          });
        }

      default:
        return NextResponse.json({
          success: false,
          error: "Invalid action. Use ?action=stats or ?action=clear-expired",
        });
    }
  } catch (error) {
    console.error("Cache API Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      message:
        "Cache refresh not implemented - uses automatic Firestore caching with structured collections",
    });
  } catch (error) {
    console.error("Cache refresh error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to refresh cache" },
      { status: 500 }
    );
  }
}
