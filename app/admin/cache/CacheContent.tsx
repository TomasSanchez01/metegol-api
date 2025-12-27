"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CacheStats {
  totalEntries?: number;
  ligas?: { totalEntries: number };
  equipos?: { totalEntries: number };
  jugadores?: { totalEntries: number };
  partidos?: { totalEntries: number };
  standings?: { totalEntries: number };
  formaciones?: { totalEntries: number };
  empty_queries?: { totalEntries: number };
  totals?: {
    structuredCollections: number;
    emptyQueries: number;
    total: number;
  };
}

export interface CacheContentProps {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

export function CacheContent({
  autoRefresh = true,
  refreshIntervalMs = 60000,
}: CacheContentProps = {}) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await fetch("/api/cache?action=stats");
      if (!response.ok) {
        throw new Error("No se pudieron obtener las estadísticas de cache");
      }

      const data = await response.json();
      if (data.success && data.stats) {
        setStats({
          totalEntries: data.stats.totals?.total || 0,
          ligas: data.stats.ligas,
          equipos: data.stats.equipos,
          jugadores: data.stats.jugadores,
          partidos: data.stats.partidos,
          standings: data.stats.standings,
          formaciones: data.stats.formaciones,
          empty_queries: data.stats.empty_queries,
          totals: data.stats.totals,
        });
      } else {
        throw new Error(data.error || "Respuesta inválida del servidor");
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Error desconocido al obtener estadísticas"
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const clearExpiredCache = async () => {
    setActionLoading(true);
    try {
      const response = await fetch("/api/cache?action=clear-expired");
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage(
          data.message ||
            `Limpiadas ${data.deletedCount || 0} consultas vacías antiguas`
        );
        await fetchStats();
      } else {
        throw new Error(data.error || "Error al limpiar cache");
      }
    } catch (error) {
      console.error("Error clearing cache:", error);
      setMessage(
        error instanceof Error ? error.message : "Error al limpiar cache"
      );
    } finally {
      setActionLoading(false);
    }
  };

  const triggerCacheRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/cron/refresh-cache", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Error al actualizar el cache");
      }

      setMessage(data.message || "Cache actualizado correctamente");
      await fetchStats();
    } catch (error) {
      console.error("Error triggering refresh:", error);
      setMessage(
        error instanceof Error ? error.message : "Error al actualizar el cache"
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(fetchStats, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, refreshIntervalMs]);

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 lg:mb-8">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 lg:text-3xl">
            💾 Administración de Cache
          </h1>
          <p className="text-gray-600">
            Monitorea y gestiona el cache de Firebase para datos de Football API
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
            <div className="flex items-center">
              <svg
                className="mr-2 h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {message}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          {/* Cache Statistics */}
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900">
                Estadísticas del Cache
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading && !stats ? (
                <div className="py-4 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"></div>
                </div>
              ) : stats ? (
                <div className="space-y-4">
                  {/* Estadísticas de colecciones estructuradas */}
                  <div className="mb-4 border-b border-gray-200 pb-3">
                    <h4 className="mb-2 text-sm font-semibold text-gray-900">
                      Colecciones Estructuradas
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ligas:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.ligas?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Equipos:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.equipos?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Jugadores:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.jugadores?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Partidos:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.partidos?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Standings:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.standings?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Formaciones:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.formaciones?.totalEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Empty Queries:</span>
                        <span className="font-semibold text-gray-900">
                          {stats.empty_queries?.totalEntries || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Totales */}
                  {stats.totals && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-900">
                          Total Documentos:
                        </span>
                        <span className="font-bold text-blue-600">
                          {stats.totals.total.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {stats.totals.structuredCollections.toLocaleString()}{" "}
                        estructurados +{" "}
                        {stats.totals.emptyQueries.toLocaleString()} consultas
                        vacías
                      </div>
                    </div>
                  )}

                  {/* Health */}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Health:</span>
                    <span className="font-semibold text-green-600">
                      Saludable
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">
                  Error al cargar estadísticas
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900">
                Acciones del Cache
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 lg:space-y-4">
              <button
                onClick={fetchStats}
                disabled={statsLoading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:bg-blue-600/50 lg:py-3 lg:text-base"
              >
                {statsLoading ? "Actualizando..." : "Actualizar Estadísticas"}
              </button>

              <button
                onClick={clearExpiredCache}
                disabled={actionLoading}
                className="w-full rounded-lg bg-yellow-600 px-4 py-2 text-sm text-white transition-colors hover:bg-yellow-700 disabled:bg-yellow-600/50 lg:py-3 lg:text-base"
              >
                {actionLoading
                  ? "Limpiando..."
                  : "Limpiar Consultas Vacías Antiguas"}
              </button>

              <button
                onClick={triggerCacheRefresh}
                disabled={refreshing}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700 disabled:bg-green-600/50 lg:py-3 lg:text-base"
              >
                {refreshing ? "Refrescando Cache..." : "Actualizar Cache"}
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Cache Info */}
        <Card className="mt-6 border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-gray-900">
              Información del Cache
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-gray-600">
              <div>
                <h4 className="mb-2 font-semibold text-gray-900">
                  Sistema de Cache:
                </h4>
                <ul className="space-y-1 text-sm">
                  <li>• Cache persistente en Firestore (sin TTL)</li>
                  <li>• Datos almacenados en colecciones estructuradas</li>
                  <li>
                    • Verificación automática antes de consultar API externa
                  </li>
                  <li>
                    • Enriquecimiento automático de partidos (stats, events,
                    lineups)
                  </li>
                  <li>
                    • Consultas vacías se guardan para evitar llamadas
                    innecesarias
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-2 font-semibold text-gray-900">
                  Actualización Automática:
                </h4>
                <p className="text-sm">
                  El cache se actualiza automáticamente mediante sincronización
                  programada a través del endpoint cron:{" "}
                  <code className="rounded bg-gray-100 px-2 py-1 text-gray-800">
                    /api/cron/refresh-cache
                  </code>
                  . Las consultas vacías antiguas (más de 30 días) se pueden
                  limpiar manualmente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
