import type { TipoMedio } from "./reglas";

/** Medio tal como lo devuelve la API. `url` es temporal: caduca en una hora. */
export interface Medio {
  id: string;
  tipo: TipoMedio;
  nombre: string;
  mime: string;
  tamano: number;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
  titulo: string;
  altEs: string;
  altEn: string;
  url: string;
  creadoEn: string;
  actualizadoEn: string;
  enPapelera: boolean;
}

export interface PaginaMedios {
  elementos: Medio[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface FiltroMedios {
  busqueda: string;
  /** Vacío = todos los tipos. */
  tipos: TipoMedio[];
  papelera: boolean;
  pagina: number;
}

export interface CambiosMetadatos {
  titulo?: string;
  altEs?: string;
  altEn?: string;
}

/** Datos que el navegador lee del vídeo o audio antes de subirlo (el servidor no los calcula). */
export interface DatosReproduccion {
  duracion?: number;
  ancho?: number;
  alto?: number;
}
