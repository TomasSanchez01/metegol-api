"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { ChevronUp, Trophy, X } from "lucide-react";
import { League } from "@/types/match";

interface LeagueDropupProps {
  selectedLeague?: number | null;
  selectedCountry?: string | null;
  onLeagueChange: (leagueId: number | null) => void;
  leagues: League[];
}

export default function LeagueDropup({
  selectedLeague = null,
  selectedCountry = null,
  onLeagueChange,
  leagues,
}: LeagueDropupProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Filtrar ligas por país seleccionado
  const filteredLeagues = useMemo(() => {
    if (!leagues || !Array.isArray(leagues)) return [];
    if (!selectedCountry) return leagues;
    return leagues.filter(league => league.country === selectedCountry);
  }, [leagues, selectedCountry]);

  // Agrupar ligas por país para mostrar
  const leaguesByCountry = useMemo(() => {
    const grouped = filteredLeagues.reduce<Record<string, League[]>>(
      (acc, league) => {
        const country = league.country || "Unknown";
        if (!acc[country]) acc[country] = [];
        acc[country].push(league);
        return acc;
      },
      {}
    );

    // Ordenar países
    const countries = Object.keys(grouped).sort((a, b) => {
      if (a === "Argentina") return -1;
      if (b === "Argentina") return 1;
      if (a === "Europe") return -1;
      if (b === "Europe") return 1;
      if (a === "South America") return -1;
      if (b === "South America") return 1;
      return a.localeCompare(b);
    });

    return countries.reduce<Record<string, League[]>>((acc, country) => {
      acc[country] = grouped[country];
      return acc;
    }, {});
  }, [filteredLeagues]);

  const clearFilter = () => {
    onLeagueChange(null);
  };

  const getDisplayText = () => {
    if (selectedLeague && leagues && Array.isArray(leagues)) {
      const league = leagues.find(l => l.id === selectedLeague);
      return league?.name || `Liga ${selectedLeague}`;
    }
    if (selectedCountry) {
      const leagueCount = filteredLeagues.length;
      return `${leagueCount} ligas disponibles`;
    }
    return "Seleccionar Liga";
  };

  const hasActiveFilter = selectedLeague;
  const hasCountrySelected = selectedCountry;
  const hasLeaguesAvailable = filteredLeagues.length > 0;

  return (
    <div className="relative">
      {/* Botón principal */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-300 ${
          hasActiveFilter
            ? "border-emerald-400 bg-gradient-to-r from-emerald-500/20 to-teal-400/20 text-white shadow-lg"
            : hasCountrySelected && !hasLeaguesAvailable
              ? "cursor-not-allowed border-white/20 bg-gradient-to-br from-gray-800/50 to-gray-700/50 text-white/50"
              : "border-white/30 bg-gradient-to-br from-gray-800/80 to-gray-700/70 text-white/90 hover:border-white/50 hover:bg-gradient-to-br hover:from-gray-700/90 hover:to-gray-600/80"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <Trophy className="h-4 w-4" />
          </div>
          <span className="truncate">{getDisplayText()}</span>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilter && (
            <div
              onClick={e => {
                e.stopPropagation();
                clearFilter();
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  clearFilter();
                }
              }}
              role="button"
              tabIndex={0}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 transition-colors duration-200 hover:bg-white/30"
              title="Limpiar filtro"
              aria-label="Limpiar filtro"
            >
              <X className="h-3 w-3" />
            </div>
          )}
          <ChevronUp
            className={`h-5 w-5 transition-transform duration-300 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown content */}
      {isOpen && hasLeaguesAvailable && (
        <>
          {/* Overlay para cerrar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Contenido del dropdown */}
          <div className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-96 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-gray-900/95 to-gray-800/95 shadow-2xl backdrop-blur-xl">
            {/* Header */}
            <div className="border-b border-white/10 p-3">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    clearFilter();
                    setIsOpen(false);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    !hasActiveFilter
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                      : "border-white/30 bg-white/10 text-white/80 hover:border-white/50 hover:bg-white/20"
                  }`}
                >
                  Todas las ligas
                  {selectedCountry && ` de ${selectedCountry}`}
                </button>
              </div>
            </div>

            {/* Lista de ligas */}
            <div className="scrollbar-hide max-h-80 overflow-y-auto p-3">
              {selectedCountry ? (
                // Mostrar solo ligas del país seleccionado
                <div className="space-y-1">
                  {filteredLeagues.map(league => (
                    <button
                      key={league.id}
                      onClick={() => {
                        onLeagueChange(
                          league.id === selectedLeague ? null : league.id
                        );
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                        selectedLeague === league.id
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        <Image
                          src={league.logo}
                          alt={league.name}
                          width={20}
                          height={20}
                          className="object-contain brightness-150 contrast-120"
                        />
                      </div>
                      <span className="truncate">{league.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                // Mostrar ligas agrupadas por país
                <div className="space-y-3">
                  {Object.entries(leaguesByCountry).map(
                    ([country, countryLeagues]) => (
                      <div key={country}>
                        <h4 className="mb-2 text-xs font-medium tracking-wide text-white/60 uppercase">
                          {country} ({countryLeagues.length})
                        </h4>
                        <div className="space-y-1">
                          {countryLeagues.map(league => (
                            <button
                              key={league.id}
                              onClick={() => {
                                onLeagueChange(
                                  league.id === selectedLeague
                                    ? null
                                    : league.id
                                );
                                setIsOpen(false);
                              }}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                                selectedLeague === league.id
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "text-white/80 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <div className="flex-shrink-0">
                                <Image
                                  src={league.logo}
                                  alt={league.name}
                                  width={20}
                                  height={20}
                                  className="object-contain brightness-150 contrast-120"
                                />
                              </div>
                              <span className="truncate">{league.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
