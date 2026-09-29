import { and, eq, isNull } from "drizzle-orm";
import { GUIA_ESTILO_VACIA, type GuiaEstiloAnimado } from "@/lib/animados";
import { limpiarCampoFicha } from "@/lib/ficha-personaje";
import { nombresRealesEn } from "@/lib/nombres-reales";
import { db } from "../db/cliente";
import { presets } from "../db/esquema";
import { ErrorPersonaje } from "../personajes/errores";
import { valoresDeTexto } from "../prompts/consulta";

/** Solo las claves activas del catálogo de la instalación se pueden fijar en una identidad. */
export async function guiaDeEstiloPedida(entrada: {
  estilo: unknown;
  paleta?: unknown;
  trazo?: unknown;
  detalle?: unknown;
  referencias?: unknown;
  /** La versión ya elegida conserva su texto aunque el administrador cambie o desactive el preset. */
  anterior?: GuiaEstiloAnimado;
}): Promise<{ renderStyle: "realista" | "animado"; styleGuide: GuiaEstiloAnimado }> {
  if (entrada.estilo === undefined || entrada.estilo === "realista") {
    return { renderStyle: "realista", styleGuide: GUIA_ESTILO_VACIA };
  }
  if (typeof entrada.estilo !== "string" || entrada.estilo.length > 80 || entrada.estilo.trim() === "") {
    throw new ErrorPersonaje(400, "Elige un estilo animado de los que ofrece esta instalación.");
  }
  const conserva = entrada.anterior?.preset === entrada.estilo;
  const [preset] = conserva
    ? []
    : await db()
        .select({ values: presets.values })
        .from(presets)
        .where(
          and(
            isNull(presets.ownerId),
            eq(presets.category, "estilo-animado"),
            eq(presets.slug, entrada.estilo),
            eq(presets.active, true),
          ),
        )
        .limit(1);
  if (!conserva && !preset) {
    throw new ErrorPersonaje(409, "Este estilo animado no está activo en Admin › Presets. Elige otro o actívalo allí.");
  }
  const prompt = conserva ? entrada.anterior?.prompt : preset ? valoresDeTexto(preset.values).prompt : "";
  if (!prompt) {
    throw new ErrorPersonaje(
      409,
      "Este estilo animado no tiene instrucciones en Admin › Presets. Complétalas antes de usarlo.",
    );
  }
  const campo = (valor: unknown, nombre: string, maximo: number): string => {
    if (valor === undefined || valor === null || valor === "") return "";
    if (typeof valor !== "string" || valor.length > maximo) {
      throw new ErrorPersonaje(400, `${nombre} debe ser texto de hasta ${maximo} caracteres.`);
    }
    return limpiarCampoFicha(valor);
  };
  const referencias = entrada.referencias ?? [];
  if (!Array.isArray(referencias) || referencias.length > 3) {
    throw new ErrorPersonaje(400, "La guía admite hasta tres referencias descriptivas.");
  }
  const guia: GuiaEstiloAnimado = {
    preset: entrada.estilo,
    prompt,
    paleta: campo(entrada.paleta, "La paleta", 120),
    trazo: campo(entrada.trazo, "El trazo", 120),
    detalle: campo(entrada.detalle, "El nivel de detalle", 120),
    referencias: referencias.map((r) => campo(r, "Cada referencia", 160)).filter(Boolean),
  };
  const reales = nombresRealesEn([guia.paleta, guia.trazo, guia.detalle, ...guia.referencias].join(" "));
  if (reales.length > 0) {
    throw new ErrorPersonaje(422, "La guía de un personaje inventado no puede nombrar a una persona real.");
  }
  return { renderStyle: "animado", styleGuide: guia };
}
