/** El acabado visual pertenece a la identidad del personaje y se congela en cada versión. */
export const ESTILOS_RENDER = ["realista", "animado"] as const;
export type EstiloRender = (typeof ESTILOS_RENDER)[number];

export const esEstiloRender = (valor: unknown): valor is EstiloRender => ESTILOS_RENDER.includes(valor as EstiloRender);

/** Claves de la semilla. El texto del preset lo puede editar quien administra. */
export const ESTILOS_ANIMADOS = ["ilustracion-plana", "tres-d-estilizado", "anime"] as const;
export type EstiloAnimado = (typeof ESTILOS_ANIMADOS)[number];

export const ETIQUETA_ESTILO_ANIMADO: Record<EstiloAnimado, string> = {
  "ilustracion-plana": "Ilustración plana",
  "tres-d-estilizado": "3D estilizado",
  anime: "Anime",
};

/** Instantánea del preset y de los matices elegidos. Un cambio en Admin no altera una versión ya generada. */
export interface GuiaEstiloAnimado {
  preset: string;
  prompt: string;
  paleta: string;
  trazo: string;
  detalle: string;
  referencias: string[];
}

export const GUIA_ESTILO_VACIA: GuiaEstiloAnimado = {
  preset: "",
  prompt: "",
  paleta: "",
  trazo: "",
  detalle: "",
  referencias: [],
};

/**
 * `true` si dos guías de estilo dicen lo mismo, campo a campo. No se comparan con `JSON.stringify`: PostgreSQL
 * devuelve las columnas `jsonb` con las claves reordenadas, así que la misma guía leída de la base de datos y
 * recién compuesta daría dos cadenas distintas y parecería un cambio de estilo que no existe. Un campo ausente
 * (versiones antiguas) cuenta como vacío, que es lo que significa en el prompt.
 */
export function mismaGuiaDeEstilo(
  a: Partial<GuiaEstiloAnimado> | null | undefined,
  b: Partial<GuiaEstiloAnimado> | null | undefined,
): boolean {
  const campos = ["preset", "prompt", "paleta", "trazo", "detalle"] as const;
  if (campos.some((campo) => (a?.[campo] ?? "") !== (b?.[campo] ?? ""))) return false;
  const referenciasA = a?.referencias ?? [];
  const referenciasB = b?.referencias ?? [];
  return referenciasA.length === referenciasB.length && referenciasA.every((r, i) => r === referenciasB[i]);
}

export function bloqueDeEstiloAnimado(guia: GuiaEstiloAnimado): string {
  const partes = [
    "Estilo visual obligatorio: animación o ilustración, nunca imagen de acción real ni piel fotorrealista.",
    guia.prompt,
    guia.paleta ? `Paleta: ${guia.paleta}.` : "",
    guia.trazo ? `Trazo y materiales: ${guia.trazo}.` : "",
    guia.detalle ? `Nivel de detalle: ${guia.detalle}.` : "",
    ...guia.referencias.map((referencia) => `Referencia descriptiva: ${referencia}.`),
    "Mantén el mismo diseño, colores, silueta y rasgos del fotograma maestro en todos los planos.",
  ];
  return partes.filter(Boolean).join(" ");
}
