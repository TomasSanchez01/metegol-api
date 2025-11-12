import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FirestoreFootballService } from "@/lib/firestore-football-service";
import { STATIC_LEAGUES } from "@/lib/leagues-data";

// Global instance to avoid Firebase reinitialization
let globalFirestoreService: FirestoreFootballService | null = null;

function getFirestoreService(): FirestoreFootballService {
  if (!globalFirestoreService) {
    globalFirestoreService = new FirestoreFootballService();
  }
  return globalFirestoreService;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");

    // Usar FirestoreFootballService - consulta Firestore primero, luego API externa
    const firestoreService = getFirestoreService();
    let leagues = await firestoreService.getLeagues(country || undefined);

    // Si no hay ligas en Firestore y no se especificó país, usar ligas estáticas como fallback
    if (leagues.length === 0 && !country) {
      console.log(
        "⚠️  No leagues found in Firestore, using static leagues as fallback"
      );
      leagues = STATIC_LEAGUES.map((league) => ({
        id: league.id,
        name: league.name,
        logo: league.logo,
        country: league.country,
      }));
    }

    // Filtrar por país si se especificó y las ligas vienen de Firestore
    if (country && leagues.length > 0) {
      leagues = leagues.filter(
        (league) => league.country.toLowerCase() === country.toLowerCase()
      );
    }

    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("Leagues API Error:", error);
    // Fallback a ligas estáticas en caso de error
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    let leagues = STATIC_LEAGUES;

    if (country) {
      leagues = STATIC_LEAGUES.filter(
        (league) => league.country.toLowerCase() === country.toLowerCase()
      );
    }

    return NextResponse.json({ leagues });
  }
}
