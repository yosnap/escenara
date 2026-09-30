import type { DocumentoMarca } from "./marca-esquema";
import type { EsquinaKit } from "./marca-kit";

/** Tipos de la marca que comparten el servidor y las pantallas de `/admin/marca` y `/cuenta/kit`. */

/** Papel de cada logotipo de la instalación. */
export const ROLES_LOGO = ["horizontal-claro", "horizontal-oscuro", "simbolo-claro", "simbolo-oscuro"] as const;
export type RolLogo = (typeof ROLES_LOGO)[number];

export const NOMBRE_ROL_LOGO: Record<RolLogo, string> = {
  "horizontal-claro": "Logotipo horizontal para tema claro",
  "horizontal-oscuro": "Logotipo horizontal para tema oscuro",
  "simbolo-claro": "Símbolo para tema claro",
  "simbolo-oscuro": "Símbolo para tema oscuro",
};

/** Activos que se generan al publicar a partir del símbolo (o del logotipo horizontal si no hay símbolo). */
export const ROLES_DERIVADO = ["favicon-16", "favicon-32", "icono-192", "icono-512", "imagen-social"] as const;
export type RolDerivado = (typeof ROLES_DERIVADO)[number];

/** Fuente propia que usa una versión: el archivo y la familia con la que se declara. */
export interface FuenteDeVersion {
  activoId: string;
  familia: string;
}

/** Activos de una versión: por papel, el identificador de su archivo. */
export interface ActivosDeVersion {
  logos: Partial<Record<RolLogo, string>>;
  fuentes: FuenteDeVersion[];
}

/** URL de nuestra ruta que sirve un archivo de marca. Es la única que acaba en el CSS de una fuente propia. */
export const urlDeActivoMarca = (id: string) => `/api/marca/activos/${id}`;

export const LICENCIAS_FUENTE = {
  ofl: "SIL Open Font License (OFL)",
  apache: "Apache 2.0",
  propia: "Fuente propia (los derechos son míos o de mi organización)",
  comercial: "Licencia comercial con uso web",
} as const;
export type TipoLicenciaFuente = keyof typeof LICENCIAS_FUENTE;

export interface ActivoVista {
  id: string;
  url: string;
  mime: string;
  ancho: number | null;
  alto: number | null;
  familia: string | null;
  licencia: { tipo: TipoLicenciaFuente; titular: string; declaradaEn: string } | null;
}

export type EstadoVersionMarca = "borrador" | "publicada" | "retirada";

export interface VersionMarcaVista {
  id: string;
  version: number;
  estado: EstadoVersionMarca;
  documento: DocumentoMarca;
  activos: ActivosDeVersion;
  notas: string;
  creadaEn: string;
  publicadaEn: string | null;
}

export interface EstadoMarcaVista {
  borrador: VersionMarcaVista | null;
  publicada: VersionMarcaVista | null;
  /** Versiones ya publicadas alguna vez, de la más reciente a la más antigua. */
  historial: VersionMarcaVista[];
  /** Marca de referencia de Escenara: de ella nace el primer borrador. */
  base: DocumentoMarca;
  /** Archivos que usan el borrador, la publicada o el historial, por identificador. */
  activos: Record<string, ActivoVista>;
}

export interface KitVista {
  nombre: string;
  logo: ActivoVista | null;
  esquina: EsquinaKit;
  activo: boolean;
}
