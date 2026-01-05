"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Match, LineupTeam } from "@/types/match";
import { Lineups } from "@/components/Lineups";
import { abbreviateTeamName } from "@/lib/utils";

const getStat = (
  stats: { type: string; value: string | number | null }[] | undefined,
  type: string
) => {
  const f = stats?.find(s => s.type === type);
  return f?.value ?? "—";
};

// Goals Slider Component
interface Goal {
  player: { name: string };
  time: { elapsed: number };
  detail: string;
  comments: string | null;
}

interface GoalsSliderProps {
  goals: Goal[];
  isHomeTeam?: boolean;
}

function GoalsSlider({ goals, isHomeTeam = true }: GoalsSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play functionality
  useEffect(() => {
    if (goals.length <= 1) return;

    intervalRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % goals.length);
    }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [goals.length]);

  if (goals.length === 0) return null;

  const currentGoal = goals[currentIndex];

  const isPenaltyShootout =
    currentGoal.detail === "Penalty" &&
    currentGoal.comments === "Penalty Shootout";
  const timeDisplay = isPenaltyShootout
    ? "PEN"
    : `${currentGoal.time.elapsed}"`;

  return (
    <div className="flex min-h-[20px] justify-center">
      <div
        className="transform transition-all duration-700 ease-in-out"
        key={currentIndex}
        style={{
          animation: `${isHomeTeam ? "slideInLeft" : "slideInRight"} 0.7s ease-out`,
        }}
      >
        <div className="flex items-center justify-center gap-2 text-xs">
          {isHomeTeam ? (
            <>
              <span className="text-center font-medium text-white/90">
                {currentGoal.player.name}
              </span>
              <span className="font-semibold text-emerald-400">
                {timeDisplay}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-emerald-400">
                {timeDisplay}
              </span>
              <span className="text-center font-medium text-white/90">
                {currentGoal.player.name}
              </span>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInLeft {
          0% {
            opacity: 0;
            transform: translateX(-30px);
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInRight {
          0% {
            opacity: 0;
            transform: translateX(30px);
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

interface Props {
  match: Match;
}

export default function SimpleMatchCard({ match }: Props) {
  const [showBasicInfo, setShowBasicInfo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<"map" | "lineup" | "timeline">(
    "map"
  );

  const home = match.teams.home;
  const away = match.teams.away;

  const isLive = ["1H", "2H", "LIVE", "ET", "P"].includes(
    match.fixture.status.short
  );
  const isFinished = ["FT", "AET", "PEN"].includes(match.fixture.status.short);
  const isUpcoming = match.fixture.status.short === "NS";

  // Debug logging for problematic matches
  if (
    match.teams.home.name.includes("Kairat") ||
    match.teams.home.name.includes("Celtic") ||
    match.teams.away.name.includes("Kairat") ||
    match.teams.away.name.includes("Celtic")
  ) {
    console.log("SIMPLE MATCH DEBUG:", {
      teams: `${abbreviateTeamName(match.teams.home.name)} vs ${abbreviateTeamName(match.teams.away.name)}`,
      fixtureId: match.fixture.id,
      status: match.fixture.status.short,
      elapsed: match.fixture.status.elapsed,
      isLive,
      officialGoals: { home: match.goals.home, away: match.goals.away },
      homeTeamId: match.teams.home.id,
      awayTeamId: match.teams.away.id,
      homeEvents: match.events?.home.length || 0,
      awayEvents: match.events?.away.length || 0,
      homeGoals: match.events?.home.filter(e => e.type === "Goal") || [],
      awayGoals: match.events?.away.filter(e => e.type === "Goal") || [],
    });
  }

  // Stats for basic info
  const yellowsHome =
    match.events?.home.filter(
      e => e.type === "Card" && e.detail.includes("Yellow")
    ).length || 0;
  const redsHome =
    match.events?.home.filter(
      e => e.type === "Card" && e.detail.includes("Red")
    ).length || 0;
  const yellowsAway =
    match.events?.away.filter(
      e => e.type === "Card" && e.detail.includes("Yellow")
    ).length || 0;
  const redsAway =
    match.events?.away.filter(
      e => e.type === "Card" && e.detail.includes("Red")
    ).length || 0;

  // Filter out missed penalties from penalty shootout
  const goalsHome =
    match.events?.home.filter(
      e =>
        e.type === "Goal" &&
        !(e.detail === "Missed Penalty" && e.comments === "Penalty Shootout")
    ) || [];

  const goalsAway =
    match.events?.away.filter(
      e =>
        e.type === "Goal" &&
        !(e.detail === "Missed Penalty" && e.comments === "Penalty Shootout")
    ) || [];

  const formatTime = () => {
    if (isLive) {
      const minute = match.fixture.status.elapsed;
      if (minute !== null && minute !== undefined) {
        return `${minute}'`;
      }
      return "EN VIVO";
    }

    if (isUpcoming) {
      return new Date(match.fixture.date).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // 🔑 Esto fuerza el formato 24hs
      });
    }

    if (isFinished) {
      // Mostrar el tipo de finalización
      if (match.fixture.status.short === "PEN") {
        return "PEN";
      } else if (match.fixture.status.short === "AET") {
        return "T.E.";
      } else if (match.fixture.status.short === "FT") {
        return "Finalizado";
      }
      return "Finalizado"; // Por defecto para partidos finalizados
    }
    return "";
  };

  const possHome = getStat(match.statistics?.home, "Ball Possession");
  const possAway = getStat(match.statistics?.away, "Ball Possession");

  const toggleBasicInfo = () => {
    const stored = window.localStorage.getItem("extra-info");
    if (stored === "true" && !showBasicInfo) setShowBasicInfo(true);
    else setShowBasicInfo(false);
  };

  const toggleAdvancedInfo = () => {
    const stored = window.localStorage.getItem("extra-info");
    if (stored === "true" && !showAdvanced) setShowAdvanced(true);
    else setShowAdvanced(false);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#181c23]">
      {/* Main Match Row - Clickable */}
      <div
        className="cursor-pointer py-1 transition-colors hover:bg-[#1f2329] md:px-1"
        onClick={toggleBasicInfo}
      >
        <div className="flex items-center justify-between px-1">
          {/* Time/Status */}
          <div className="flex flex-col items-start">
            {/* Live Indicator */}
            {isLive && (
              <p className="w-16 text-right text-[10px] font-bold text-[#c3cc5a]">
                En Vivo
              </p>
            )}
            <div className="text-right">
              {(!isFinished ||
                match.fixture.status.short === "PEN" ||
                match.fixture.status.short === "AET" ||
                match.fixture.status.short === "FT") && (
                <span
                  className={`font-bold ${
                    isLive
                      ? "text-[22px] text-[#c3cc5a]"
                      : isUpcoming
                        ? "text-[18px] text-white"
                        : match.fixture.status.short === "PEN" ||
                            match.fixture.status.short === "AET"
                          ? "text-orange-400"
                          : match.fixture.status.short === "FT" || isFinished
                            ? "text-[12px] text-gray-400"
                            : "text-white/60"
                  }`}
                >
                  {formatTime()}
                </span>
              )}
            </div>
          </div>

          {/* Match Layout: Home Team - Logo - Score - Logo - Away Team */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div className="flex w-full items-center justify-center gap-2">
              <span className="flex-1 text-right text-xs leading-tight font-semibold break-words text-white">
                {abbreviateTeamName(home.name)}
              </span>
              <Image
                src={home.logo}
                alt={home.name}
                width={24}
                height={24}
                className="flex-shrink-0 rounded-full bg-white"
              />

              <div className="flex items-center gap-1 md:px-2">
                <span className="text-[22px] font-bold text-white">
                  {isUpcoming ? "—" : match.goals.home}
                </span>
                <span className="text-[10px] font-extrabold text-white/60">
                  -
                </span>
                <span className="text-[22px] font-bold text-white">
                  {isUpcoming ? "—" : match.goals.away}
                </span>
              </div>

              <Image
                src={away.logo}
                alt={away.name}
                width={24}
                height={24}
                className="flex-shrink-0 rounded-full bg-white"
              />
              <span className="flex-1 text-left text-xs leading-tight font-semibold break-words text-white">
                {abbreviateTeamName(away.name)}
              </span>
            </div>
          </div>

          {/* Expand Icon */}
          <div className="flex w-4 justify-center md:w-8">
            {showBasicInfo ? (
              <ChevronUp size={16} className="text-white/60" />
            ) : (
              <ChevronDown size={16} className="text-white/60" />
            )}
          </div>
        </div>
      </div>

      {/* Basic Info Section */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${showBasicInfo ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="border-t border-[#2a2e39] bg-[#0f1419] px-3 pb-3">
          {/* Goals Sliders - Below team names within same clickable block */}
          {!isUpcoming && (goalsHome.length > 0 || goalsAway.length > 0) && (
            <div className="grid w-full grid-cols-2 gap-1 pt-2">
              {/* Home Team Goals Slider */}
              <div className="flex w-full items-center">
                {goalsHome.length > 0 ? (
                  <GoalsSlider goals={goalsHome} isHomeTeam={true} />
                ) : (
                  <div></div>
                )}
              </div>

              {/* Away Team Goals Slider */}
              <div className="flex w-full items-center justify-center">
                {goalsAway.length > 0 ? (
                  <GoalsSlider goals={goalsAway} isHomeTeam={false} />
                ) : (
                  <div></div>
                )}
              </div>
            </div>
          )}

          {/* Cards and Possession - Same layout as before */}
          {!isUpcoming && (
            <div className="mt-2 mb-3">
              <div className="flex items-center justify-between text-xs">
                {/* Home Team Cards */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span>🟨</span>
                    <span className="text-white/80">{yellowsHome}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🟥</span>
                    <span className="text-white/80">{redsHome}</span>
                  </div>
                </div>

                {/* Possession - Center */}
                {possHome !== "—" && possAway !== "—" && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold ${
                        parseInt(possHome?.toString().replace("%", "") || "0") >
                        parseInt(possAway?.toString().replace("%", "") || "0")
                          ? "text-green-400"
                          : "text-white/80"
                      }`}
                    >
                      {possHome}
                    </span>
                    <span className="text-[10px] text-white/50">POSESIÓN</span>
                    <span
                      className={`font-semibold ${
                        parseInt(possAway?.toString().replace("%", "") || "0") >
                        parseInt(possHome?.toString().replace("%", "") || "0")
                          ? "text-green-400"
                          : "text-white/80"
                      }`}
                    >
                      {possAway}
                    </span>
                  </div>
                )}

                {/* Away Team Cards */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span>🟥</span>
                    <span className="text-white/80">{redsAway}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🟨</span>
                    <span className="text-white/80">{yellowsAway}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ver Más Button */}
          <div className="mt-2 flex justify-end">
            <button
              onClick={e => {
                e.stopPropagation();
                toggleAdvancedInfo();
              }}
              className="text-xs font-semibold text-[#51ff9c] transition-colors hover:text-[#66ff99]"
            >
              {showAdvanced ? "OCULTAR DETALLES" : "VER MÁS"}
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Section with Tabs */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${showBasicInfo && showAdvanced ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="border-t border-[#2a2e39] bg-[#0a0e13] px-3 pb-3">
          {/* Tabs */}
          <div className="mb-3 flex gap-1 text-xs">
            <Tab
              label="MAPA"
              active={activeTab === "map"}
              onClick={() => setActiveTab("map")}
            />
            <Tab
              label="FORMACIONES"
              active={activeTab === "lineup"}
              onClick={() => setActiveTab("lineup")}
            />
            <Tab
              label="CRONOLOGÍA"
              active={activeTab === "timeline"}
              onClick={() => setActiveTab("timeline")}
            />
          </div>

          {/* Tab Content */}
          <div className="rounded-lg border border-[#2a2e39] bg-[#0f1319] p-3">
            {activeTab === "map" && (
              <LiveMap
                minute={isLive ? (match.fixture.status.elapsed ?? null) : null}
                lineups={match.lineups}
              />
            )}
            {activeTab === "lineup" && (
              <div className="text-xs text-white/90">
                <Lineups lineups={match.lineups} />
              </div>
            )}
            {activeTab === "timeline" && (
              <Timeline
                events={[
                  ...(match.events?.home ?? []).map(e => ({
                    ...e,
                    side: "home" as const,
                  })),
                  ...(match.events?.away ?? []).map(e => ({
                    ...e,
                    side: "away" as const,
                  })),
                ]}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components
function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[#2563eb] text-white"
          : "bg-[#1a1f28] text-white/60 hover:bg-[#202634] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

const FieldPlayers: React.FC<{
  players: {
    player: {
      id: number;
      name: string;
      number: number;
      pos: string;
      grid: string;
    };
  }[];
  colors?: LineupTeam["team"]["colors"];
  side: "home" | "away";
}> = ({ players, colors, side }) => {
  // Group players by row and sort them
  const playersByRow = players
    .filter(p => p.player.grid)
    .reduce(
      (acc, p) => {
        const [row] = p.player.grid.split(":").map(Number);
        if (!acc[row]) acc[row] = [];
        acc[row].push(p);
        return acc;
      },
      {} as Record<number, typeof players>
    );

  // Sort rows and columns properly
  Object.keys(playersByRow).forEach(rowKey => {
    const row = Number(rowKey);
    playersByRow[row] = playersByRow[row].sort((a, b) => {
      const [, aCol] = a.player.grid.split(":").map(Number);
      const [, bCol] = b.player.grid.split(":").map(Number);
      return aCol - bCol;
    });
  });

  const sortedRows = Object.keys(playersByRow)
    .map(Number)
    .sort((a, b) => {
      // Reverse for home team so goalkeeper is at the border
      return side === "home" ? b - a : a - b;
    });

  return (
    <div className={"absolute inset-0 flex flex-row-reverse"}>
      {sortedRows.map(row => (
        <div
          key={row}
          className="flex flex-1 flex-col items-center justify-around py-2"
        >
          {playersByRow[row].map(p => (
            <div key={p.player.id} className="group relative cursor-pointer">
              <div
                className="relative flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold"
                style={{
                  backgroundColor:
                    p.player.pos === "G"
                      ? `#${colors?.goalkeeper.primary}`
                      : `#${colors?.player.primary}`,
                  color:
                    p.player.pos === "G"
                      ? `#${colors?.goalkeeper.number}`
                      : `#${colors?.player.number}`,
                  borderColor:
                    p.player.pos === "G"
                      ? `#${colors?.goalkeeper.border}`
                      : `#${colors?.player.border}`,
                }}
              >
                {p.player.number}
              </div>

              {/* Player name tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 transform rounded bg-black/90 px-1 py-0.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                {p.player.name.split(" ").slice(-1)[0]}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

function LiveMap({
  minute,
  lineups,
}: {
  minute: number | null;
  lineups?: {
    home: LineupTeam;
    away: LineupTeam;
  };
}) {
  if (!lineups) {
    return (
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg bg-[#16331e]">
        <div className="z-10 text-center text-xs text-white/70">
          Formaciones no disponibles
        </div>
      </div>
    );
  }

  const homeTeam = lineups.home;
  const awayTeam = lineups.away;

  return (
    <div className="relative h-40 overflow-hidden rounded-lg bg-[#16331e]">
      {/* Field markings */}
      <div className="absolute inset-2 rounded border border-white/30">
        {/* Center line */}
        <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-0.5 transform bg-white/30"></div>
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 transform rounded-full border border-white/30"></div>
        {/* Goal areas */}
        <div className="absolute top-1/3 left-0 h-1/3 w-3 border border-l-0 border-white/30"></div>
        <div className="absolute top-1/3 right-0 h-1/3 w-3 border border-r-0 border-white/30"></div>
      </div>

      {/* Players */}
      <div className="absolute inset-2 flex">
        {/* Home team (right half) */}
        <div className="relative flex-1">
          {homeTeam?.startXI && (
            <FieldPlayers
              players={homeTeam.startXI}
              colors={homeTeam.team.colors}
              side="home"
            />
          )}
        </div>

        {/* Away team (left half) */}
        <div className="relative flex-1">
          {awayTeam?.startXI && (
            <FieldPlayers
              players={awayTeam.startXI}
              colors={awayTeam.team.colors}
              side="away"
            />
          )}
        </div>
      </div>

      {/* Match status */}
      <div className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 transform text-center text-xs text-white/70">
        <div className="font-semibold text-[#66e192]">
          {minute ? `${minute}"` : "Formación inicial"}
        </div>
      </div>
    </div>
  );
}

// Función para traducir tipos de eventos al español
function translateEventType(type?: string): string {
  const translations: Record<string, string> = {
    Goal: "Gol",
    Card: "Tarjeta",
    subst: "Cambio",
    Substitution: "Cambio",
    Penalty: "Penal",
    "Own Goal": "Gol en contra",
    Miss: "Fallo",
    "Red Card": "Tarjeta roja",
    "Yellow Card": "Tarjeta amarilla",
    Var: "VAR",
    "Goal Kick": "Saque de arco",
    "Corner Kick": "Córner",
    "Free Kick": "Tiro libre",
    "Throw-in": "Lateral",
    Offside: "Offside",
    Foul: "Falta",
  };

  return translations[type || ""] || type || "";
}

function Timeline({ events }: { events: Array<Record<string, unknown>> }) {
  if (!events.length) {
    return (
      <div className="py-4 text-center text-xs text-white/50">
        Sin eventos disponibles
      </div>
    );
  }

  const sorted = events.sort((a, b) => {
    const aTime = (a as { time?: { elapsed?: number } })?.time?.elapsed ?? 0;
    const bTime = (b as { time?: { elapsed?: number } })?.time?.elapsed ?? 0;
    return aTime - bTime;
  });

  return (
    <div className="max-h-40 space-y-2 overflow-y-auto">
      {sorted.map((event, i) => {
        const e = event as {
          time?: { elapsed?: number };
          type?: string;
          detail?: string;
          player?: { name?: string };
          side?: string;
        };

        const translatedType = translateEventType(e?.type);

        return (
          <div
            key={i}
            className="flex items-center justify-between space-x-2 border-b border-white/10 py-1 text-xs text-white/75"
          >
            <span className="w-8 text-white/60">
              {e?.time?.elapsed ?? "—"}&quot;
            </span>
            <span className="mx-2 flex-1">| {translatedType}</span>
            <span className="max-w-[100px] truncate text-right text-white/80">
              {e?.player?.name ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
