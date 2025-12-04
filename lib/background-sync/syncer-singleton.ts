import { DataSyncer } from "./DataSyncer";

// Mantener una instancia única de DataSyncer para preservar estadísticas
let globalSyncer: DataSyncer | null = null;

export function getSyncer(apiKey: string): DataSyncer {
  if (!globalSyncer) {
    globalSyncer = new DataSyncer(apiKey);
  }

  return globalSyncer;
}

// Función para resetear el singleton (solo para tests)
export function resetGlobalSyncer(): void {
  globalSyncer = null;
}

