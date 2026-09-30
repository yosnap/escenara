import { NORMAS_POR_DEFECTO } from "@/lib/comunidad";

/**
 * Ajustes de la comunidad. Viven aparte para no hacer crecer `ajustes.ts`; se suman a `Ajustes`, a sus valores de
 * fábrica y a su validación desde allí.
 */
export interface AjustesComunidad {
  /**
   * La comunidad entera (galería, publicar, usar, retos). **Apagada de fábrica**: publicar enseña contenido de una cuenta
   * a las demás, y eso lo decide quien administra. Apagada, nada publicado se ve y no se puede publicar; los logros sí.
   */
  comunidadActiva: boolean;
  /** Normas de publicación, una por línea. Se enseñan al publicar y en la galería. */
  comunidadNormas: string;
  /** Publicaciones pendientes de moderación que una cuenta puede tener a la vez: la cola no se llena desde una sola. */
  comunidadMaximoPendientes: number;
}

export const AJUSTES_COMUNIDAD_POR_DEFECTO: AjustesComunidad = {
  comunidadActiva: false,
  comunidadNormas: NORMAS_POR_DEFECTO,
  comunidadMaximoPendientes: 5,
};

export const VALIDACION_COMUNIDAD: Record<
  keyof AjustesComunidad,
  { valido: (v: unknown) => boolean; mensaje: string }
> = {
  comunidadActiva: { valido: (v) => typeof v === "boolean", mensaje: "Debe ser sí o no." },
  comunidadNormas: {
    valido: (v) => typeof v === "string" && v.trim().length >= 20 && v.length <= 4000,
    mensaje: "Escribe las normas con entre 20 y 4000 caracteres, una por línea.",
  },
  comunidadMaximoPendientes: {
    valido: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50,
    mensaje: "Indica de 1 a 50 publicaciones pendientes por cuenta.",
  },
};
