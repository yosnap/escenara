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
  /**
   * `true` en los documentos de consentimiento: se guardan sin recortar ni reconvertir (un documento reducido
   * puede dejar de ser legible) y no se pueden usar como referencia de un personaje ni elegirse en «Crear».
   */
  documento: boolean;
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
  /**
   * `true` deja fuera del listado los documentos de consentimiento. Lo usan los selectores que eligen fotos
   * (referencias de personaje y «Crear»); la biblioteca los sigue mostrando, porque son archivos del usuario.
   */
  sinDocumentos?: boolean;
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
