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

export class FirestoreFootballService {
  private externalApi: FootballApiServer | null = null;

  constructor() {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (apiKey) {
      this.externalApi = new FootballApiServer(apiKey);
    }
  }

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
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);

        let query = adminDb
          .collection("partidos")
          .where("fecha", ">=", Timestamp.fromDate(fromDate))
          .where("fecha", "<=", Timestamp.fromDate(toDate));

        if (leagueId) {
          query = query.where("ligaId", "==", leagueId.toString());
        }

        const snapshot = await query.get();

        if (!snapshot.empty) {
          console.log(
            `✅ Found ${snapshot.size} matches in Firestore for ${from} to ${to}${leagueId ? ` (league ${leagueId})` : ""}`
          );
          const matches = await Promise.all(
            snapshot.docs.map((doc) =>
              this.convertPartidoToMatch(doc.data() as Partido)
            )
          );
          return matches;
        }
      } catch (firestoreError: any) {
        // Si hay un error de índice u otro error de Firestore, hacer fallback a API externa
        if (firestoreError?.code === 9 || firestoreError?.message?.includes("index")) {
          console.log(
            `⚠️  Firestore index not found, fetching from external API... (Error: ${firestoreError.message})`
          );
        } else {
          // Otro tipo de error, lo lanzamos
          throw firestoreError;
        }
      }

      // Si no hay datos en Firestore o hay error de índice, consultar API externa
      console.log(
        `⚠️  No matches found in Firestore, fetching from external API...`
      );
      if (!this.externalApi) {
        throw new Error("FOOTBALL_API_KEY not configured");
      }

      let externalMatches: Match[] = [];
      if (leagueId) {
        externalMatches = await this.externalApi.getFixturesByDateAndLeague(
          from,
          leagueId
        );
      } else {
        // Si no hay leagueId, consultar múltiples ligas
        const defaultLeagues = [128, 39, 140, 135, 78, 61];
        const allMatches = await Promise.all(
          defaultLeagues.map((id) =>
            this.externalApi!.getFixturesByDateAndLeague(from, id)
          )
        );
        externalMatches = allMatches.flat();
      }

      // Guardar en Firestore
      await this.saveMatchesToFirestore(externalMatches);

      return externalMatches;
    } catch (error) {
      console.error("Error getting fixtures:", error);
      throw error;
    }
  }

  /**
   * Obtiene standings desde Firestore, si no hay, consulta la API externa
   */
  async getStandings(leagueId: number, season: number): Promise<{
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
        console.log(
          `✅ Found standings in Firestore for league ${leagueId}, season ${season}`
        );
        const standing = standingsDoc.data() as Standing;
        const ligaDoc = await adminDb
          .collection("ligas")
          .doc(leagueId.toString())
          .get();
        const liga = ligaDoc.exists ? (ligaDoc.data() as Liga) : null;

        return {
          standings: standing.posiciones.map((pos) => ({
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
      console.log(
        `⚠️  No standings found in Firestore, fetching from external API...`
      );
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
      const league = standingsResponse[0]?.league || {};

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
          id: league.id || leagueId,
          name: league.name || `Liga ${leagueId}`,
          logo: league.logo || `https://media.api-sports.io/football/leagues/${leagueId}.png`,
          country: league.country?.name || "",
          season: league.season || season,
        },
      };
    } catch (error) {
      console.error("Error getting standings:", error);
      throw error;
    }
  }

  /**
   * Obtiene equipos desde Firestore, si no hay, consulta la API externa
   */
  async getTeams(leagueId?: number): Promise<Team[]> {
    try {
      // Consultar Firestore primero
      let query = adminDb.collection("equipos");
      if (leagueId) {
        query = query.where("ligaId", "==", leagueId.toString());
      }

      const snapshot = await query.limit(100).get();

      if (!snapshot.empty) {
        console.log(
          `✅ Found ${snapshot.size} teams in Firestore${leagueId ? ` for league ${leagueId}` : ""}`
        );
        return snapshot.docs.map((doc) => {
          const equipo = doc.data() as Equipo;
          return {
            id: parseInt(equipo.id),
            name: equipo.nombre,
            logo: equipo.escudo,
          };
        });
      }

      // Si no hay datos en Firestore, consultar API externa
      console.log(
        `⚠️  No teams found in Firestore, fetching from external API...`
      );
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
      console.error("Error getting teams:", error);
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
        console.log(`✅ Found team ${teamId} in Firestore`);
        const equipo = equipoDoc.data() as Equipo;
        return {
          id: parseInt(equipo.id),
          name: equipo.nombre,
          logo: equipo.escudo,
        };
      }

      // Si no hay datos en Firestore, consultar API externa
      console.log(
        `⚠️  Team ${teamId} not found in Firestore, fetching from external API...`
      );
      if (!this.externalApi) {
        return null;
      }

      // La API externa no tiene endpoint directo para obtener un equipo por ID
      // Necesitamos obtenerlo desde los partidos o desde una liga
      // Por ahora, retornar null y dejar que el endpoint maneje la API externa
      return null;
    } catch (error) {
      console.error("Error getting team:", error);
      return null;
    }
  }

  /**
   * Obtiene partidos de un equipo desde Firestore
   */
  async getTeamMatches(
    teamId: number,
    season?: number
  ): Promise<Match[]> {
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
        (doc, index, self) =>
          index === self.findIndex((d) => d.id === doc.id)
      );

      if (uniqueDocs.length > 0) {
        console.log(
          `✅ Found ${uniqueDocs.length} matches for team ${teamId} in Firestore`
        );
        const matches = await Promise.all(
          uniqueDocs.map((doc) =>
            this.convertPartidoToMatch(doc.data() as Partido)
          )
        );

        // Filtrar por temporada si se especifica
        if (season) {
          return matches.filter((match) => {
            const matchDate = new Date(match.fixture.date);
            return matchDate.getFullYear() === seasonYear;
          });
        }

        return matches;
      }

      // Si no hay datos en Firestore, retornar array vacío
      // El endpoint puede consultar la API externa si es necesario
      console.log(
        `⚠️  No matches found in Firestore for team ${teamId}, will fetch from external API`
      );
      return [];
    } catch (error) {
      console.error("Error getting team matches:", error);
      return [];
    }
  }

  /**
   * Obtiene ligas desde Firestore, si no hay, consulta la API externa
   */
  async getLeagues(country?: string): Promise<League[]> {
    try {
      // Consultar Firestore primero
      let query = adminDb.collection("ligas");
      if (country) {
        query = query.where("pais", "==", country);
      }

      const snapshot = await query.get();

      if (!snapshot.empty) {
        console.log(
          `✅ Found ${snapshot.size} leagues in Firestore${country ? ` for country ${country}` : ""}`
        );
        return snapshot.docs.map((doc) => {
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
      console.log(
        `⚠️  No leagues found in Firestore, fetching from external API...`
      );
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
      console.error("Error getting leagues:", error);
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
      console.error(`Error getting league info for ${partido.ligaId}:`, error);
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
      match.statistics = {
        home: partido.estadisticas.local.map((stat) => ({
          type: stat.tipo as any,
          value: stat.valor,
        })),
        away: partido.estadisticas.visitante.map((stat) => ({
          type: stat.tipo as any,
          value: stat.valor,
        })),
      };
    }

    if (partido.eventos) {
      match.events = {
        home: partido.eventos.local.map((event) => ({
          type: event.tipo as any,
          time: event.tiempo,
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
                id: event.asistencia.id ? parseInt(event.asistencia.id) : null,
                name: event.asistencia.nombre,
              }
            : null,
          detail: event.detalle,
          comments: event.comentario,
        })),
        away: partido.eventos.visitante.map((event) => ({
          type: event.tipo as any,
          time: event.tiempo,
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
                id: event.asistencia.id ? parseInt(event.asistencia.id) : null,
                name: event.asistencia.nombre,
              }
            : null,
          detail: event.detalle,
          comments: event.comentario,
        })),
      };
    }

    return match;
  }

  /**
   * Guarda partidos en Firestore (método público)
   */
  async saveMatchesToFirestore(matches: Match[]): Promise<void> {
    const batch = adminDb.batch();
    const now = Timestamp.now();

    for (const match of matches) {
      // Construir estado sin undefined
      const estado: any = {
        largo: match.fixture.status.long,
        corto: match.fixture.status.short,
      };
      // Solo agregar tiempo_transcurrido si existe
      if (match.fixture.status.elapsed !== null && match.fixture.status.elapsed !== undefined) {
        estado.tiempo_transcurrido = match.fixture.status.elapsed;
      }

      const partido: Partido = {
        id: match.fixture.id.toString(),
        ligaId: match.league.id.toString(),
        fecha: Timestamp.fromDate(new Date(match.fixture.date)),
        estado: estado as EstadoPartido,
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
        fecha_creacion: now,
        fecha_actualizacion: now,
      };

      if (match.statistics) {
        partido.estadisticas = {
          local: match.statistics.home.map((stat) => ({
            tipo: stat.type,
            valor: stat.value,
          })),
          visitante: match.statistics.away.map((stat) => ({
            tipo: stat.type,
            valor: stat.value,
          })),
        };
      }

      if (match.events) {
        partido.eventos = {
          local: match.events.home.map((event) => {
            const evento: any = {
              tipo: event.type as "Goal" | "Card" | "subst",
              tiempo: {
                transcurrido: event.time.elapsed,
                extra: event.time.extra,
              },
              jugador: {
                id: event.player.id.toString(),
                nombre: event.player.name,
              },
              detalle: event.detail,
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
          visitante: match.events.away.map((event) => {
            const evento: any = {
              tipo: event.type as "Goal" | "Card" | "subst",
              tiempo: {
                transcurrido: event.time.elapsed,
                extra: event.time.extra,
              },
              jugador: {
                id: event.player.id.toString(),
                nombre: event.player.name,
              },
              detalle: event.detail,
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
      }

      const docRef = adminDb.collection("partidos").doc(partido.id);
      batch.set(docRef, partido, { merge: true });
    }

    await batch.commit();
    console.log(`✅ Saved ${matches.length} matches to Firestore`);
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

      console.log(`✅ Saved standings to Firestore for league ${leagueId}`);
    } catch (error) {
      console.error("Error saving standings to Firestore:", error);
    }
  }

  /**
   * Guarda equipos en Firestore (método público)
   */
  async saveTeamsToFirestore(
    teams: Team[],
    leagueId: number
  ): Promise<void> {
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
      console.log(`✅ Saved ${teams.length} teams to Firestore`);
    } catch (error) {
      console.error("Error saving teams to Firestore:", error);
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
      console.log(`✅ Saved ${leaguesResponse.length} leagues to Firestore`);
    } catch (error) {
      console.error("Error saving leagues to Firestore:", error);
    }
  }
}

