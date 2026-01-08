/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { BackgroundSync } from "@/lib/background-sync/background-sync";
import { FastFootballApi } from "@/lib/client-api/FastFootballApi";

// Global instances to avoid reinitialization
let globalSync: BackgroundSync | null = null;
let globalApi: FastFootballApi | null = null;

function getSync(): BackgroundSync {
  if (!globalSync) {
    globalSync = new BackgroundSync();
  }
  return globalSync;
}

function getApi(): FastFootballApi {
  if (!globalApi) {
    globalApi = new FastFootballApi();
  }
  return globalApi;
}

export async function POST(request: NextRequest) {
  try {
    const { date, leagues } = await request.json();

    if (!date) {
      return NextResponse.json({ error: "Fecha requerida" }, { status: 400 });
    }

    const sync = getSync();
    const api = getApi();

    // Ligas por defecto si no se especifican
    const defaultLeagues = [128, 129, 130, 2, 3, 848, 15];
    const targetLeagues = leagues || defaultLeagues;

    console.log(
      `🔄 Loading on demand for ${date}, ${targetLeagues.length} leagues`
    );

    // Verificar qué datos ya tenemos y cuáles necesitamos cargar
    const missingData = [];

    for (const leagueId of targetLeagues) {
      const hasData = await sync.hasFixturesData(leagueId, date);
      if (!hasData) {
        missingData.push(leagueId);
      }
    }

    if (missingData.length === 0) {
      console.log(`✅ All data already available for ${date}`);

      // Obtener datos ya existentes
      const matches = await api.getMultipleLeaguesFixtures(date, targetLeagues);

      return NextResponse.json({
        success: true,
        message: "Datos ya disponibles",
        matches,
        stats: {
          alreadyAvailable: targetLeagues.length,
          loaded: 0,
        },
      });
    }

    console.log(`📥 Loading missing data for ${missingData.length} leagues`);

    // Cargar solo los datos faltantes
    const loadPromises = missingData.map(async leagueId => {
      try {
        await sync.syncFixtures(leagueId, date, date);
        console.log(`✅ Loaded league ${leagueId} for ${date}`);
        return { leagueId, success: true };
      } catch (error) {
        console.error(
          `❌ Failed to load league ${leagueId} for ${date}:`,
          error
        );
        return {
          leagueId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const loadResults = await Promise.all(loadPromises);
    const successful = loadResults.filter(r => r.success).length;

    // Obtener todos los datos (ya existentes + recién cargados)
    const matches = await api.getMultipleLeaguesFixtures(date, targetLeagues);

    console.log(
      `✅ Load on demand completed: ${successful}/${missingData.length} new, ${targetLeagues.length - missingData.length} existing`
    );

    return NextResponse.json({
      success: true,
      message: `Carga completada: ${successful} nuevas, ${targetLeagues.length - missingData.length} existentes`,
      matches,
      stats: {
        alreadyAvailable: targetLeagues.length - missingData.length,
        loaded: successful,
        failed: missingData.length - successful,
      },
      loadResults,
    });
  } catch (error) {
    console.error("Error in load on demand:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error en la carga bajo demanda",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");
  const leagues = searchParams.get("leagues");

  if (!date) {
    return NextResponse.json(
      { error: "Fecha requerida. Use ?date=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    const sync = getSync();
    const api = getApi();

    // Ligas a verificar
    const defaultLeagues = [128, 129, 130, 2, 3, 848, 15];
    const targetLeagues = leagues
      ? leagues.split(",").map(id => parseInt(id.trim()))
      : defaultLeagues;

    // Verificar qué datos tenemos
    const availabilityCheck = await Promise.all(
      targetLeagues.map(async leagueId => {
        const hasData = await sync.hasFixturesData(leagueId, date);
        return { leagueId, hasData };
      })
    );

    const available = availabilityCheck.filter(item => item.hasData);
    const missing = availabilityCheck.filter(item => !item.hasData);

    // Si tenemos todos los datos, devolverlos
    let matches: any[] = [];
    if (available.length > 0) {
      const availableLeagues = available.map(item => item.leagueId);
      matches = await api.getMultipleLeaguesFixtures(date, availableLeagues);
    }

    return NextResponse.json({
      success: true,
      date,
      availability: {
        available: available.length,
        missing: missing.length,
        total: targetLeagues.length,
      },
      availableLeagues: available.map(item => item.leagueId),
      missingLeagues: missing.map(item => item.leagueId),
      matches,
      needsLoading: missing.length > 0,
    });
  } catch (error) {
    console.error("Error checking data availability:", error);
    return NextResponse.json(
      { error: "Error al verificar disponibilidad de datos" },
      { status: 500 }
    );
  }
}
