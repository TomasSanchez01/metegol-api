/**
 * Servicio para consultar datos de fútbol desde Firestore
 * Consulta primero las colecciones estructuradas, si no hay datos, consulta la API externa
 */

import { adminDb } from "./firebase/config";
import { FootballApiServer } from "./footballApi";
import type { Match, League, Team } from "@/types/match";
import type {
  Liga,
  Equipo,
  Jugador,
  Partido,
  Standing,
  Formacion,
} from "@/types/futbol";
import { Timestamp } from "firebase-admin/firestore";
import type admin from "firebase-admin";
import {
  calculateDetailsTtlMs,
  calculateFixtureTtlMs,
  calculateLineupsTtlMs,
  isFinishedStatus,
  isLiveStatus,
} from "@/lib/cache/ttl";

type PartidoWithTTL = Partido & {
  ttl_fixture?: Timestamp;
  ttl_detalles?: Timestamp;
};

export class FirestoreFootballService {
  private externalApi: FootballApiServer | null = null;
  // Cache en memoria para empty_queries (TTL: 1 hora)
  private emptyQueriesCache: Map<
    string,
    { hasMatches: boolean; timestamp: number }
  > = new Map();
  private readonly EMPTY_QUERIES_CACHE_TTL = 60 * 60 * 1000; // 1 hora

  constructor() {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (apiKey) {
      this.externalApi = new FootballApiServer(apiKey);
    }
  }

  /**
   * Establecer la instancia de API externa (usado por DataSyncer para compartir la misma instancia)
   */
  setExternalApi(api: FootballApiServer): void {
    this.externalApi = api;
  }

  private isTimestampExpired(timestamp?: Timestamp | null): boolean {
    if (!timestamp) {
      return true;
    }
    return timestamp.toMillis() <= Date.now();
  }

  private isFixtureDataStale(partido: PartidoWithTTL): boolean {
    // Si no tiene TTL, considerar que está expirado
    if (!partido.ttl_fixture) {
      return true;
    }

    // Verificar si el TTL está expirado
    const ttlExpired = this.isTimestampExpired(partido.ttl_fixture);
    
    // Si el TTL no está expirado, no es stale
    if (!ttlExpired) {
      return false;
    }

    // Si el TTL está expirado, verificar si el partido es muy antiguo
    // Partidos muy antiguos (más de 30 días) no deberían refrescarse
    // ya que los datos históricos no cambian
    const matchDate = partido.fecha?.toDate();
    if (matchDate) {
      const daysSinceMatch = (Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Si el partido es muy antiguo (más de 30 días), no refrescar
      // aunque el TTL esté expirado
      if (daysSinceMatch > 30) {
        return false; // No es stale, los datos históricos no cambian
      }
    }

    // Para partidos recientes con TTL expirado, sí refrescar
    return true;
  }

  private isDetailsDataStale(partido: PartidoWithTTL): boolean {
    const status = partido.estado?.corto;
    if (!isFinishedStatus(status) && !isLiveStatus(status)) {
      return false;
    }

    // Si no tiene ttl_detalles, verificar si el partido es reciente
    // Partidos antiguos sin ttl_detalles probablemente no tienen estadísticas disponibles
    if (!partido.ttl_detalles) {
      const matchDate = partido.fecha?.toDate();
      const lastUpdate = partido.fecha_actualizacion?.toDate();

      if (matchDate) {
        const daysSinceMatch =
          (Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24);

        // Si el partido terminó hace más de 7 días y no tiene ttl_detalles,
        // probablemente no tiene estadísticas disponibles. No intentar enriquecer.
        if (daysSinceMatch > 7) {
          return false; // No es "stale", simplemente no tiene datos disponibles
        }

        // Si fue actualizado recientemente (sync histórico) pero no tiene ttl_detalles,
        // significa que ya se intentó obtener estadísticas y no están disponibles
        if (lastUpdate) {
          const daysSinceUpdate =
            (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate > 1) {
            // Si fue actualizado hace más de 1 día y no tiene ttl_detalles,
            // ya se intentó obtener estadísticas y no están disponibles
            return false;
          }
        }
      }

      // Para partidos muy recientes sin ttl_detalles, considerar que necesitan actualización
      return true;
    }

    // Si tiene ttl_detalles, verificar si está expirado
    // Si el TTL es muy largo (30 días), significa que ya se intentó obtener pero no están disponibles
    const ttlMs = partido.ttl_detalles.toMillis() - Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Si el TTL es de aproximadamente 30 días, significa que se estableció para evitar reintentos
    // No considerar "stale" hasta que expire completamente
    if (ttlMs > thirtyDaysMs - 24 * 60 * 60 * 1000) {
      // Más de 29 días
      return false; // TTL largo establecido, no intentar de nuevo
    }

    return this.isTimestampExpired(partido.ttl_detalles);
  }

  private shouldRefreshFixtures(partidos: PartidoWithTTL[]): boolean {
    return partidos.some(partido => this.isFixtureDataStale(partido));
  }

  private async refreshFixturesFromExternal(
    from: string,
    to: string,
    leagueId: number
  ): Promise<Match[] | null> {
    if (!this.externalApi) {
      return null;
    }

    try {
      const refreshedMatches =
        await this.externalApi.getFixturesByDateRangeAndLeague(
          from,
          to,
          leagueId
        );

      if (refreshedMatches.length === 0) {
        return null;
      }

      const enrichedMatches =
        await this.enrichMatchesWithDetails(refreshedMatches);
      await this.saveMatchesToFirestore(enrichedMatches);
      return enrichedMatches;
    } catch (error) {
      // console.error(
      //   `Error refreshing fixtures for league ${leagueId} (${from} - ${to}):`,
      //   error
      // );
      return null;
    }
  }

  /**
   * Permite establecer la API externa (útil para testing o inyección de dependencias)
   */
  /**
   * Obtiene partidos desde Firestore, si no hay, consulta la API externa
   */
  async getFixtures(
    from: string,
    to: string,
    leagueId?: number
  ): Promise<Match[]> {
    try {
      // Consultar Firestore primero
      // Nota: Si hay un error de índice, hacemos fallback a la API externa
      try {
        // Usar UTC para evitar problemas de timezone
        const fromDateUTC = new Date(from + "T00:00:00.000Z");
        const toDateUTC = new Date(to + "T23:59:59.999Z");

        // console.log(
        //   `🔍 Querying Firestore for matches from ${fromDateUTC.toISOString()} to ${toDateUTC.toISOString()}${leagueId ? ` (league ${leagueId})` : ""}`
        // );

        let query = adminDb
          .collection("partidos")
          .where("fecha", ">=", Timestamp.fromDate(fromDateUTC))
          .where("fecha", "<=", Timestamp.fromDate(toDateUTC));

        if (leagueId) {
          query = query.where("ligaId", "==", leagueId.toString());
        }

        const snapshot = await query.get();

        // console.log(
        //   `📊 Firestore query returned ${snapshot.size} documents for date range ${from} to ${to}${leagueId ? ` (league ${leagueId})` : ""}`
        // );

        if (!snapshot.empty) {
          const partidosDocs = snapshot.docs.map(
            doc => doc.data() as PartidoWithTTL
          );

          if (leagueId && this.shouldRefreshFixtures(partidosDocs)) {
            const refreshedMatches = await this.refreshFixturesFromExternal(
              from,
              to,
              leagueId
            );
            if (refreshedMatches !== null) {
              return refreshedMatches;
            }
          }

          const matches = await Promise.all(
            partidosDocs.map(partido => this.convertPartidoToMatch(partido))
          );
          // console.log(
          //   `✅ Found ${matches.length} matches in Firestore (collection: "partidos") for ${from} to ${to}${
          //     leagueId ? ` (league ${leagueId})` : ""
          //   }`
          // );

          // Enriquecer partidos con detalles si faltan (stats, events, lineups) o si el TTL expiró
          const matchesNeedingDetails = matches.filter((match, index) => {
            const needsDetails = [
              "FT",
              "AET",
              "PEN",
              "AWD",
              "WO",
              "1H",
              "2H",
              "LIVE",
              "ET",
              "P",
              "HT",
            ].includes(match.fixture.status.short);

            if (!needsDetails) {
              return false;
            }

            const partido = partidosDocs[index];
            const hasAllDetails = !!match.statistics && !!match.events;
            const detailsStale = this.isDetailsDataStale(partido);

            // Si el partido ya tiene todos los detalles, no necesita enriquecimiento
            if (hasAllDetails && !detailsStale) {
              return false;
            }

            // Si el partido está terminado y no tiene detalles, verificar si ya fue sincronizado
            // Partidos que ya fueron sincronizados pero no tienen estadísticas probablemente no las tienen disponibles
            if (!hasAllDetails && isFinishedStatus(partido.estado?.corto)) {
              const matchDate = partido.fecha?.toDate();
              const lastUpdate = partido.fecha_actualizacion?.toDate();

              if (matchDate) {
                const daysSinceMatch =
                  (Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24);

                // Si el partido terminó hace más de 7 días y ya fue actualizado recientemente (sincronizado),
                // pero no tiene estadísticas, probablemente la API no las tiene disponibles
                if (daysSinceMatch > 7) {
                  // Si tiene ttl_detalles establecido (aunque esté expirado), significa que ya se intentó obtener
                  // Si no tiene ttl_detalles y fue actualizado hace más de 1 día, probablemente ya se intentó
                  if (partido.ttl_detalles) {
                    // Ya tiene TTL, solo intentar si está expirado (detailsStale ya lo verifica)
                    return detailsStale;
                  } else if (lastUpdate) {
                    const daysSinceUpdate =
                      (Date.now() - lastUpdate.getTime()) /
                      (1000 * 60 * 60 * 24);
                    // Si fue actualizado hace más de 1 día y no tiene estadísticas, no intentar de nuevo
                    if (daysSinceUpdate > 1) {
                      // console.log(
                      //   `⏭️  Skipping enrichment for match ${partido.id} (synced ${daysSinceUpdate.toFixed(1)} days ago, no stats available)`
                      // );
                      return false;
                    }
                  } else {
                    // Si no tiene fecha_actualizacion, es muy antiguo, no intentar
                    // console.log(
                    //   `⏭️  Skipping enrichment for old match ${partido.id} (${daysSinceMatch.toFixed(1)} days old, no update date)`
                    // );
                    return false;
                  }
                }
              }
            }

            // Solo enriquecer si realmente necesita detalles y el TTL está expirado o es muy reciente
            return !hasAllDetails || detailsStale;
          });

          if (matchesNeedingDetails.length > 0 && this.externalApi) {
            // Enriquecer solo los que necesitan detalles
            const enrichedMatches = await this.enrichMatchesWithDetails(
              matchesNeedingDetails
            );

            // Actualizar los matches con los detalles enriquecidos
            const enrichedMap = new Map(
              enrichedMatches.map(m => [m.fixture.id, m])
            );

            // Reemplazar matches que fueron enriquecidos
            const finalMatches = matches.map(match => {
              const enriched = enrichedMap.get(match.fixture.id);
              return enriched || match;
            });

            // Guardar los detalles enriquecidos en Firestore
            await this.saveMatchesToFirestore(enrichedMatches);

            return finalMatches;
          }

          return matches;
        }

        // Si no hay partidos, verificar si ya consultamos esta liga/fecha antes
        // Esto evita consultar la API externa repetidamente cuando no hay partidos
        if (leagueId) {
          const emptyQueryKey = `empty_fixtures_${leagueId}_${from}`;

          // Verificar cache en memoria primero
          const cached = this.emptyQueriesCache.get(emptyQueryKey);
          if (cached) {
            const age = Date.now() - cached.timestamp;
            // Para fechas lejanas (más de 30 días), usar TTL mucho más largo (1 año)
            const queryDate = new Date(from + "T00:00:00.000Z");
            const daysSinceQuery = (Date.now() - queryDate.getTime()) / (1000 * 60 * 60 * 24);
            const maxAgeMs = daysSinceQuery > 30 ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 año para fechas lejanas, 24h para recientes
            
            if (age < this.EMPTY_QUERIES_CACHE_TTL) {
              // Si no había partidos y fue consultado recientemente, no consultar API
              if (!cached.hasMatches && age < maxAgeMs) {
                const hoursSinceCheck = age / (1000 * 60 * 60);
                // console.log(
                //   `💾 MEMORY CACHE: No matches found for league ${leagueId} on ${from} (checked ${hoursSinceCheck.toFixed(1)}h ago). Skipping API call.`
                // );
                return [];
              }
            }
          }

          // Si no está en cache o expiró, consultar Firestore
          const emptyQueryDoc = await adminDb
            .collection("empty_queries")
            .doc(emptyQueryKey)
            .get();

          if (emptyQueryDoc.exists) {
            const emptyQuery = emptyQueryDoc.data();
            const lastChecked = emptyQuery?.last_checked?.toDate();
            const hoursSinceCheck = lastChecked
              ? (Date.now() - lastChecked.getTime()) / (1000 * 60 * 60)
              : Infinity;

            // Actualizar cache en memoria
            this.emptyQueriesCache.set(emptyQueryKey, {
              hasMatches: emptyQuery?.has_matches === true,
              timestamp: lastChecked?.getTime() || Date.now(),
            });

            // Para fechas lejanas (más de 30 días), usar TTL mucho más largo (1 año)
            // ya que los datos históricos no cambian
            const queryDate = new Date(from + "T00:00:00.000Z");
            const daysSinceQuery = (Date.now() - queryDate.getTime()) / (1000 * 60 * 60 * 24);
            const maxHoursSinceCheck = daysSinceQuery > 30 ? 365 * 24 : 24; // 1 año para fechas lejanas, 24h para recientes

            // Si consultamos hace menos del tiempo máximo y no había partidos, no consultar la API
            if (hoursSinceCheck < maxHoursSinceCheck && emptyQuery?.has_matches === false) {
              // console.log(
              //   `ℹ️  No matches found for league ${leagueId} on ${from} (checked ${hoursSinceCheck.toFixed(1)}h ago). Skipping API call.`
              // );
              return [];
            }
          }
        }
      } catch (firestoreError: any) {
        // Si hay un error de índice u otro error de Firestore, hacer fallback a API externa
        if (
          firestoreError?.code === 9 ||
          firestoreError?.message?.includes("index")
        ) {
          // console.log(
          //   `⚠️  Firestore index not found, fetching from external API... (Error: ${firestoreError.message})`
          // );
        } else {
          // Otro tipo de error, lo lanzamos
          throw firestoreError;
        }
      }

      // Si no hay datos en Firestore o hay error de índice, consultar API externa
      // console.log(
      //   `⚠️  No matches found in Firestore (collection: "partidos") for ${from} to ${to}${leagueId ? ` (league ${leagueId})` : ""}, checking empty_queries cache...`
      // );
      if (!this.externalApi) {
        throw new Error("FOOTBALL_API_KEY not configured");
      }

      let externalMatches: Match[] = [];
      if (leagueId) {
        externalMatches = await this.externalApi.getFixturesByDateAndLeague(
          from,
          leagueId
        );

        // Guardar información sobre si hay partidos o no
        const emptyQueryKey = `empty_fixtures_${leagueId}_${from}`;
        const hasMatches = externalMatches.length > 0;

        // Actualizar cache en memoria
        this.emptyQueriesCache.set(emptyQueryKey, {
          hasMatches,
          timestamp: Date.now(),
        });

        await adminDb.collection("empty_queries").doc(emptyQueryKey).set(
          {
            leagueId: leagueId.toString(),
            date: from,
            has_matches: hasMatches,
            last_checked: Timestamp.now(),
            fecha_creacion: Timestamp.now(),
            fecha_actualizacion: Timestamp.now(),
          },
          { merge: true }
        );
      } else {
        // Si no hay leagueId, consultar múltiples ligas
        const defaultLeagues = [128, 39, 140, 135, 78, 61];
        const allMatches = await Promise.all(
          defaultLeagues.map(id =>
            this.externalApi!.getFixturesByDateAndLeague(from, id)
          )
        );
        externalMatches = allMatches.flat();
      }

      // Guardar en Firestore solo si hay partidos
      if (externalMatches.length > 0) {
        // Enriquecer partidos con detalles (stats, events, lineups) si no los tienen
        const enrichedMatches =
          await this.enrichMatchesWithDetails(externalMatches);
        await this.saveMatchesToFirestore(enrichedMatches);
        return enrichedMatches;
      }

      return externalMatches;
    } catch (error) {
      // console.error("Error getting fixtures:", error);
      throw error;
    }
  }

  /**
   * Obtiene partidos desde Firestore para múltiples ligas de manera optimizada
   * Consulta primero Firestore por fecha, luego filtra por ligas y solo consulta API para las faltantes
   */
  async getFixturesForMultipleLeagues(
    from: string,
    to: string,
    leagueIds: number[]
  ): Promise<Match[]> {
    try {
      // Usar UTC para evitar problemas de timezone
      // Crear fechas explícitamente en UTC para consulta
      const fromDateUTC = new Date(from + "T00:00:00.000Z");
      const toDateUTC = new Date(to + "T23:59:59.999Z");

      // console.log(
      //   `🔍 Querying Firestore for matches from ${fromDateUTC.toISOString()} to ${toDateUTC.toISOString()} (leagues: ${leagueIds.join(", ")})`
      // );

      // Consultar Firestore por fecha (sin filtro de liga) para obtener todos los partidos del día
      // Estrategia: Intentar consulta con índice primero, si falla, usar fallback sin filtro de fecha
      let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
      let usedIndexQuery = false;

      try {
        // Intentar consulta con índice (puede fallar si no existe el índice)
        const query = adminDb
          .collection("partidos")
          .where("fecha", ">=", Timestamp.fromDate(fromDateUTC))
          .where("fecha", "<=", Timestamp.fromDate(toDateUTC));

        snapshot = await query.get();
        usedIndexQuery = true;

        // console.log(
        //   `📊 Firestore query (with index) returned ${snapshot.size} documents for date range ${from} to ${to}`
        // );
      } catch (indexError: any) {
        // Si falla por índice, usar fallback: consultar todos los partidos y filtrar en memoria
        // console.log(
        //   `⚠️  Index query failed (${indexError?.code || indexError?.message}), using fallback: fetching all partidos and filtering in memory...`
        // );

        // Fallback: obtener todos los partidos (limitado a 1000 para evitar problemas de memoria)
        const allPartidosQuery = adminDb.collection("partidos").limit(1000);

        snapshot = await allPartidosQuery.get();
        usedIndexQuery = false;

        // console.log(
        //   `📊 Fallback query returned ${snapshot.size} documents (will filter by date in memory)`
        // );
      }

      // Filtrar partidos por fecha (si se usó fallback) y por ligas solicitadas
      const matchesByLeague: Map<number, Match[]> = new Map();
      const foundLeagueIds = new Set<number>();

      if (!snapshot.empty) {
        // Filtrar partidos por fecha si se usó fallback (si se usó índice, ya están filtrados)
        const filteredDocs = usedIndexQuery
          ? snapshot.docs
          : snapshot.docs.filter(doc => {
              const partido = doc.data() as Partido;
              const partidoDate = partido.fecha.toDate();
              // Normalizar fecha del partido a solo la fecha (sin hora) para comparar
              const partidoDateStr = partidoDate.toISOString().split("T")[0];
              const queryDateStr = fromDateUTC.toISOString().split("T")[0];

              // Comparar solo la fecha (sin hora) para evitar problemas de timezone
              const partidoDateNormalized = new Date(
                partidoDateStr + "T00:00:00.000Z"
              );
              const queryDateNormalized = new Date(
                queryDateStr + "T00:00:00.000Z"
              );

              return (
                partidoDateNormalized.getTime() ===
                queryDateNormalized.getTime()
              );
            });

        // console.log(
        //   `📋 Filtered ${filteredDocs.length} partidos by date ${from} (from ${snapshot.size} total)`
        // );

        // Log de depuración: mostrar IDs de partidos encontrados
        if (filteredDocs.length > 0) {
          const partidoIds = filteredDocs.slice(0, 5).map(doc => {
            const partido = doc.data() as Partido;
            const partidoDate = partido.fecha.toDate();
            return `${partido.id} (league ${partido.ligaId}, date: ${partidoDate.toISOString()})`;
          });
          // console.log(
          //   `📋 Found partido IDs in Firestore: ${partidoIds.join(", ")}${
          //     filteredDocs.length > 5
          //       ? ` ... and ${filteredDocs.length - 5} more`
          //       : ""
          //   }`
          // );
        }

        const partidosFiltrados = filteredDocs.filter(doc => {
          const partido = doc.data() as Partido;
          const ligaId = parseInt(partido.ligaId);
          return leagueIds.includes(ligaId);
        });

        const partidosConMatches = await Promise.all(
          partidosFiltrados.map(async doc => {
            const partido = doc.data() as PartidoWithTTL;
            const match = await this.convertPartidoToMatch(partido);
            return { partido, match };
          })
        );

        const staleLeagueIds = new Set<number>();
        for (const { partido } of partidosConMatches) {
          const ligaId = parseInt(partido.ligaId);
          if (this.isFixtureDataStale(partido)) {
            staleLeagueIds.add(ligaId);
          }
        }

        // Agrupar matches por liga
        for (const { partido, match } of partidosConMatches) {
          const ligaId = match.league.id;
          if (staleLeagueIds.has(ligaId)) {
            continue;
          }
          foundLeagueIds.add(ligaId);
          if (!matchesByLeague.has(ligaId)) {
            matchesByLeague.set(ligaId, []);
          }
          matchesByLeague.get(ligaId)!.push(match);
        }

        // Enriquecer partidos con detalles si faltan (stats, events, lineups)
        // Solo para partidos que necesitan detalles (finalizados o en progreso)
        const matchesNeedingDetails = partidosConMatches
          .filter(({ partido, match }) => {
            const ligaId = match.league.id;
            if (staleLeagueIds.has(ligaId)) {
              return false;
            }

            const needsDetails = [
              "FT",
              "AET",
              "PEN",
              "AWD",
              "WO",
              "1H",
              "2H",
              "LIVE",
              "ET",
              "P",
              "HT",
            ].includes(match.fixture.status.short);

            if (!needsDetails) {
              return false;
            }

            const hasAllDetails = !!match.statistics && !!match.events;
            const detailsStale = this.isDetailsDataStale(partido);

            return !hasAllDetails || detailsStale;
          })
          .map(({ match }) => match);

        if (matchesNeedingDetails.length > 0 && this.externalApi) {
          // Enriquecer solo los que necesitan detalles
          const enrichedMatches = await this.enrichMatchesWithDetails(
            matchesNeedingDetails
          );

          // Guardar los detalles enriquecidos en Firestore
          await this.saveMatchesToFirestore(enrichedMatches);

          // Actualizar los matches en matchesByLeague con los detalles enriquecidos
          const enrichedMap = new Map(
            enrichedMatches.map(m => [m.fixture.id, m])
          );

          // Reemplazar matches que fueron enriquecidos
          for (const [ligaId, matches] of matchesByLeague.entries()) {
            matchesByLeague.set(
              ligaId,
              matches.map(match => {
                const enriched = enrichedMap.get(match.fixture.id);
                return enriched || match;
              })
            );
          }
        }
      }

      // Identificar ligas que no tienen partidos en Firestore
      const missingLeagueIds = leagueIds.filter(id => !foundLeagueIds.has(id));

      // Consultar API externa solo para las ligas faltantes
      let externalMatches: Match[] = [];
      if (missingLeagueIds.length > 0 && this.externalApi) {
        // console.log(
        //   `⚠️  No matches found in Firestore for leagues ${missingLeagueIds.join(", ")} on ${from}, checking empty_queries cache...`
        // );

        // Log de depuración: mostrar qué ligas tienen partidos y cuáles no
        // console.log(
        //   `📊 League status: Found in Firestore: ${Array.from(foundLeagueIds).join(", ")}, Missing: ${missingLeagueIds.join(", ")}`
        // );

        // Verificar qué ligas realmente necesitan consultar la API (paralelizado con cache en memoria)
        const emptyQueryChecks = await Promise.all(
          missingLeagueIds.map(async leagueId => {
            const emptyQueryKey = `empty_fixtures_${leagueId}_${from}`;

            // Verificar cache en memoria primero
            const cached = this.emptyQueriesCache.get(emptyQueryKey);
            if (cached) {
              const age = Date.now() - cached.timestamp;
              // Para fechas lejanas (más de 30 días), usar TTL mucho más largo (1 año)
              const queryDate = new Date(from + "T00:00:00.000Z");
              const daysSinceQuery = (Date.now() - queryDate.getTime()) / (1000 * 60 * 60 * 24);
              const maxAgeMs = daysSinceQuery > 30 ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 año para fechas lejanas, 24h para recientes
              
              if (age < this.EMPTY_QUERIES_CACHE_TTL) {
                // Si no había partidos y fue consultado recientemente, no consultar API
                if (!cached.hasMatches && age < maxAgeMs) {
                  const hoursSinceCheck = age / (1000 * 60 * 60);
                  // console.log(
                  //   `💾 MEMORY CACHE: No matches found for league ${leagueId} on ${from} (checked ${hoursSinceCheck.toFixed(1)}h ago). Skipping API call.`
                  // );
                  return null; // No consultar esta liga
                }
              }
            }

            // Si no está en cache o expiró, consultar Firestore
            const emptyQueryDoc = await adminDb
              .collection("empty_queries")
              .doc(emptyQueryKey)
              .get();

            if (emptyQueryDoc.exists) {
              const emptyQuery = emptyQueryDoc.data();
              const lastChecked = emptyQuery?.last_checked?.toDate();
              const hoursSinceCheck = lastChecked
                ? (Date.now() - lastChecked.getTime()) / (1000 * 60 * 60)
                : Infinity;

              // Actualizar cache en memoria
              this.emptyQueriesCache.set(emptyQueryKey, {
                hasMatches: emptyQuery?.has_matches === true,
                timestamp: lastChecked?.getTime() || Date.now(),
              });

              // Para fechas lejanas (más de 30 días), usar TTL mucho más largo (1 año)
              // ya que los datos históricos no cambian
              const queryDate = new Date(from + "T00:00:00.000Z");
              const daysSinceQuery = (Date.now() - queryDate.getTime()) / (1000 * 60 * 60 * 24);
              const maxHoursSinceCheck = daysSinceQuery > 30 ? 365 * 24 : 24; // 1 año para fechas lejanas, 24h para recientes

              // Si consultamos hace menos del tiempo máximo y no había partidos, no consultar la API
              if (hoursSinceCheck < maxHoursSinceCheck && emptyQuery?.has_matches === false) {
                // console.log(
                //   `ℹ️  No matches found for league ${leagueId} on ${from} (checked ${hoursSinceCheck.toFixed(1)}h ago). Skipping API call.`
                // );
                return null; // No consultar esta liga
              }
            }

            return leagueId; // Consultar esta liga
          })
        );

        const leaguesToQuery = emptyQueryChecks.filter(
          (id): id is number => id !== null
        );

        // Consultar API externa solo para las ligas que realmente lo necesitan
        if (leaguesToQuery.length > 0) {
          // console.log(
          //   `📡 Fetching from external API for leagues: ${leaguesToQuery.join(", ")}`
          // );

          const externalMatchesPromises = await Promise.all(
            leaguesToQuery.map(async leagueId => {
              try {
                const matches =
                  await this.externalApi!.getFixturesByDateAndLeague(
                    from,
                    leagueId
                  );

                // Guardar información sobre si hay partidos o no
                const emptyQueryKey = `empty_fixtures_${leagueId}_${from}`;
                const hasMatches = matches.length > 0;

                // Actualizar cache en memoria
                this.emptyQueriesCache.set(emptyQueryKey, {
                  hasMatches,
                  timestamp: Date.now(),
                });

                await adminDb
                  .collection("empty_queries")
                  .doc(emptyQueryKey)
                  .set(
                    {
                      leagueId: leagueId.toString(),
                      date: from,
                      has_matches: hasMatches,
                      last_checked: Timestamp.now(),
                      fecha_creacion: Timestamp.now(),
                      fecha_actualizacion: Timestamp.now(),
                    },
                    { merge: true }
                  );

                return matches;
              } catch (error) {
                // console.error(
                //   `Error fetching matches for league ${leagueId}:`,
                //   error
                // );
                return [];
              }
            })
          );

          externalMatches = externalMatchesPromises.flat();

          // Guardar partidos en Firestore solo si hay partidos
          if (externalMatches.length > 0) {
            // Enriquecer partidos con detalles (stats, events, lineups) si no los tienen
            const enrichedMatches =
              await this.enrichMatchesWithDetails(externalMatches);
            await this.saveMatchesToFirestore(enrichedMatches);

            // Agrupar partidos por liga
            for (const match of enrichedMatches) {
              const ligaId = match.league.id;
              if (leagueIds.includes(ligaId)) {
                if (!matchesByLeague.has(ligaId)) {
                  matchesByLeague.set(ligaId, []);
                }
                matchesByLeague.get(ligaId)!.push(match);
              }
            }
          }
        } else {
          // console.log(
          //   `ℹ️  All missing leagues were checked recently and had no matches. Skipping API calls.`
          // );
        }
      }

      // Combinar partidos de Firestore y API externa
      const allMatches: Match[] = [];
      for (const leagueId of leagueIds) {
        if (matchesByLeague.has(leagueId)) {
          allMatches.push(...matchesByLeague.get(leagueId)!);
        }
      }

      // console.log(
      //   `✅ Found ${allMatches.length} total matches for ${from} to ${to} (leagues: ${leagueIds.join(", ")})`
      // );
      // console.log(
      //   `📊 Breakdown: ${Array.from(matchesByLeague.entries())
      //     .map(
      //       ([leagueId, matches]) =>
      //         `League ${leagueId}: ${matches.length} matches`
      //     )
      //     .join(", ")}`
      // );
      if (missingLeagueIds.length > 0) {
        // console.log(
        //   `ℹ️  No matches found for leagues: ${missingLeagueIds.join(", ")} (checked empty_queries cache)`
        // );
      }

      return allMatches;
    } catch (error: any) {
      // console.error("Error getting fixtures for multiple leagues:", error);

      // Si hay un error de índice, hacer fallback a consultas individuales
      if (error?.code === 9 || error?.message?.includes("index")) {
        // console.log(
        //   `⚠️  Firestore index error, falling back to individual league queries... (Error: ${error.message})`
        // );

        // Fallback: consultar cada liga individualmente
        try {
          const allMatches = await Promise.all(
            leagueIds.map(leagueId => this.getFixtures(from, to, leagueId))
          );
          return allMatches.flat();
        } catch (fallbackError) {
          // console.error("Error in fallback query:", fallbackError);
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Obtiene standings desde Firestore, si no hay, consulta la API externa
   */
  async getStandings(
    leagueId: number,
    season: number
  ): Promise<{
    standings: any[];
    league: any;
  }> {
    try {
      // Consultar Firestore primero
      const standingsId = `standings_${leagueId}_${season}`;
      const standingsDoc = await adminDb
        .collection("standings")
        .doc(standingsId)
        .get();

      if (standingsDoc.exists) {
        // console.log(
        //   `✅ Found standings in Firestore for league ${leagueId}, season ${season}`
        // );
        const standing = standingsDoc.data() as Standing;
        // Consulta a ligas puede hacerse en paralelo si se necesita en el futuro
        const ligaDoc = await adminDb
          .collection("ligas")
          .doc(leagueId.toString())
          .get();
        const liga = ligaDoc.exists ? (ligaDoc.data() as Liga) : null;

        return {
          standings: standing.posiciones.map(pos => ({
            rank: pos.posicion,
            team: {
              id: parseInt(pos.equipo.id),
              name: pos.equipo.nombre,
              logo: pos.equipo.logo,
            },
            points: pos.puntos,
            played: pos.partidos_jugados,
            win: pos.ganados,
            draw: pos.empatados,
            lose: pos.perdidos,
            goals: {
              for: pos.goles.a_favor,
              against: pos.goles.en_contra,
            },
            form: pos.forma || "",
          })),
          league: liga
            ? {
                id: parseInt(liga.id),
                name: liga.nombre,
                logo: liga.logo,
                country: liga.pais,
                season: parseInt(liga.temporada_actual),
              }
            : {
                id: leagueId,
                name: `Liga ${leagueId}`,
                logo: `https://media.api-sports.io/football/leagues/${leagueId}.png`,
                country: "",
                season,
              },
        };
      }

      // Si no hay datos en Firestore, consultar API externa
      // console.log(
      //   `⚠️  No standings found in Firestore, fetching from external API...`
      // );
      if (!this.externalApi) {
        throw new Error("FOOTBALL_API_KEY not configured");
      }

      const standingsResponse = await this.externalApi.getStandings(
        leagueId,
        season
      );

      if (!standingsResponse || standingsResponse.length === 0) {
        throw new Error("No standings data found");
      }

      // Guardar en Firestore
      await this.saveStandingsToFirestore(standingsResponse, leagueId, season);

      // Formatear respuesta
      const standings = standingsResponse[0]?.league?.standings?.[0] || [];
      const leagueData = standingsResponse[0]?.league || {};

      return {
        standings: standings.map((team: any) => ({
          rank: team.rank,
          team: {
            id: team.team.id,
            name: team.team.name,
            logo: team.team.logo,
          },
          points: team.points,
          played: team.all.played,
          win: team.all.win,
          draw: team.all.draw,
          lose: team.all.lose,
          goals: {
            for: team.all.goals.for,
            against: team.all.goals.against,
          },
          form: team.form || "",
        })),
        league: {
          id: (leagueData as any).id || leagueId,
          name: (leagueData as any).name || `Liga ${leagueId}`,
          logo:
            (leagueData as any).logo ||
            `https://media.api-sports.io/football/leagues/${leagueId}.png`,
          country: (leagueData as any).country?.name || "",
          season: (leagueData as any).season || season,
        },
      };
    } catch (error) {
      // console.error("Error getting standings:", error);
      throw error;
    }
  }

  /**
   * Obtiene equipos desde Firestore, si no hay, consulta la API externa
   */
  async getTeams(leagueId?: number): Promise<Team[]> {
    try {
      // Consultar Firestore primero
      let query: admin.firestore.Query<admin.firestore.DocumentData> =
        adminDb.collection("equipos");
      if (leagueId) {
        query = query.where("ligaId", "==", leagueId.toString());
      }

      const snapshot = await query.limit(100).get();

      if (!snapshot.empty) {
        // console.log(
        //   `✅ Found ${snapshot.size} teams in Firestore${leagueId ? ` for league ${leagueId}` : ""}`
        // );
        return snapshot.docs.map(doc => {
          const equipo = doc.data() as Equipo;
          return {
            id: parseInt(equipo.id),
            name: equipo.nombre,
            logo: equipo.escudo,
          };
        });
      }

      // Si no hay datos en Firestore, consultar API externa
      // console.log(
      //   `⚠️  No teams found in Firestore, fetching from external API...`
      // );
      if (!this.externalApi) {
        return [];
      }

      // La API externa requiere leagueId para obtener equipos
      if (!leagueId) {
        return [];
      }

      const currentSeason = new Date().getFullYear();
      const teamsResponse = await this.externalApi.getTeamsByLeague(
        leagueId,
        currentSeason
      );
      if (!teamsResponse || teamsResponse.length === 0) {
        return [];
      }

      // Guardar en Firestore
      const teamsToSave = teamsResponse.map((team: any) => ({
        id: team.id,
        name: team.name,
        logo: team.logo,
      }));
      await this.saveTeamsToFirestore(teamsToSave, leagueId);

      return teamsResponse.map((team: any) => ({
        id: team.id,
        name: team.name,
        logo: team.logo,
      }));
    } catch (error) {
      // console.error("Error getting teams:", error);
      return [];
    }
  }

  /**
   * Obtiene un equipo por ID desde Firestore, si no hay, consulta la API externa
   */
  async getTeamById(teamId: number): Promise<Team | null> {
    try {
      // Consultar Firestore primero
      const equipoDoc = await adminDb
        .collection("equipos")
        .doc(teamId.toString())
        .get();

      if (equipoDoc.exists) {
        // console.log(`✅ Found team ${teamId} in Firestore`);
        const equipo = equipoDoc.data() as Equipo;
        return {
          id: parseInt(equipo.id),
          name: equipo.nombre,
          logo: equipo.escudo,
        };
      }

      // Si no hay datos en Firestore, consultar API externa
      // console.log(
      //   `⚠️  Team ${teamId} not found in Firestore, fetching from external API...`
      // );
      if (!this.externalApi) {
        return null;
      }

      // La API externa no tiene endpoint directo para obtener un equipo por ID
      // Necesitamos obtenerlo desde los partidos o desde una liga
      // Por ahora, retornar null y dejar que el endpoint maneje la API externa
      return null;
    } catch (error) {
      // console.error("Error getting team:", error);
      return null;
    }
  }

  /**
   * Obtiene partidos de un equipo desde Firestore
   */
  async getTeamMatches(teamId: number, season?: number): Promise<Match[]> {
    try {
      const teamIdStr = teamId.toString();
      const seasonYear = season || new Date().getFullYear();

      // Consultar Firestore - partidos donde el equipo es local o visitante
      const localMatchesQuery = adminDb
        .collection("partidos")
        .where("equipo_local.id", "==", teamIdStr);

      const awayMatchesQuery = adminDb
        .collection("partidos")
        .where("equipo_visitante.id", "==", teamIdStr);

      const [localSnapshot, awaySnapshot] = await Promise.all([
        localMatchesQuery.get(),
        awayMatchesQuery.get(),
      ]);

      const allDocs = [...localSnapshot.docs, ...awaySnapshot.docs];

      // Eliminar duplicados (por si hay algún partido que aparece en ambas queries)
      const uniqueDocs = allDocs.filter(
        (doc, index, self) => index === self.findIndex(d => d.id === doc.id)
      );

      if (uniqueDocs.length > 0) {
        // console.log(
        //   `✅ Found ${uniqueDocs.length} matches for team ${teamId} in Firestore`
        // );
        const matches = await Promise.all(
          uniqueDocs.map(doc =>
            this.convertPartidoToMatch(doc.data() as Partido)
          )
        );

        // Filtrar por temporada si se especifica
        if (season) {
          return matches.filter(match => {
            const matchDate = new Date(match.fixture.date);
            return matchDate.getFullYear() === seasonYear;
          });
        }

        return matches;
      }

      // Si no hay datos en Firestore, retornar array vacío
      // El endpoint puede consultar la API externa si es necesario
      // console.log(
      //   `⚠️  No matches found in Firestore for team ${teamId}, will fetch from external API`
      // );
      return [];
    } catch (error) {
      // console.error("Error getting team matches:", error);
      return [];
    }
  }

  /**
   * Obtiene ligas desde Firestore, si no hay, consulta la API externa
   */
  async getLeagues(country?: string): Promise<League[]> {
    try {
      // Consultar Firestore primero
      let query: admin.firestore.Query<admin.firestore.DocumentData> =
        adminDb.collection("ligas");
      if (country) {
        query = query.where("pais", "==", country);
      }

      const snapshot = await query.get();

      if (!snapshot.empty) {
        // console.log(
        //   `✅ Found ${snapshot.size} leagues in Firestore${country ? ` for country ${country}` : ""}`
        // );
        return snapshot.docs.map(doc => {
          const liga = doc.data() as Liga;
          return {
            id: parseInt(liga.id),
            name: liga.nombre,
            logo: liga.logo,
            country: liga.pais,
          };
        });
      }

      // Si no hay datos en Firestore, consultar API externa
      // console.log(
      //   `⚠️  No leagues found in Firestore, fetching from external API...`
      // );
      if (!this.externalApi) {
        return [];
      }

      const leaguesResponse = country
        ? await this.externalApi.getLeaguesByCountry(country)
        : await this.externalApi.getLeagues();

      if (!leaguesResponse || leaguesResponse.length === 0) {
        return [];
      }

      // Guardar en Firestore
      await this.saveLeaguesToFirestore(leaguesResponse);

      return leaguesResponse.map((league: any) => ({
        id: league.id,
        name: league.name,
        logo: league.logo,
        country: league.country?.name || country || "",
      }));
    } catch (error) {
      // console.error("Error getting leagues:", error);
      return [];
    }
  }

  /**
   * Convierte un Partido de Firestore a Match de la API
   */
  private async convertPartidoToMatch(partido: Partido): Promise<Match> {
    // Obtener información de la liga
    let leagueInfo = {
      id: parseInt(partido.ligaId),
      name: `Liga ${partido.ligaId}`,
      logo: `https://media.api-sports.io/football/leagues/${partido.ligaId}.png`,
      country: "",
    };

    try {
      const ligaDoc = await adminDb
        .collection("ligas")
        .doc(partido.ligaId)
        .get();
      if (ligaDoc.exists) {
        const liga = ligaDoc.data() as Liga;
        leagueInfo = {
          id: parseInt(liga.id),
          name: liga.nombre,
          logo: liga.logo,
          country: liga.pais,
        };
      }
    } catch (error) {
      // console.error(`Error getting league info for ${partido.ligaId}:`, error);
    }

    const match: Match = {
      league: leagueInfo,
      fixture: {
        id: parseInt(partido.id),
        date: partido.fecha.toDate().toISOString(),
        status: {
          long: partido.estado.largo,
          short: partido.estado.corto,
          elapsed: partido.estado.tiempo_transcurrido || null,
        },
      },
      teams: {
        home: {
          id: parseInt(partido.equipo_local.id),
          name: partido.equipo_local.nombre,
          logo: partido.equipo_local.logo,
        },
        away: {
          id: parseInt(partido.equipo_visitante.id),
          name: partido.equipo_visitante.nombre,
          logo: partido.equipo_visitante.logo,
        },
      },
      goals: {
        home: partido.goles.local,
        away: partido.goles.visitante,
      },
    };

    if (partido.estadisticas) {
      try {
        const localStats = partido.estadisticas.local || [];
        const awayStats = partido.estadisticas.visitante || [];

        if (localStats.length > 0 || awayStats.length > 0) {
          match.statistics = {
            home: localStats.map(stat => ({
              type: stat.tipo as any,
              value: stat.valor,
            })),
            away: awayStats.map(stat => ({
              type: stat.tipo as any,
              value: stat.valor,
            })),
          };
          // console.log(
          //   `✅ Statistics loaded from Firestore for match ${partido.id}: ${localStats.length} home, ${awayStats.length} away`
          // );
        } else {
          // console.log(
          //   `⚠️  Match ${partido.id} has estadisticas field but arrays are empty`
          // );
        }
      } catch (error) {
        console.error(
          `Error mapping statistics for match ${partido.id}:`,
          error
        )
      }
    } else {
      // Solo mostrar advertencia si el partido debería tener estadísticas (finalizado o en progreso)
      const shouldHaveStats = [
        "FT",
        "AET",
        "PEN",
        "AWD",
        "WO",
        "1H",
        "2H",
        "LIVE",
        "ET",
        "P",
        "HT",
      ].includes(partido.estado.corto);

      if (shouldHaveStats) {
        // console.log(
        //   `ℹ️  Match ${partido.id} (${partido.estado.corto}) does not have estadisticas field in Firestore - will be enriched if needed`
        // );
      }
      // Si el partido no ha comenzado o está programado, es normal que no tenga estadísticas
    }

    if (partido.eventos) {
      try {
        match.events = {
          home: partido.eventos.local.map(event => ({
            type: event.tipo as any,
            time: {
              elapsed: event.tiempo.transcurrido,
              extra: event.tiempo.extra,
            },
            team: {
              id: parseInt(partido.equipo_local.id),
              name: partido.equipo_local.nombre,
              logo: partido.equipo_local.logo,
            },
            player: {
              id: parseInt(event.jugador.id),
              name: event.jugador.nombre,
            },
            assist: event.asistencia
              ? {
                  id: event.asistencia.id
                    ? parseInt(event.asistencia.id)
                    : null,
                  name: event.asistencia.nombre || null,
                }
              : {
                  id: null,
                  name: null,
                },
            detail: event.detalle,
            comments: event.comentario || null,
          })),
          away: partido.eventos.visitante.map(event => ({
            type: event.tipo as any,
            time: {
              elapsed: event.tiempo.transcurrido,
              extra: event.tiempo.extra,
            },
            team: {
              id: parseInt(partido.equipo_visitante.id),
              name: partido.equipo_visitante.nombre,
              logo: partido.equipo_visitante.logo,
            },
            player: {
              id: parseInt(event.jugador.id),
              name: event.jugador.nombre,
            },
            assist: event.asistencia
              ? {
                  id: event.asistencia.id
                    ? parseInt(event.asistencia.id)
                    : null,
                  name: event.asistencia.nombre || null,
                }
              : {
                  id: null,
                  name: null,
                },
            detail: event.detalle,
            comments: event.comentario || null,
          })),
        };
      } catch (error) {
        // console.error(`Error mapping events for match ${partido.id}:`, error);
      }
    }

    // Obtener lineups desde la colección formaciones
    try {
      const lineups = await this.getLineupsFromFormaciones(partido.id);
      if (lineups && lineups.home && lineups.away) {
        match.lineups = lineups;
      }
    } catch (error) {
      // console.error(`Error getting lineups for match ${partido.id}:`, error);
    }

    return match;
  }

  /**
   * Obtiene lineups desde la colección formaciones
   */
  private async getLineupsFromFormaciones(
    partidoId: string
  ): Promise<{ home: any; away: any } | null> {
    try {
      const formacionesSnapshot = await adminDb
        .collection("formaciones")
        .where("partidoId", "==", partidoId)
        .get();

      if (formacionesSnapshot.empty) {
        return null;
      }

      const formaciones = formacionesSnapshot.docs.map(doc =>
        doc.data()
      ) as Formacion[];

      // Debe haber 2 formaciones (local y visitante)
      if (formaciones.length < 2) {
        return null;
      }

      // Obtener el partido para identificar qué equipo es local y cuál visitante
      const partidoDoc = await adminDb
        .collection("partidos")
        .doc(partidoId)
        .get();

      if (!partidoDoc.exists) {
        return null;
      }

      const partido = partidoDoc.data() as Partido;
      const localTeamId = partido.equipo_local.id;
      const awayTeamId = partido.equipo_visitante.id;

      // Encontrar la formación local y visitante
      const formacionLocal = formaciones.find(f => f.equipoId === localTeamId);
      const formacionVisitante = formaciones.find(
        f => f.equipoId === awayTeamId
      );

      if (!formacionLocal || !formacionVisitante) {
        return null;
      }

      // Convertir formaciones a LineupTeam
      const convertFormacionToLineupTeam = (formacion: Formacion) => {
        const teamName =
          formacion.equipoId === localTeamId
            ? partido.equipo_local.nombre
            : partido.equipo_visitante.nombre;
        const teamLogo =
          formacion.equipoId === localTeamId
            ? partido.equipo_local.logo
            : partido.equipo_visitante.logo;

        return {
          team: {
            id: parseInt(formacion.equipoId),
            name: teamName,
            logo: teamLogo,
            colors: formacion.colores
              ? {
                  player: {
                    primary: formacion.colores.jugador.principal,
                    number: formacion.colores.jugador.numero,
                    border: formacion.colores.jugador.borde,
                  },
                  goalkeeper: {
                    primary: formacion.colores.portero.principal,
                    number: formacion.colores.portero.numero,
                    border: formacion.colores.portero.borde,
                  },
                }
              : {
                  player: {
                    primary: "#000000",
                    number: "#FFFFFF",
                    border: "#000000",
                  },
                  goalkeeper: {
                    primary: "#000000",
                    number: "#FFFFFF",
                    border: "#000000",
                  },
                },
          },
          coach: {
            id: parseInt(formacion.entrenador.id),
            name: formacion.entrenador.nombre,
            photo: formacion.entrenador.foto || "",
          },
          formation: formacion.formacion,
          startXI: formacion.alineacion.map(jugador => ({
            player: {
              id: parseInt(jugador.jugadorId),
              name: jugador.nombre,
              number: jugador.dorsal,
              pos: jugador.posicion,
              grid: jugador.grid || "",
            },
          })),
          substitutes: formacion.suplentes.map(jugador => ({
            player: {
              id: parseInt(jugador.jugadorId),
              name: jugador.nombre,
              number: jugador.dorsal || null,
              pos: jugador.posicion || null,
              grid: jugador.grid || null,
            },
          })),
        };
      };

      return {
        home: convertFormacionToLineupTeam(formacionLocal),
        away: convertFormacionToLineupTeam(formacionVisitante),
      };
    } catch (error) {
      // console.error(
      //   `Error getting lineups from formaciones for match ${partidoId}:`,
      //   error
      // );
      return null;
    }
  }

  /**
   * Enriquece partidos con detalles (stats, events, lineups) desde la API externa
   * Solo obtiene detalles si no están presentes en el partido
   * Esta función se llama cuando se guardan partidos desde la API externa
   * Método público para uso desde endpoints
   */
  public async enrichMatchesWithDetails(matches: Match[]): Promise<Match[]> {
    if (!this.externalApi || matches.length === 0) {
      return matches;
    }

    const detailsToFetch: Array<{
      match: Match;
      needsStats: boolean;
      needsEvents: boolean;
      needsLineups: boolean;
    }> = [];
    const matchesWithoutDetails: Match[] = [];

    // Primero, verificar qué detalles faltan para cada partido
    for (const match of matches) {
      const needsDetails = [
        "FT",
        "AET",
        "PEN",
        "AWD",
        "WO",
        "1H",
        "2H",
        "LIVE",
        "ET",
        "P",
        "HT",
      ].includes(match.fixture.status.short);

      if (needsDetails) {
        detailsToFetch.push({
          match,
          needsStats: !match.statistics,
          needsEvents: !match.events,
          needsLineups:
            !match.lineups &&
            [
              "FT",
              "AET",
              "PEN",
              "AWD",
              "WO",
              "1H",
              "2H",
              "LIVE",
              "ET",
              "P",
              "HT",
            ].includes(match.fixture.status.short),
        });
      } else {
        // Si no necesita detalles, agregar directamente
        matchesWithoutDetails.push(match);
      }
    }

    // Si no hay partidos que necesiten detalles, retornar directamente
    if (detailsToFetch.length === 0) {
      return matchesWithoutDetails;
    }

    // Procesar en batches paralelos (máximo 5 partidos a la vez para respetar rate limits)
    const BATCH_SIZE = 5;
    const enrichedMatches: Match[] = [...matchesWithoutDetails];

    for (let i = 0; i < detailsToFetch.length; i += BATCH_SIZE) {
      const batch = detailsToFetch.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ({ match, needsStats, needsEvents, needsLineups }) => {
          try {
            const enrichedMatch = { ...match };
            const promises: Promise<void>[] = [];

            // Obtener stats si no están presentes
            if (needsStats) {
              promises.push(
                this.externalApi!.getMatchStats(match)
                  .then(stats => {
                    if (
                      stats &&
                      (stats.home.length > 0 || stats.away.length > 0)
                    ) {
                      enrichedMatch.statistics = stats;
                    }
                  })
                  .catch(error => {
                    // console.error(
                    //   `Error getting stats for match ${match.fixture.id}:`,
                    //   error
                    // );
                  })
              );
            }

            // Obtener events si no están presentes
            if (needsEvents) {
              promises.push(
                this.externalApi!.getMatchEvents(match)
                  .then(events => {
                    if (
                      events &&
                      (events.home.length > 0 || events.away.length > 0)
                    ) {
                      enrichedMatch.events = events;
                    }
                  })
                  .catch(error => {
                    // console.error(
                    //   `Error getting events for match ${match.fixture.id}:`,
                    //   error
                    // );
                  })
              );
            }

            // Obtener lineups si no están presentes
            if (needsLineups) {
              promises.push(
                this.externalApi!.getMatchLineups(
                  match.fixture.id.toString(),
                  match.teams.home.id.toString(),
                  match.teams.away.id.toString()
                )
                  .then(lineups => {
                    if (lineups && lineups.home && lineups.away) {
                      enrichedMatch.lineups = {
                        home: lineups.home,
                        away: lineups.away,
                      };
                      // Guardar lineups en la colección formaciones (no bloqueante)
                      this.saveLineupsToFormaciones(
                        match,
                        enrichedMatch.lineups
                      ).catch(error => {
                        // console.error(
                        //   `Error saving lineups for match ${match.fixture.id}:`,
                        //   error
                        // );
                      });
                    }
                  })
                  .catch(error => {
                    // console.error(
                    //   `Error getting lineups for match ${match.fixture.id}:`,
                    //   error
                    // );
                  })
              );
            }

            // Esperar todas las promesas en paralelo
            await Promise.all(promises);
            return enrichedMatch;
          } catch (error) {
            // console.error(`Error enriching match ${match.fixture.id}:`, error);
            return match; // Si hay error, retornar el partido sin enriquecer
          }
        })
      );

      enrichedMatches.push(...batchResults);

      // Rate limiting: esperar 200ms entre batches (excepto el último)
      if (i + BATCH_SIZE < detailsToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return enrichedMatches;
  }

  /**
   * Enriquece partidos con detalles si faltan (método público para uso desde endpoints)
   * Verifica primero en Firestore si los detalles ya están guardados
   */
  async enrichMatchesWithDetailsIfMissing(matches: Match[]): Promise<Match[]> {
    if (matches.length === 0) {
      return matches;
    }

    const enrichedMatches: Match[] = [];

    for (const match of matches) {
      try {
        // Verificar si el partido ya tiene todos los detalles en Firestore
        const partidoDoc = await adminDb
          .collection("partidos")
          .doc(match.fixture.id.toString())
          .get();

        if (partidoDoc.exists) {
          const partido = partidoDoc.data() as Partido;

          // Si el partido ya tiene stats y events en Firestore, usar esos
          if (partido.estadisticas && partido.eventos) {
            const matchFromFirestore =
              await this.convertPartidoToMatch(partido);
            enrichedMatches.push(matchFromFirestore);
            continue;
          }
        }

        // Si no tiene todos los detalles, enriquecer desde la API externa
        const enriched = await this.enrichMatchesWithDetails([match]);
        enrichedMatches.push(enriched[0] || match);
      } catch (error) {
        // console.error(`Error enriching match ${match.fixture.id}:`, error);
        // Si hay error, agregar el partido sin enriquecer
        enrichedMatches.push(match);
      }
    }

    return enrichedMatches;
  }

  /**
   * Guarda lineups en la colección formaciones
   */
  private async saveLineupsToFormaciones(
    match: Match,
    lineups: { home: any; away: any }
  ): Promise<void> {
    try {
      const batch = adminDb.batch();
      const now = Timestamp.now();
      const matchDate = new Date(match.fixture.date);
      const dateStr = matchDate.toISOString().split("T")[0]; // YYYY-MM-DD

      // Guardar formación local
      if (lineups.home) {
        const formacionLocalId = `form_${match.teams.home.id}_${match.fixture.id}_${dateStr}`;
        const formacionLocal: Formacion = {
          id: formacionLocalId,
          equipoId: match.teams.home.id.toString(),
          partidoId: match.fixture.id.toString(),
          fecha: dateStr,
          competicion: match.league.name,
          ligaId: match.league.id.toString(),
          formacion: lineups.home.formation || "",
          entrenador: {
            id: lineups.home.coach?.id?.toString() || "",
            nombre: lineups.home.coach?.name || "",
            ...(lineups.home.coach?.photo && {
              foto: lineups.home.coach.photo,
            }),
          },
          alineacion: (lineups.home.startXI || []).map((player: any) => ({
            jugadorId: player.player.id.toString(),
            nombre: player.player.name,
            dorsal: player.player.number || 0,
            posicion: player.player.pos || "",
            grid: player.player.grid || null,
            es_titular: true,
          })),
          suplentes: (lineups.home.substitutes || []).map((player: any) => ({
            jugadorId: player.player.id.toString(),
            nombre: player.player.name,
            dorsal: player.player.number || 0,
            posicion: player.player.pos || "",
            grid: player.player.grid || null,
            es_titular: false,
          })),
          ...(lineups.home.team?.colors && {
            colores: {
              jugador: {
                principal: lineups.home.team.colors.player.primary,
                numero: lineups.home.team.colors.player.number,
                borde: lineups.home.team.colors.player.border,
              },
              portero: {
                principal: lineups.home.team.colors.goalkeeper.primary,
                numero: lineups.home.team.colors.goalkeeper.number,
                borde: lineups.home.team.colors.goalkeeper.border,
              },
            },
          }),
          fecha_creacion: now,
          fecha_actualizacion: now,
          ttl_expiracion: Timestamp.fromMillis(
            Date.now() + calculateLineupsTtlMs()
          ),
        };

        const formacionLocalRef = adminDb
          .collection("formaciones")
          .doc(formacionLocalId);
        batch.set(formacionLocalRef, formacionLocal, { merge: true });
      }

      // Guardar formación visitante
      if (lineups.away) {
        const formacionVisitanteId = `form_${match.teams.away.id}_${match.fixture.id}_${dateStr}`;
        const formacionVisitante: Formacion = {
          id: formacionVisitanteId,
          equipoId: match.teams.away.id.toString(),
          partidoId: match.fixture.id.toString(),
          fecha: dateStr,
          competicion: match.league.name,
          ligaId: match.league.id.toString(),
          formacion: lineups.away.formation || "",
          entrenador: {
            id: lineups.away.coach?.id?.toString() || "",
            nombre: lineups.away.coach?.name || "",
            ...(lineups.away.coach?.photo && {
              foto: lineups.away.coach.photo,
            }),
          },
          alineacion: (lineups.away.startXI || []).map((player: any) => ({
            jugadorId: player.player.id.toString(),
            nombre: player.player.name,
            dorsal: player.player.number || 0,
            posicion: player.player.pos || "",
            grid: player.player.grid || null,
            es_titular: true,
          })),
          suplentes: (lineups.away.substitutes || []).map((player: any) => ({
            jugadorId: player.player.id.toString(),
            nombre: player.player.name,
            dorsal: player.player.number || 0,
            posicion: player.player.pos || "",
            grid: player.player.grid || null,
            es_titular: false,
          })),
          ...(lineups.away?.team?.colors && {
            colores: {
              jugador: {
                principal: lineups.away.team.colors.player.primary,
                numero: lineups.away.team.colors.player.number,
                borde: lineups.away.team.colors.player.border,
              },
              portero: {
                principal: lineups.away.team.colors.goalkeeper.primary,
                numero: lineups.away.team.colors.goalkeeper.number,
                borde: lineups.away.team.colors.goalkeeper.border,
              },
            },
          }),
          fecha_creacion: now,
          fecha_actualizacion: now,
          ttl_expiracion: Timestamp.fromMillis(
            Date.now() + calculateLineupsTtlMs()
          ),
        };

        const formacionVisitanteRef = adminDb
          .collection("formaciones")
          .doc(formacionVisitanteId);
        batch.set(formacionVisitanteRef, formacionVisitante, { merge: true });
      }

      await batch.commit();
    } catch (error) {
      // console.error(
      //   `Error saving lineups to formaciones for match ${match.fixture.id}:`,
      //   error
      // );
    }
  }

  /**
   * Guarda partidos en Firestore (método público)
   */
  public async saveMatchesToFirestore(matches: Match[]): Promise<void> {
    const batch = adminDb.batch();
    const now = Timestamp.now();

    // Obtener todos los documentos existentes de una vez para preservar datos
    const matchIds = matches.map(m => m.fixture.id.toString());
    const existingDocs = await Promise.all(
      matchIds.map(id => adminDb.collection("partidos").doc(id).get())
    );

    const existingPartidosMap = new Map<string, Partido>();
    existingDocs.forEach((doc, index) => {
      if (doc.exists) {
        existingPartidosMap.set(matchIds[index], doc.data() as Partido);
      }
    });

    for (const match of matches) {
      const matchId = match.fixture.id.toString();
      const existingPartido = existingPartidosMap.get(matchId) || null;

      // Construir estado sin undefined
      const estado: any = {
        largo: match.fixture.status.long,
        corto: match.fixture.status.short,
      };
      // Solo agregar tiempo_transcurrido si existe
      if (
        match.fixture.status.elapsed !== null &&
        match.fixture.status.elapsed !== undefined
      ) {
        estado.tiempo_transcurrido = match.fixture.status.elapsed;
      }

      // Guardar fecha tal cual viene de la API (preserva hora del partido)
      // match.fixture.date viene como ISO string (ej: "2025-11-02T15:00:00+00:00")
      // JavaScript interpreta esto correctamente y lo convierte a UTC
      const matchDate = new Date(match.fixture.date);

      const partido: Partido = {
        id: match.fixture.id.toString(),
        ligaId: match.league.id.toString(),
        fecha: Timestamp.fromDate(matchDate),
        estado: estado,
        equipo_local: {
          id: match.teams.home.id.toString(),
          nombre: match.teams.home.name,
          logo: match.teams.home.logo,
        },
        equipo_visitante: {
          id: match.teams.away.id.toString(),
          nombre: match.teams.away.name,
          logo: match.teams.away.logo,
        },
        goles: {
          local: match.goals.home,
          visitante: match.goals.away,
        },
        fecha_creacion: existingPartido?.fecha_creacion || now,
        fecha_actualizacion: now,
      };

      const fixtureTtlMs = calculateFixtureTtlMs(matchDate, estado.corto);
      partido.ttl_fixture = Timestamp.fromMillis(Date.now() + fixtureTtlMs);

      if (match.statistics) {
        // Filtrar estadísticas válidas (excluir null/undefined) y convertir valores
        const filterStats = (
          stats: Array<{ type: string; value: string | number | null }>
        ) => {
          return stats
            .filter(stat => stat.value !== null && stat.value !== undefined)
            .map(stat => ({
              tipo: stat.type,
              valor: stat.value as string | number, // Ya filtramos null/undefined
            }));
        };

        const localStats = filterStats(match.statistics.home);
        const awayStats = filterStats(match.statistics.away);

        // console.log(
        //   `💾 Saving statistics for match ${match.fixture.id}: ${match.statistics.home.length} home stats (filtered: ${localStats.length}), ${match.statistics.away.length} away stats (filtered: ${awayStats.length})`
        // );

        // Solo guardar estadísticas si hay al menos una
        if (localStats.length > 0 || awayStats.length > 0) {
          partido.estadisticas = {
            local: localStats,
            visitante: awayStats,
          };
          // console.log(
          //   `✅ Statistics saved to partido ${match.fixture.id}: ${localStats.length} local, ${awayStats.length} visitante`
          // );
        } else {
          // console.log(
          //   `⚠️  No valid statistics to save for match ${match.fixture.id} (all filtered out)`
          // );
          // Preservar estadísticas existentes si no hay nuevas válidas
          if (existingPartido?.estadisticas) {
            partido.estadisticas = existingPartido.estadisticas;
            // console.log(
            //   `✅ Preserved existing statistics for match ${match.fixture.id}`
            // );
          }
        }
      } else {
        // console.log(
        //   `⚠️  Match ${match.fixture.id} does NOT have statistics to save`
        // );
        // Preservar estadísticas existentes si no hay nuevas
        if (existingPartido?.estadisticas) {
          partido.estadisticas = existingPartido.estadisticas;
          // console.log(
          //   `✅ Preserved existing statistics for match ${match.fixture.id} (no new stats provided)`
          // );
        }
      }

      const detailsTtlMs = calculateDetailsTtlMs(match.fixture.status.short);
      if (match.statistics || match.events) {
        // Si hay estadísticas o eventos, establecer TTL normal
        partido.ttl_detalles = Timestamp.fromMillis(Date.now() + detailsTtlMs);
      } else if (existingPartido?.ttl_detalles) {
        // Preservar TTL existente si no hay nuevas estadísticas/eventos
        partido.ttl_detalles = existingPartido.ttl_detalles;
      } else {
        // Si no hay estadísticas/eventos y no hay ttl_detalles existente,
        // establecer un TTL largo para indicar que ya se intentó obtener pero no están disponibles
        // Esto evita intentar enriquecer repetidamente partidos que no tienen datos disponibles
        if (
          isFinishedStatus(match.fixture.status.short) ||
          isLiveStatus(match.fixture.status.short)
        ) {
          const matchDate = new Date(match.fixture.date);
          const daysSinceMatch =
            (Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24);

          // Establecer TTL largo (30 días) para partidos terminados sin estadísticas
          // Esto marca que ya se intentó obtener pero no están disponibles
          // Para partidos muy recientes (menos de 1 día), usar TTL más corto para permitir reintentos
          if (daysSinceMatch > 1) {
            partido.ttl_detalles = Timestamp.fromMillis(
              Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 días
            );
            // console.log(
            //   `⏭️  Set long TTL for match ${match.fixture.id} (no stats available, ${daysSinceMatch.toFixed(1)} days old) - will not retry enrichment`
            // );
          } else {
            // Para partidos muy recientes, usar TTL normal para permitir reintentos
            partido.ttl_detalles = Timestamp.fromMillis(
              Date.now() + detailsTtlMs
            );
          }
        }
      }

      if (match.events) {
        partido.eventos = {
          local: match.events.home.map(event => {
            const evento: any = {
              tipo: event.type as "Goal" | "Card" | "subst",
              tiempo: {
                transcurrido: event.time?.elapsed ?? 0,
                extra: event.time?.extra ?? null,
              },
              jugador: {
                id: event.player?.id?.toString() || "",
                nombre: event.player?.name || "",
              },
              detalle: event.detail || "",
              comentario: event.comments || null,
            };
            // Solo agregar asistencia si existe
            if (event.assist) {
              evento.asistencia = {
                id: event.assist.id?.toString() || null,
                nombre: event.assist.name || null,
              };
            }
            return evento;
          }),
          visitante: match.events.away.map(event => {
            const evento: any = {
              tipo: event.type as "Goal" | "Card" | "subst",
              tiempo: {
                transcurrido: event.time?.elapsed ?? 0,
                extra: event.time?.extra ?? null,
              },
              jugador: {
                id: event.player?.id?.toString() || "",
                nombre: event.player?.name || "",
              },
              detalle: event.detail || "",
              comentario: event.comments || null,
            };
            // Solo agregar asistencia si existe
            if (event.assist) {
              evento.asistencia = {
                id: event.assist.id?.toString() || null,
                nombre: event.assist.name || null,
              };
            }
            return evento;
          }),
        };
      } else {
        // Preservar eventos existentes si no hay nuevos
        if (existingPartido?.eventos) {
          partido.eventos = existingPartido.eventos;
        }
      }

      const docRef = adminDb.collection("partidos").doc(partido.id);
      batch.set(docRef, partido, { merge: true });
    }

    await batch.commit();
  }

  /**
   * Guarda standings en Firestore
   */
  private async saveStandingsToFirestore(
    standingsResponse: any[],
    leagueId: number,
    season: number
  ): Promise<void> {
    try {
      const standingsId = `standings_${leagueId}_${season}`;
      const league = standingsResponse[0]?.league;
      const posiciones = league?.standings?.[0] || [];

      const standing: Standing = {
        id: standingsId,
        ligaId: leagueId.toString(),
        temporada: season.toString(),
        fecha_actualizacion_datos: Timestamp.now(),
        posiciones: posiciones.map((team: any) => ({
          posicion: team.rank,
          equipo: {
            id: team.team.id.toString(),
            nombre: team.team.name,
            logo: team.team.logo,
          },
          puntos: team.points,
          partidos_jugados: team.all.played,
          ganados: team.all.win,
          empatados: team.all.draw,
          perdidos: team.all.lose,
          goles: {
            a_favor: team.all.goals.for,
            en_contra: team.all.goals.against,
          },
          diferencia_goles: team.goalsDiff || 0,
          forma: team.form || "",
        })),
        fecha_creacion: Timestamp.now(),
        fecha_actualizacion: Timestamp.now(),
      };

      await adminDb
        .collection("standings")
        .doc(standingsId)
        .set(standing, { merge: true });

      // console.log(`✅ Saved standings to Firestore for league ${leagueId}`);
    } catch (error) {
      // console.error("Error saving standings to Firestore:", error);
    }
  }

  /**
   * Guarda equipos en Firestore (método público)
   */
  async saveTeamsToFirestore(teams: Team[], leagueId: number): Promise<void> {
    try {
      const batch = adminDb.batch();
      const now = Timestamp.now();

      for (const team of teams) {
        const equipo: Equipo = {
          id: team.id.toString(),
          nombre: team.name,
          escudo: team.logo,
          ligaId: leagueId.toString(),
          fecha_creacion: now,
          fecha_actualizacion: now,
        };

        const docRef = adminDb.collection("equipos").doc(equipo.id);
        batch.set(docRef, equipo, { merge: true });
      }

      await batch.commit();
      // console.log(`✅ Saved ${teams.length} teams to Firestore`);
    } catch (error) {
      // console.error("Error saving teams to Firestore:", error);
    }
  }

  /**
   * Guarda ligas en Firestore
   */
  private async saveLeaguesToFirestore(leaguesResponse: any[]): Promise<void> {
    try {
      const batch = adminDb.batch();
      const now = Timestamp.now();

      for (const league of leaguesResponse) {
        const liga: Liga = {
          id: league.id.toString(),
          nombre: league.name,
          pais: league.country?.name || "",
          logo: league.logo,
          temporada_actual: new Date().getFullYear().toString(),
          tipo: league.type || "league",
          fecha_creacion: now,
          fecha_actualizacion: now,
        };

        const docRef = adminDb.collection("ligas").doc(liga.id);
        batch.set(docRef, liga, { merge: true });
      }

      await batch.commit();
      // console.log(`✅ Saved ${leaguesResponse.length} leagues to Firestore`);
    } catch (error) {
      // console.error("Error saving leagues to Firestore:", error);
    }
  }
}
