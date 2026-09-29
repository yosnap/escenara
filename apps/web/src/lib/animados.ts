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
