/**
 * Tipos TypeScript para el esquema de Firestore del proyecto Metegol
 *
 * Estos tipos representan las entidades normalizadas almacenadas en Firestore
 * y mantienen compatibilidad con los tipos de la API externa.
 */

import type { Timestamp } from "firebase-admin/firestore";

/**
 * Interface para la colección de ligas
 */
export interface Liga {
  id: string;
  nombre: string;
  pais: string;
  logo: string;
  temporada_actual: string;
  tipo?: string; // "league", "cup", etc.
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
}

/**
 * Interface para la colección de equipos
 */
export interface Equipo {
  id: string;
  nombre: string;
  abreviatura?: string;
  escudo: string;
  ligaId: string; // Referencia a ligas/{ligaId}
  estadio?: string;
  entrenador?: string;
  entrenadorId?: string;
  ciudad?: string;
  fundacion?: number;
  colores?: {
    principal?: string;
    secundario?: string;
  };
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
}

/**
 * Interface para la colección de jugadores
 */
export interface Jugador {
  id: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  edad: number;
  nacionalidad: string;
  posicion: string; // "GK", "DEF", "MID", "FW"
  dorsal: number;
  equipoId: string; // Referencia a equipos/{equipoId}
  foto?: string;
  fecha_nacimiento?: string; // YYYY-MM-DD
  altura?: number; // en cm
  peso?: number; // en kg
  pie_preferido?: "left" | "right" | "both";
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
}

/**
 * Interface para jugadores en formaciones
 */
export interface JugadorFormacion {
  jugadorId: string; // Referencia a jugadores/{jugadorId}
  nombre: string;
  dorsal: number;
  posicion: string;
  grid: string | null; // Formato: "row:col" (ej: "4:3")
  es_titular: boolean;
}

/**
 * Interface para la colección de formaciones
 */
export interface Formacion {
  id: string; // Generado: form_{equipoId}_{partidoId}_{fecha}
  equipoId: string; // Referencia a equipos/{equipoId}
  partidoId: string; // Referencia a partidos/{partidoId}
  fecha: string; // YYYY-MM-DD
  competicion: string;
  ligaId: string; // Referencia a ligas/{ligaId}
  formacion: string; // Ej: "4-3-3"
  entrenador: {
    id: string;
    nombre: string;
    foto?: string;
  };
  alineacion: JugadorFormacion[]; // Jugadores titulares
  suplentes: JugadorFormacion[]; // Jugadores suplentes
  colores?: {
    jugador: {
      principal: string;
      numero: string;
      borde: string;
    };
    portero: {
      principal: string;
      numero: string;
      borde: string;
    };
  };
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
  ttl_expiracion?: Timestamp;
}

/**
 * Interface para el estado de un partido
 */
export interface EstadoPartido {
  largo: string; // "Finalizado", "En vivo", etc.
  corto: string; // "FT", "LIVE", etc.
  tiempo_transcurrido?: number;
}

/**
 * Interface para información básica de equipo en un partido
 */
export interface EquipoPartido {
  id: string; // Referencia a equipos/{equipoId}
  nombre: string;
  logo: string;
}

/**
 * Interface para goles en un partido
 */
export interface GolesPartido {
  local: number;
  visitante: number;
}

/**
 * Interface para estadísticas de un partido
 */
export interface EstadisticaPartido {
  tipo: string; // "Ball Possession", "Shots on Goal", etc.
  valor: number | string;
}

/**
 * Interface para eventos de un partido
 */
export interface EventoPartido {
  tipo: "Goal" | "Card" | "subst"; // Tipo de evento
  tiempo: {
    transcurrido: number;
    extra: number | null;
  };
  jugador: {
    id: string;
    nombre: string;
  };
  asistencia?: {
    id: string | null;
    nombre: string | null;
  };
  detalle: string; // "Normal Goal", "Yellow Card", etc.
  comentario?: string | null;
}

/**
 * Interface para la colección de partidos
 */
export interface Partido {
  id: string;
  ligaId: string; // Referencia a ligas/{ligaId}
  fecha: Timestamp;
  estado: EstadoPartido;
  equipo_local: EquipoPartido;
  equipo_visitante: EquipoPartido;
  goles: GolesPartido;
  estadisticas?: {
    local: EstadisticaPartido[];
    visitante: EstadisticaPartido[];
  };
  eventos?: {
    local: EventoPartido[];
    visitante: EventoPartido[];
  };
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
  ttl_fixture?: Timestamp;
  ttl_detalles?: Timestamp;
}

/**
 * Interface para una posición en la tabla de posiciones
 */
export interface PosicionStanding {
  posicion: number;
  equipo: {
    id: string; // Referencia a equipos/{equipoId}
    nombre: string;
    logo: string;
  };
  puntos: number;
  partidos_jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  goles: {
    a_favor: number;
    en_contra: number;
  };
  diferencia_goles: number;
  forma?: string; // Ej: "WWWWW" (últimos 5 partidos)
  grupo?: string; // Ej: "Group A", "Group B" (para competiciones con grupos)
}

/**
 * Interface para un grupo de posiciones en la tabla
 */
export interface GrupoPosiciones {
  nombre: string; // Nombre del grupo: "Group A", "Group B", etc.
  posiciones: PosicionStanding[];
}

/**
 * Interface para la colección de standings
 */
export interface Standing {
  id: string; // Generado: standings_{ligaId}_{temporada}
  ligaId: string; // Referencia a ligas/{ligaId}
  temporada: string; // Ej: "2024"
  fecha_actualizacion_datos: Timestamp; // Fecha de actualización de los datos de la API
  grupos: GrupoPosiciones[]; // Array de grupos, cada uno con su nombre y posiciones
  fecha_creacion: Timestamp;
  fecha_actualizacion: Timestamp;
  posiciones?: PosicionStanding[];
}

/**
 * Tipos de ayuda para crear documentos (sin timestamps)
 */
export type LigaInput = Omit<Liga, "fecha_creacion" | "fecha_actualizacion">;
export type EquipoInput = Omit<
  Equipo,
  "fecha_creacion" | "fecha_actualizacion"
>;
export type JugadorInput = Omit<
  Jugador,
  "fecha_creacion" | "fecha_actualizacion"
>;
export type FormacionInput = Omit<
  Formacion,
  "fecha_creacion" | "fecha_actualizacion"
>;
export type PartidoInput = Omit<
  Partido,
  "fecha_creacion" | "fecha_actualizacion"
>;
export type StandingInput = Omit<
  Standing,
  "fecha_creacion" | "fecha_actualizacion"
>;

/**
 * Tipos de ayuda para actualizar documentos (campos opcionales)
 */
export type LigaUpdate = Partial<Omit<Liga, "id" | "fecha_creacion">>;
export type EquipoUpdate = Partial<Omit<Equipo, "id" | "fecha_creacion">>;
export type JugadorUpdate = Partial<Omit<Jugador, "id" | "fecha_creacion">>;
export type FormacionUpdate = Partial<Omit<Formacion, "id" | "fecha_creacion">>;
export type PartidoUpdate = Partial<Omit<Partido, "id" | "fecha_creacion">>;
export type StandingUpdate = Partial<Omit<Standing, "id" | "fecha_creacion">>;
