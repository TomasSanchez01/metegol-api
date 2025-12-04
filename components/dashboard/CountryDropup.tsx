"use client";

import { useState } from "react";
import { ChevronUp, Globe, X } from "lucide-react";

interface Country {
  name: string;
  flag: string;
  code: string;
}

interface CountryDropupProps {
  selectedCountry?: string | null;
  onCountryChange: (country: string | null) => void;
  countries: Country[];
}

export default function CountryDropup({
  selectedCountry = null,
  onCountryChange,
  countries,
}: CountryDropupProps) {
  const [isOpen, setIsOpen] = useState(false);

  const clearFilter = () => {
    onCountryChange(null);
  };

  const getDisplayText = () => {
    if (selectedCountry) {
      const country = countries.find(c => c.name === selectedCountry);
      return country ? `${country.flag} ${country.name}` : selectedCountry;
    }
    return "Seleccionar País";
  };

  const hasActiveFilter = selectedCountry;

  return (
    <div className="relative">
      {/* Botón principal */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex w-full items-center justify-between rounded-2xl border bg-red-500 px-4 py-3 text-sm font-medium transition-all duration-300 ${
          hasActiveFilter
            ? "border-blue-400 bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-white shadow-lg"
            : "border-white/30 bg-gradient-to-br from-gray-800/80 to-gray-700/70 text-white/90 hover:border-white/50 hover:bg-gradient-to-br hover:from-gray-700/90 hover:to-gray-600/80"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <Globe className="h-4 w-4" />
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
      {isOpen && (
        <>
          {/* Overlay para cerrar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Contenido del dropdown */}
          <div className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-80 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-gray-900/95 to-gray-800/95 shadow-2xl backdrop-blur-xl">
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
                  Todos los países
                </button>
              </div>
            </div>

            {/* Lista de países */}
            <div className="scrollbar-hide max-h-60 overflow-y-auto p-3">
              <div className="space-y-1">
                {countries.map(country => (
                  <button
                    key={country.code}
                    onClick={() => {
                      onCountryChange(
                        country.name === selectedCountry ? null : country.name
                      );
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                      selectedCountry === country.name
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{country.flag}</span>
                    <span className="truncate">{country.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
