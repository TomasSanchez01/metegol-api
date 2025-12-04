import { NextRequest, NextResponse } from "next/server";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { Match } from "@/types/match";
import { format, parseISO } from "date-fns";

// Global instance to avoid Firebase reinitialization
let globalFirestoreService: FirestoreFootballService | null = null;

function getFirestoreService(): FirestoreFootballService {
  if (!globalFirestoreService) {
    globalFirestoreService = new FirestoreFootballService();
  }
  return globalFirestoreService;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");
  const league = searchParams.get("league");
  const leagues = searchParams.get("leagues");

  const firestoreService = getFirestoreService();

  try {
    let matches: Match[] = [];

    const getDateString = (inputDate?: string | null) => {
      const targetDate = inputDate ? parseISO(inputDate) : new Date();
      return format(targetDate, "yyyy-MM-dd");
    };

    if (leagues) {
      // Multiple leagues - usar método optimizado que consulta Firestore una vez y filtra
      const leagueIds = leagues.split(",").map(id => parseInt(id.trim()));
      const targetDateStr = getDateString(date);

      // Usar método optimizado que consulta Firestore una vez por fecha y filtra por ligas
      // Este método ya incluye detalles completos (stats, events, lineups) desde colecciones estructuradas
      matches = await firestoreService.getFixturesForMultipleLeagues(
        targetDateStr,
        targetDateStr,
        leagueIds
      );
    } else if (date && league) {
      // Single league and date
      const targetDateStr = getDateString(date);
      matches = await firestoreService.getFixtures(
        targetDateStr,
        targetDateStr,
        parseInt(league)
      );
    } else if (league) {
      // Single league, today's matches
      const todayStr = getDateString();
      matches = await firestoreService.getFixtures(
        todayStr,
        todayStr,
        parseInt(league)
      );
    } else {
      // Default leagues for today - usar método optimizado para múltiples ligas
      const todayStr = getDateString(date);
      const defaultLeagues = [
        128,
        129,
        130, // Argentina (Liga Profesional, Primera Nacional, Copa Argentina)
        2,
        3,
        848, // UEFA (Champions, Europa, Conference)
        140,
        39,
        135,
        78,
        61, // Top 5 European leagues
        13,
        11, // CONMEBOL (Libertadores, Sudamericana)
        71,
        73, // Brazil (Brasileirão A, Copa do Brasil)
        15, // Mundial de Clubes
      ];
      // Usar método optimizado que consulta Firestore una vez y filtra por ligas
      matches = await firestoreService.getFixturesForMultipleLeagues(
        todayStr,
        todayStr,
        defaultLeagues
      );
    }

    // Los matches ya incluyen detalles completos (stats, events, lineups) desde colecciones estructuradas
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Error fetching fixtures:", error);
    return NextResponse.json(
      { error: "Error al obtener los partidos" },
      { status: 500 }
    );
  }
}
