import { NextRequest, NextResponse } from "next/server";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { FastFootballApi } from "@/lib/client-api/FastFootballApi";
import { Match } from "@/types/match";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const teamId = parseInt(id);
    const season = new Date().getFullYear();

    const firestoreService = getFirestoreService();
    const fastApi = getFastApi();

    // Consultar Firestore primero para obtener información del equipo
    const teamInfo = await firestoreService.getTeamById(teamId);

    // Consultar Firestore para obtener partidos del equipo
    let allMatches = await firestoreService.getTeamMatches(teamId, season);

    // Si no hay partidos en Firestore, consultar API externa
    if (allMatches.length === 0) {
      console.log(
        `⚠️  No matches found in Firestore for team ${teamId}, fetching from external API...`
      );

      const apiKey = process.env.FOOTBALL_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "FOOTBALL_API_KEY not configured" },
          { status: 500 }
        );
      }

      // Use FootballApiServer for team matches
      const { FootballApiServer } = await import("@/lib/footballApi");
      const externalApi = new FootballApiServer(apiKey);

      // Get team matches from all leagues using getTeamAllMatches
      console.log(
        `📄 Fetching all matches for team ${teamId}, season ${season}`
      );
      allMatches = await externalApi.getTeamAllMatches(teamId, season);

      // Guardar partidos en Firestore
      if (allMatches.length > 0) {
        await firestoreService.saveMatchesToFirestore(allMatches);
      }
    }

    if (!allMatches || allMatches.length === 0) {
      return NextResponse.json({
        team: teamInfo || {
          id: teamId,
          name: `Team ${teamId}`,
          logo: `https://media.api-sports.io/football/teams/${teamId}.png`,
        },
        matches: [],
        totalMatches: 0,
      });
    }

    // Get team info from the first match if not found in Firestore
    if (!teamInfo) {
      const firstMatch = allMatches[0];
      const teamFromMatch =
        firstMatch.teams.home.id === teamId
          ? firstMatch.teams.home
          : firstMatch.teams.away;

      // Guardar equipo en Firestore
      await firestoreService.saveTeamsToFirestore(
        [teamFromMatch],
        firstMatch.league.id
      );
    }

    const finalTeamInfo =
      teamInfo ||
      (allMatches[0].teams.home.id === teamId
        ? allMatches[0].teams.home
        : allMatches[0].teams.away);

    // Sort matches: upcoming first, then recent finished matches
    const now = new Date();
    const sortedMatches = allMatches.sort((a, b) => {
      const dateA = new Date(a.fixture.date);
      const dateB = new Date(b.fixture.date);

      // Separate upcoming and past matches
      const aIsUpcoming =
        dateA > now || ["NS", "TBD", "PST"].includes(a.fixture.status.short);
      const bIsUpcoming =
        dateB > now || ["NS", "TBD", "PST"].includes(b.fixture.status.short);

      if (aIsUpcoming && !bIsUpcoming) return -1;
      if (!aIsUpcoming && bIsUpcoming) return 1;

      // Within same category, sort by date
      if (aIsUpcoming) {
        return dateA.getTime() - dateB.getTime(); // Upcoming: earliest first
      } else {
        return dateB.getTime() - dateA.getTime(); // Past: most recent first
      }
    });

    // Get detailed data for first 10 matches only (to improve performance)
    const recentMatches = sortedMatches.slice(0, 10);
    const matchesWithStats = await Promise.all(
      recentMatches.map(async (match) => {
        try {
          const [stats, events] = await Promise.all([
            fastApi.getMatchStats(match.fixture.id),
            fastApi.getMatchEvents(match.fixture.id),
          ]);

          return {
            ...match,
            statistics: stats,
            events: events,
          };
        } catch (error) {
          console.error(
            `Error getting details for match ${match.fixture.id}:`,
            error
          );
          return match; // Return match without detailed stats if there's an error
        }
      })
    );

    // Combine detailed matches with the rest
    const allMatchesWithSomeStats = sortedMatches.map((match, index) => {
      if (index < 10) {
        return matchesWithStats[index];
      }
      return match;
    });

    return NextResponse.json({
      team: finalTeamInfo,
      matches: allMatchesWithSomeStats,
      totalMatches: allMatches.length,
    });
  } catch (error) {
    console.error("Error fetching team details:", error);
    return NextResponse.json(
      { error: "Failed to fetch team details" },
      { status: 500 }
    );
  }
}
