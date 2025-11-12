import { NextRequest, NextResponse } from "next/server";
import { FirestoreFootballService } from "@/lib/firestore-football-service";

// Global instance to avoid Firebase reinitialization
let globalFirestoreService: FirestoreFootballService | null = null;

function getFirestoreService(): FirestoreFootballService {
  if (!globalFirestoreService) {
    globalFirestoreService = new FirestoreFootballService();
  }
  return globalFirestoreService;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const season = searchParams.get("season");

    if (!id) {
      return NextResponse.json(
        { error: "ID de liga requerido" },
        { status: 400 }
      );
    }

    const leagueId = parseInt(id);

    if (!leagueId || isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID de liga inválido" },
        { status: 400 }
      );
    }

    // Get current year for season if not provided
    const currentYear = season ? parseInt(season) : new Date().getFullYear();

    console.log(
      `📄 Fetching standings for league ${leagueId}, season ${currentYear}`
    );

    // Use FirestoreFootballService - consulta Firestore primero, luego API externa
    const firestoreService = getFirestoreService();
    const result = await firestoreService.getStandings(leagueId, currentYear);

    if (!result || !result.standings || result.standings.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron datos de la liga" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      standings: result.standings,
      league: result.league,
    });
  } catch (error) {
    console.error("Error fetching standings:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
