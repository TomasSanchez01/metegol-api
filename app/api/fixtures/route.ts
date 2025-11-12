import { NextRequest, NextResponse } from "next/server";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { FastFootballApi } from "@/lib/client-api/FastFootballApi";
import { Match } from "@/types/match";
import { format, parseISO } from "date-fns";

// Global instances to avoid Firebase reinitialization
let globalFirestoreService: FirestoreFootballService | null = null;
let globalFastApi: FastFootballApi | null = null;

function getFirestoreService(): FirestoreFootballService {
  if (!globalFirestoreService) {
    globalFirestoreService = new FirestoreFootballService();
  }
  return globalFirestoreService;
}

function getFastApi(): FastFootballApi {
  if (!globalFastApi) {
    globalFastApi = new FastFootballApi();
  }
  return globalFastApi;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");
  const league = searchParams.get("league");
  const leagues = searchParams.get("leagues");

  const firestoreService = getFirestoreService();
  const fastApi = getFastApi();

  try {
    let matches: Match[] = [];

    const getDateString = (inputDate?: string | null) => {
      const targetDate = inputDate ? parseISO(inputDate) : new Date();
      return format(targetDate, "yyyy-MM-dd");
    };

    if (leagues) {
      // Multiple leagues - consultar cada una desde Firestore
      const leagueIds = leagues.split(",").map(id => parseInt(id.trim()));
      const targetDateStr = getDateString(date);

      const allMatches = await Promise.all(
        leagueIds.map(leagueId =>
          firestoreService.getFixtures(
            targetDateStr,
            targetDateStr,
            leagueId
          )
        )
      );
      matches = allMatches.flat();
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
      // Default leagues for today
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
      const allMatches = await Promise.all(
        defaultLeagues.map(leagueId =>
          firestoreService.getFixtures(todayStr, todayStr, leagueId)
        )
      );
      matches = allMatches.flat();
    }

    // Get matches with detailed data (stats, events, lineups) from FastFootballApi
    // Esto consulta api_cache que ya tiene los datos detallados
    const matchesWithStats = await fastApi.getMatchesWithDetails(matches);

    return NextResponse.json({ matches: matchesWithStats });
  } catch (error) {
    console.error("Error fetching fixtures:", error);
    return NextResponse.json(
      { error: "Error al obtener los partidos" },
      { status: 500 }
    );
  }
}
