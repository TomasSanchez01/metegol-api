"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Trophy, Target, Users } from "lucide-react";
import { FootballApi } from "@/lib/footballApi";

interface Standing {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals: {
    for: number;
    against: number;
  };
  group: string;
  form: string;
}

interface LeagueInfo {
  id: number;
  name: string;
  logo: string;
  country: string;
  season: number;
}

export default function LeaguePage() {
  const params = useParams();
  const leagueId = params.id as string;

  const [allStandings, setAllStandings] = useState<Standing[][]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number>(0);

  useEffect(() => {
    const fetchLeagueData = async () => {
      try {
        setLoading(true);
        const data = await FootballApi.getStandings(leagueId);

        if (!data) {
          throw new Error("Error al cargar los datos de la liga");
        }

        console.log(data);

        // data.standings es un arreglo de arreglos
        setAllStandings(data.standings || []);
        // Por defecto, mostrar el primer grupo
        setStandings(data.standings[0] || []);
        setLeagueInfo(data.league || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchLeagueData();
    }
  }, [leagueId]);

  // Cuando cambia el grupo seleccionado, actualizar la tabla
  useEffect(() => {
    if (allStandings.length > 0 && allStandings[selectedGroup]) {
      setStandings(allStandings[selectedGroup]);
    }
  }, [selectedGroup, allStandings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white/80"></div>
          <p className="text-white/60">Cargando estadísticas de la liga...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center">
          <p className="mb-4 text-red-400">{error}</p>
          <Link
            href="/"
            className="text-blue-400 transition-colors hover:text-blue-300"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const calculateGoalDifference = (team: Standing) => {
    return team.goals.for - team.goals.against;
  };

  return (
    <div className="min-h-screen bg-[#0a0e13]">
      <div className="container mx-auto max-w-7xl px-2 py-4">
        {/* Header */}
        <div className="mb-4">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 px-2 text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft size={20} />
            <span className="text-sm">Volver al inicio</span>
          </Link>

          {leagueInfo && (
            <div className="mb-3 overflow-hidden rounded-xl border border-[#2a2e39] bg-[#181c23] p-3">
              <div className="flex items-center gap-3">
                <Image
                  src={leagueInfo.logo}
                  alt={leagueInfo.name}
                  width={40}
                  height={40}
                  className="flex-shrink-0 rounded-full bg-white p-1"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="mb-1 truncate text-lg font-bold text-white md:text-xl">
                    {leagueInfo.name}
                  </h1>
                  <p className="text-xs text-white/60">
                    {leagueInfo.country} • Temporada {leagueInfo.season}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Statistics Summary */}
        <div className="mb-3 grid grid-cols-3 gap-2 md:gap-3">
          <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#181c23] p-2">
            <div className="flex items-center gap-2">
              <Trophy className="flex-shrink-0 text-yellow-400" size={16} />
              <div className="min-w-0">
                <p className="text-xs text-white/60">Equipos</p>
                <p className="text-sm font-bold text-white">
                  {standings.length}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#181c23] p-2">
            <div className="flex items-center gap-2">
              <Target className="flex-shrink-0 text-green-400" size={16} />
              <div className="min-w-0">
                <p className="text-xs text-white/60">Partidos</p>
                <p className="text-sm font-bold text-white">
                  {standings[0]?.played || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#181c23] p-2">
            <div className="flex items-center gap-2">
              <Users className="flex-shrink-0 text-blue-400" size={16} />
              <div className="min-w-0">
                <p className="text-xs text-white/60">Líder</p>
                <p className="truncate text-xs font-bold text-white">
                  {standings[0]?.team.name || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs para seleccionar grupo */}
        {allStandings.length > 1 && (
          <div className="mb-3 overflow-hidden rounded-xl border border-[#2a2e39] bg-[#181c23]">
            <div className="flex overflow-x-auto">
              {allStandings.map((group, index) => {
                const groupName =
                  group[0]?.group || `Grupo ${String.fromCharCode(65 + index)}`;
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedGroup(index)}
                    className={`flex-1 cursor-pointer border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedGroup === index
                        ? "border-blue-500 bg-[#0f1419] text-white"
                        : "border-transparent text-white/60 hover:bg-[#1f2329] hover:text-white"
                    }`}
                  >
                    {groupName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Standings Table */}
        <div className="overflow-hidden rounded-xl border border-[#2a2e39] bg-[#181c23]">
          <div className="border-b border-[#2a2e39] bg-[#0f1419] px-3 py-2">
            <h2 className="text-sm font-bold text-white">
              Tabla de Posiciones
              {allStandings.length > 1 &&
                standings[0]?.group &&
                ` - ${standings[0].group}`}
            </h2>
          </div>

          {/* Mobile Cards View */}
          <div className="block md:hidden">
            {standings.map((team, index) => {
              const isChampionsLeague = index < 4;
              const isEuropaLeague = index >= 4 && index < 6;
              const isRelegation = index >= standings.length - 3;

              return (
                <div
                  key={team.team.id}
                  className={`border-b border-[#2a2e39] p-2 last:border-b-0 ${
                    isChampionsLeague
                      ? "border-l-4 border-l-blue-500"
                      : isEuropaLeague
                        ? "border-l-4 border-l-orange-500"
                        : isRelegation
                          ? "border-l-4 border-l-red-500"
                          : ""
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`min-w-[20px] text-center text-sm font-bold ${
                          isChampionsLeague
                            ? "text-blue-400"
                            : isEuropaLeague
                              ? "text-orange-400"
                              : isRelegation
                                ? "text-red-400"
                                : "text-white"
                        }`}
                      >
                        {team.rank}
                      </span>
                      <Image
                        src={team.team.logo}
                        alt={team.team.name}
                        width={18}
                        height={18}
                        className="flex-shrink-0 rounded-full bg-white"
                      />
                      <span className="truncate text-xs font-medium text-white">
                        {team.team.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-white">
                        {team.points}
                      </span>
                      <span className="block text-xs text-white/60">pts</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1 text-xs">
                    <div className="text-center">
                      <span className="block text-xs text-white/60">J</span>
                      <span className="text-xs font-semibold text-white">
                        {team.played}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="block text-xs text-white/60">G</span>
                      <span className="text-xs font-semibold text-green-400">
                        {team.win}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="block text-xs text-white/60">E</span>
                      <span className="text-xs font-semibold text-yellow-400">
                        {team.draw}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="block text-xs text-white/60">P</span>
                      <span className="text-xs font-semibold text-red-400">
                        {team.lose}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="block text-xs text-white/60">Dif</span>
                      <span
                        className={`text-xs font-semibold ${
                          calculateGoalDifference(team) > 0
                            ? "text-green-400"
                            : calculateGoalDifference(team) < 0
                              ? "text-red-400"
                              : "text-white/80"
                        }`}
                      >
                        {calculateGoalDifference(team) > 0 ? "+" : ""}
                        {calculateGoalDifference(team)}
                      </span>
                    </div>
                  </div>

                  {/* Form indicator */}
                  <div className="mt-1 flex justify-center gap-1">
                    {team.form
                      ?.split("")
                      .slice(-5)
                      .map((result, i) => (
                        <div
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${
                            result === "W"
                              ? "bg-green-500"
                              : result === "D"
                                ? "bg-yellow-500"
                                : result === "L"
                                  ? "bg-red-500"
                                  : "bg-gray-500"
                          }`}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0f1419] text-xs text-white/70">
                  <th className="p-2 text-left font-medium">Pos</th>
                  <th className="p-2 text-left font-medium">Equipo</th>
                  <th className="p-2 text-center font-medium">Pts</th>
                  <th className="p-2 text-center font-medium">J</th>
                  <th className="p-2 text-center font-medium">G</th>
                  <th className="p-2 text-center font-medium">E</th>
                  <th className="p-2 text-center font-medium">P</th>
                  <th className="p-2 text-center font-medium">Dif</th>
                  <th className="p-2 text-center font-medium">Forma</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((team, index) => {
                  const isChampionsLeague = index < 4;
                  const isEuropaLeague = index >= 4 && index < 6;
                  const isRelegation = index >= standings.length - 3;

                  return (
                    <tr
                      key={team.team.id}
                      className={`border-b border-[#2a2e39] transition-colors hover:bg-[#1f2329] ${
                        isChampionsLeague
                          ? "border-l-4 border-l-blue-500"
                          : isEuropaLeague
                            ? "border-l-4 border-l-orange-500"
                            : isRelegation
                              ? "border-l-4 border-l-red-500"
                              : ""
                      }`}
                    >
                      <td className="p-2">
                        <span
                          className={`text-sm font-bold ${
                            isChampionsLeague
                              ? "text-blue-400"
                              : isEuropaLeague
                                ? "text-orange-400"
                                : isRelegation
                                  ? "text-red-400"
                                  : "text-white"
                          }`}
                        >
                          {team.rank}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Image
                            src={team.team.logo}
                            alt={team.team.name}
                            width={20}
                            height={20}
                            className="flex-shrink-0 rounded-full bg-white"
                          />
                          <span className="truncate text-xs font-medium text-white">
                            {team.team.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-center text-sm font-bold text-white">
                        {team.points}
                      </td>
                      <td className="p-2 text-center text-xs text-white/80">
                        {team.played}
                      </td>
                      <td className="p-2 text-center text-xs font-semibold text-green-400">
                        {team.win}
                      </td>
                      <td className="p-2 text-center text-xs font-semibold text-yellow-400">
                        {team.draw}
                      </td>
                      <td className="p-2 text-center text-xs font-semibold text-red-400">
                        {team.lose}
                      </td>
                      <td
                        className={`p-2 text-center text-xs font-semibold ${
                          calculateGoalDifference(team) > 0
                            ? "text-green-400"
                            : calculateGoalDifference(team) < 0
                              ? "text-red-400"
                              : "text-white/80"
                        }`}
                      >
                        {calculateGoalDifference(team) > 0 ? "+" : ""}
                        {calculateGoalDifference(team)}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          {team.form
                            ?.split("")
                            .slice(-5)
                            .map((result, i) => (
                              <div
                                key={i}
                                className={`h-1.5 w-1.5 rounded-full ${
                                  result === "W"
                                    ? "bg-green-500"
                                    : result === "D"
                                      ? "bg-yellow-500"
                                      : result === "L"
                                        ? "bg-red-500"
                                        : "bg-gray-500"
                                }`}
                              />
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="border-t border-[#2a2e39] bg-[#0f1419] px-3 py-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-blue-500"></div>
                <span className="text-white/70">Champions</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-orange-500"></div>
                <span className="text-white/70">Europa</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-red-500"></div>
                <span className="text-white/70">Descenso</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
