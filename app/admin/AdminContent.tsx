"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";

interface SyncStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastSyncTime: number;
  apiCallsToday: number;
  dataItemsSynced: number;
  queueLength: number;
  runningJobs: number;
}

export interface AdminContentProps {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  refetchDelayMs?: number;
}

export function AdminContent({
  autoRefresh = true,
  refreshIntervalMs = 5000,
  refetchDelayMs = 1000,
}: AdminContentProps = {}) {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/sync");
      if (!response.ok) {
        throw new Error("No se pudieron obtener las estadísticas");
      }

      const data = await response.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron obtener las estadísticas"
      );
    }
  }, []);

  const scheduleStatsRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    if (autoRefresh) {
      refreshTimeoutRef.current = setTimeout(() => {
        fetchStats();
        refreshTimeoutRef.current = null;
      }, refetchDelayMs);
    } else {
      fetchStats();
    }
  }, [autoRefresh, fetchStats, refetchDelayMs]);

  const executeAction = useCallback(
    async (action: string, type?: string) => {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch("/api/admin/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, type }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Error al ejecutar la acción");
        }

        setMessage(data.message || "Acción completada");

        if (data.stats) {
          setStats(data.stats);
        }

        scheduleStatsRefresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Error al ejecutar la acción"
        );
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    },
    [scheduleStatsRefresh]
  );

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

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 lg:mb-8">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 lg:text-3xl">
            🔄 Sistema de Sincronización
          </h1>
          <p className="text-gray-600">
            Panel de control para gestión de datos
          </p>
        </div>

        {/* Stats Overview */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Jobs Totales
            </h3>
            <p className="text-2xl font-bold text-blue-600 lg:text-3xl">
              {stats?.totalJobs || 0}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Completados
            </h3>
            <p className="text-2xl font-bold text-green-600 lg:text-3xl">
              {stats?.completedJobs || 0}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Fallidos
            </h3>
            <p className="text-2xl font-bold text-red-600 lg:text-3xl">
              {stats?.failedJobs || 0}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Cola Actual
            </h3>
            <p className="text-2xl font-bold text-yellow-600 lg:text-3xl">
              {stats?.queueLength || 0}
            </p>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:mb-8 lg:grid-cols-3 lg:gap-6">
          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Jobs Ejecutándose
            </h3>
            <p className="text-xl font-bold text-purple-600 lg:text-2xl">
              {stats?.runningJobs || 0}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              API Calls Hoy
            </h3>
            <p className="text-xl font-bold text-indigo-600 lg:text-2xl">
              {stats?.apiCallsToday || 0}/7500
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  (stats?.apiCallsToday || 0) / 7500 > 0.8
                    ? "bg-red-600"
                    : (stats?.apiCallsToday || 0) / 7500 > 0.6
                      ? "bg-yellow-600"
                      : "bg-green-600"
                }`}
                style={{
                  width: `${Math.min(((stats?.apiCallsToday || 0) / 7500) * 100, 100)}%`,
                }}
              ></div>
            </div>
            <p className="mt-1 text-xs text-gray-500 lg:text-sm">
              {(((stats?.apiCallsToday || 0) / 7500) * 100).toFixed(1)}%
              utilizado
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm lg:p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 lg:text-lg">
              Datos Sincronizados
            </h3>
            <p className="text-xl font-bold text-cyan-600 lg:text-2xl">
              {stats?.dataItemsSynced || 0}
            </p>
          </div>
        </div>

        {/* Last Sync */}
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm lg:mb-8 lg:p-6">
          <h3 className="mb-2 text-base font-semibold text-gray-700 lg:text-lg">
            Última Sincronización
          </h3>
          <p className="text-sm text-gray-600 lg:text-base">
            {stats?.lastSyncTime
              ? new Date(stats.lastSyncTime).toLocaleString()
              : "Nunca"}
          </p>
        </div>

        {/* Control Actions */}
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm lg:mb-8 lg:p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-700 lg:text-lg">
            Acciones de Control
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            <button
              onClick={() => executeAction("smart_sync")}
              disabled={loading}
              className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              🧠 Smart Sync
            </button>

            <button
              onClick={() => executeAction("start_sync")}
              disabled={loading}
              className="rounded-lg bg-green-500 px-3 py-2 text-sm text-white transition-colors hover:bg-green-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              📅 Sync Hoy
            </button>

            <button
              onClick={() => executeAction("historical_sync")}
              disabled={loading}
              className="rounded-lg bg-purple-500 px-3 py-2 text-sm text-white transition-colors hover:bg-purple-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              📚 Sync Histórico
            </button>

            <button
              onClick={() => executeAction("force_sync", "live")}
              disabled={loading}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm text-white transition-colors hover:bg-red-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              🔴 Sync En Vivo
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
            <button
              onClick={() => executeAction("stop")}
              disabled={loading}
              className="rounded-lg bg-gray-500 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              ⏹️ Detener
            </button>

            <button
              onClick={() => executeAction("clear_queue")}
              disabled={loading}
              className="rounded-lg bg-yellow-500 px-3 py-2 text-sm text-white transition-colors hover:bg-yellow-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              🗑️ Limpiar Cola
            </button>
          </div>
        </div>

        {/* Force Sync Options */}
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm lg:mb-8 lg:p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-700 lg:text-lg">
            Sincronización Forzada
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            <button
              onClick={() => executeAction("force_sync", "today")}
              disabled={loading}
              className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white transition-colors hover:bg-orange-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              📅 Forzar Hoy
            </button>

            <button
              onClick={() => executeAction("force_sync", "yesterday")}
              disabled={loading}
              className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white transition-colors hover:bg-orange-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              📆 Forzar Ayer
            </button>

            <button
              onClick={() => executeAction("force_sync", "tomorrow")}
              disabled={loading}
              className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white transition-colors hover:bg-orange-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              📅 Forzar Mañana
            </button>

            <button
              onClick={() => executeAction("force_sync", "live")}
              disabled={loading}
              className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white transition-colors hover:bg-orange-600 disabled:opacity-50 lg:px-4 lg:py-3 lg:text-base"
            >
              🔴 Forzar En Vivo
            </button>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700">
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

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={fetchStats}
            className="rounded-lg bg-gray-500 px-6 py-3 text-sm text-white transition-colors hover:bg-gray-600 lg:text-base"
          >
            🔄 Actualizar Estadísticas
          </button>
        </div>
      </div>
    </div>
  );
}

