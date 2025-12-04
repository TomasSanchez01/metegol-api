"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import HeaderBar from "@/components/dashboard/HeaderBar";
import DateSelector from "@/components/dashboard/DateSelector";
import CountryDropup from "@/components/dashboard/CountryDropup";
import LeagueDropup from "@/components/dashboard/LeagueDropup";
import LeagueSection from "@/components/dashboard/LeagueSection";
import { Match, League } from "@/types/match";
import { FootballApi } from "@/lib/footballApi";
import { format } from "date-fns";
import { STATIC_LEAGUES } from "@/lib/leagues-data";
import GiftBanner from "./GiftBanner";

interface Props {
  initialMatches?: Match[];
}

const DEFAULT_LEAGUES = [128, 129, 130, 2, 3, 848, 15, 71];

const leagueNames: Record<number, string> = {
  128: "Liga Profesional de Futbol",
  129: "Primera Nacional",
  130: "Copa Argentina",
  2: "Champions League",
  3: "Europa League",
  848: "Conference League",
  15: "Mundial Clubes",
};

// Lista de países con sus flags
const COUNTRIES = [
  { name: "Argentina", flag: "🇦🇷", code: "AR" },
  { name: "Brazil", flag: "🇧🇷", code: "BR" },
  { name: "Spain", flag: "🇪🇸", code: "ES" },
  { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", code: "GB-ENG" },
  { name: "Germany", flag: "🇩🇪", code: "DE" },
  { name: "Italy", flag: "🇮🇹", code: "IT" },
  { name: "France", flag: "🇫🇷", code: "FR" },
  { name: "Portugal", flag: "🇵🇹", code: "PT" },
  { name: "Netherlands", flag: "🇳🇱", code: "NL" },
  { name: "Belgium", flag: "🇧🇪", code: "BE" },
  { name: "Mexico", flag: "🇲🇽", code: "MX" },
  { name: "USA", flag: "🇺🇸", code: "US" },
  { name: "Chile", flag: "🇨🇱", code: "CL" },
  { name: "Colombia", flag: "🇨🇴", code: "CO" },
  { name: "Uruguay", flag: "🇺🇾", code: "UY" },
  { name: "Paraguay", flag: "🇵🇾", code: "PY" },
  { name: "Peru", flag: "🇵🇪", code: "PE" },
  { name: "Ecuador", flag: "🇪🇨", code: "EC" },
  { name: "Venezuela", flag: "🇻🇪", code: "VE" },
  { name: "Bolivia", flag: "🇧🇴", code: "BO" },
  { name: "Russia", flag: "🇷🇺", code: "RU" },
  { name: "Turkey", flag: "🇹🇷", code: "TR" },
  { name: "Switzerland", flag: "🇨🇭", code: "CH" },
  { name: "Austria", flag: "🇦🇹", code: "AT" },
  { name: "Denmark", flag: "🇩🇰", code: "DK" },
  { name: "Sweden", flag: "🇸🇪", code: "SE" },
  { name: "Norway", flag: "🇳🇴", code: "NO" },
  { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", code: "GB-SCT" },
  { name: "Czech-Republic", flag: "🇨🇿", code: "CZ" },
  { name: "Poland", flag: "🇵🇱", code: "PL" },
  { name: "Ukraine", flag: "🇺🇦", code: "UA" },
  { name: "Croatia", flag: "🇭🇷", code: "HR" },
  { name: "Serbia", flag: "🇷🇸", code: "RS" },
  { name: "Europe", flag: "🇪🇺", code: "EU" },
  { name: "South America", flag: "🌎", code: "CONMEBOL" },
  { name: "World", flag: "🌍", code: "FIFA" },
];

export default function MainDashboard({ initialMatches = [] }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [leagues, setLeagues] = useState<League[]>(STATIC_LEAGUES);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Ref para cancelar requests anteriores
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMatches = useCallback(
    async (date: Date, leagueId: number | null, country: string | null) => {
      // Cancelar request anterior si existe
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Crear nuevo AbortController
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setLoading(true);

      try {
        const dateStr = format(date, "yyyy-MM-dd");
        let newMatches: Match[] = [];

        if (abortController.signal.aborted) {
          return;
        }

        // OPTIMIZED: Always use single API call with multiple leagues
        let targetLeagues: number[];

        if (leagueId !== null) {
          // Single league
          targetLeagues = [leagueId];
          const league = leagues.find(l => l.id === leagueId);
          setLoadingMessage(
            `Cargando partidos de ${league?.name || `Liga ${leagueId}`}...`
          );
        } else if (country) {
          // All leagues from selected country
          const countryLeagues = leagues.filter(l => l.country === country);
          targetLeagues = countryLeagues.map(l => l.id);
          setLoadingMessage(`Cargando partidos de ${country}...`);
        } else {
          // Default leagues
          targetLeagues = DEFAULT_LEAGUES;
          setLoadingMessage("Cargando partidos principales...");
        }

        // Single optimized API call
        newMatches = await FootballApi.getMultipleLeaguesMatches(
          dateStr,
          targetLeagues
        );

        // Solo actualizar estado si no fue cancelado
        if (!abortController.signal.aborted) {
          setMatches(newMatches);
        }
      } catch (err) {
        // Solo log de errores que no sean de cancelación
        if (!abortController.signal.aborted) {
          console.error("Error fetching matches:", err);
          setMatches([]);
        }
      } finally {
        // Solo actualizar loading si no fue cancelado
        if (!abortController.signal.aborted) {
          setLoading(false);
          setLoadingMessage("");
        }
      }
    },
    [leagues]
  );

  // Cargar ligas disponibles - solo usar la lista estática
  useEffect(() => {
    const loadLeagues = async () => {
      try {
        // Importar la lista estática desde leagues-data
        const { STATIC_LEAGUES } = await import("@/lib/leagues-data");

        // Solo usar la lista estática, no agregar ligas adicionales de la API
        setLeagues(STATIC_LEAGUES);
      } catch (error) {
        console.error("Error loading leagues:", error);
        // En caso de error, usar solo la lista estática
        setLeagues(STATIC_LEAGUES);
      }
    };
    loadLeagues();
  }, []);

  // Debounced effect para evitar llamadas excesivas
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMatches(selectedDate, selectedLeague, selectedCountry);
    }, 300); // 300ms de debounce

    return () => clearTimeout(timeoutId);
  }, [selectedDate, selectedLeague, selectedCountry, fetchMatches]);

  // Limpiar AbortController al desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return matches.filter(
      m =>
        m.teams.home.name.toLowerCase().includes(term) ||
        m.teams.away.name.toLowerCase().includes(term)
    );
  }, [matches, searchTerm]);

  const liveCount = useMemo(
    () =>
      filtered.filter(m =>
        ["1H", "2H", "LIVE", "ET", "P"].includes(m.fixture.status.short)
      ).length,
    [filtered]
  );

  const grouped = useMemo(() => {
    return filtered.reduce<Record<number, Match[]>>((acc, m) => {
      const id = m.league.id;
      if (!acc[id]) acc[id] = [];
      acc[id].push(m);
      return acc;
    }, {});
  }, [filtered]);

  const leagueLabel =
    selectedLeague !== null
      ? leagueNames[selectedLeague] || `Liga ${selectedLeague}`
      : "";

  return (
    <div className="flex h-full w-full flex-col text-white">
      <div className="flex-shrink-0">
        <HeaderBar
          liveCount={liveCount}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />

        <DateSelector
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
        <GiftBanner />
      </div>

      <div className="scrollbar-hide mt-4 mb-1 flex-1 space-y-4 overflow-y-auto px-2">
        {loading && (
          <div className="py-4 text-center text-white/60">
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/80"></div>
              {loadingMessage || "Cargando partidos..."}
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-8 text-center text-white/60">
            No hay partidos que coincidan con tu búsqueda.
          </div>
        )}

        {!loading &&
          filtered.length > 0 &&
          (selectedLeague === null ? (
            <div className="space-y-4">
              {Object.entries(grouped).map(([leagueId, ms]) => (
                <LeagueSection
                  key={leagueId}
                  leagueId={+leagueId}
                  leagueName={
                    ms[0]?.league?.name ||
                    leagueNames[+leagueId] ||
                    `Liga ${leagueId}`
                  }
                  leagueLogo={ms[0]?.league?.logo}
                  leagueCountry={ms[0]?.league?.country}
                  matches={ms}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <LeagueSection
                leagueId={selectedLeague}
                leagueName={leagueLabel}
                leagueLogo={filtered[0]?.league?.logo}
                leagueCountry={filtered[0]?.league?.country}
                matches={filtered}
              />
            </div>
          ))}
      </div>

      {/* Fixed bottom navigation - Dos dropups separados */}
      <div className="flex-shrink-0 px-2 pb-2">
        <div className="grid grid-cols-2 gap-3">
          {/* Dropup de Países */}
          <CountryDropup
            countries={COUNTRIES}
            selectedCountry={selectedCountry}
            onCountryChange={useCallback((country: string | null) => {
              setSelectedCountry(country);
              if (country) {
                setSelectedLeague(null); // Limpiar liga cuando se selecciona país
              }
            }, [])}
          />

          {/* Dropup de Ligas */}
          <LeagueDropup
            leagues={leagues}
            selectedCountry={selectedCountry}
            selectedLeague={selectedLeague}
            onLeagueChange={useCallback((leagueId: number | null) => {
              setSelectedLeague(leagueId);
            }, [])}
          />
        </div>
      </div>
    </div>
  );
}
