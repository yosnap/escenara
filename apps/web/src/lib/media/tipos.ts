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
  /** URL de la que se descargó, o `null` si se subió desde el equipo. */
  origen: string | null;
  /** Quién lo subió; solo se incluye en la vista de administración. */
  propietario?: { id: string; nombre: string };
  /** Lo que puede hacer quien consulta (el admin no edita la imagen ni borra para siempre lo ajeno). */
  permisos: { editarImagen: boolean; borrarDefinitivo: boolean };
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
  /** Solo los medios de esta colección. */
  coleccion?: string | null;
  /** Solo para administradores: «todos» o el id de un usuario. Por defecto, los propios. */
  propietario?: string | null;
}

export interface EspacioUsado {
  usadoBytes: number;
  /** `null` = sin límite. */
  cuotaBytes: number | null;
}

export interface Coleccion {
  id: string;
  nombre: string;
  total: number;
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
