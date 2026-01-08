"use client";

import Image from "next/image";
import Link from "next/link";
import SimpleMatchCard from "./SimpleMatchCard";
import type { Match } from "@/types/match";
import Argentina from "@/public/Argentina.png";

interface Props {
  leagueName: string;
  leagueLogo?: string;
  leagueCountry?: string;
  leagueId?: number;
  matches: Match[];
}

export default function LeagueSection({
  leagueName,
  leagueLogo,
  leagueId,
  matches,
}: Props) {
  const isArgentineLeague =
    leagueName === "Liga Profesional de Futbol" ||
    leagueName?.includes("Liga Profesional");

  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2e39] bg-[#181c23]">
      {/* League Header */}
      <div
        className={`relative px-2 py-3 ${!isArgentineLeague ? "bg-gradient-to-r from-[#1e3a8a] via-[#2563eb] to-[#1e3a8a]" : ""}`}
      >
        {isArgentineLeague && (
          <Image
            src={Argentina}
            alt="Argentina"
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="relative z-10 flex h-6 items-center justify-between">
          <div className="flex items-center gap-2">
            {leagueLogo && (
              <Image
                src={leagueLogo}
                width={20}
                height={20}
                alt={leagueName}
                className="rounded-full bg-white"
              />
            )}
            <div className="flex flex-col">
              <h3 className="truncate text-[14px] font-bold text-white">
                {leagueName}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              {leagueId ? (
                <Link
                  href={`/league/${leagueId}`}
                  className="cursor-pointer text-white/70 underline decoration-dotted underline-offset-2 transition-colors hover:text-white"
                >
                  Datos de Liga
                </Link>
              ) : (
                <span className="text-white/70">Datos de Liga</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Simple Matches List */}
      <div className="space-y-1">
        {matches.map(match => (
          <SimpleMatchCard key={match.fixture.id} match={match} />
        ))}
      </div>
    </div>
  );
}
