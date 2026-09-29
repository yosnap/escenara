import { type Capacidad, PARAMETROS_VACIOS } from "@/lib/catalogo";
import type { Buscador } from "../codigos";
import type { ModeloPublicado, TarifaPublicada } from "../contrato";
import { CAPACIDADES_DE_CANTO, familiaDeCantoDe, parametrosDeCanto, tarifasDeCanto } from "./canto";
import type { Operacion, TarifaTraducida } from "./correspondencia";
import { traducirTarifas } from "./correspondencia";
import {
  type FamiliaDeVideo,
  familiaDe,
  familiaDeVideoDe,
  parametrosDeFamilia,
  unidadDeClip,
  unidadDeVariante,
  varianteDeTarifa,
} from "./familias";
import { descargarTarifas } from "./precios-publicos";

/**
 * Catálogo de KIE **tal como lo publica el proveedor** (0.23.0): se descarga su tabla de precios pública, se
 * traduce cada registro a un identificador de la API y se junta por modelo.
 *
 * Lo que sale de aquí es lo que el importador guarda. Dos reglas que no se negocian:
 *
 * - un modelo con **familia** (esta instalación sabe con qué campos pedírselo) sale `montable`, y con eso se
 *   puede elegir, estimar y generar con la tarifa publicada;
 * - un modelo **sin familia** sale igualmente, con su precio a la vista y con el motivo escrito, pero no
 *   `montable`: se ve en el catálogo y no se puede elegir. Adivinar sus campos costaría dinero.
 */

const MOTIVO_SIN_FAMILIA =
  "Esta instalación todavía no sabe con qué parámetros pedirle nada a este modelo, así que no se puede elegir.";

const MOTIVO_TARIFA_VARIABLE =
  "El proveedor cobra este modelo por una unidad que no se conoce antes de generar, así que no se puede estimar.";

/**
 * Unidades publicadas que se pueden convertir en «créditos por trabajo». Las de imagen se pagan por imagen y
 * las de vídeo por clip; `per second` también vale porque la duración se elige **antes** de generar (comprobado:
 * MiniMax H3 a 8 créditos/segundo × 5 s son los 40 que cobró de verdad el 2026-09-28).
 *
 * Fuera quedan `per megapixel`, `per million tokens` y similares: dependen de lo que salga, no de lo que se
 * pide, y un precio que no se sabe antes no se puede confirmar.
 */
// «per vedio» es una errata del proveedor en las tarifas de Gemini Omni: significa «per video», y descartarla
// dejaría sin precio justo las duraciones que se quieren ofrecer.
const UNIDADES_POR_TRABAJO = ["per image", "per video", "per vedio", "per generation", "per request"];
const UNIDAD_POR_SEGUNDO = "per second";

const esPorTrabajo = (unidad: string) => UNIDADES_POR_TRABAJO.includes(unidad.trim().toLowerCase());
const esPorSegundo = (unidad: string) => unidad.trim().toLowerCase() === UNIDAD_POR_SEGUNDO;

/**
 * Capacidad de Escenara que corresponde a cada operación de la tabla publicada. Solo sirve para que un modelo
 * **sin familia** se vea en el filtro que le toca: como no es elegible, declararla no le deja pedir nada.
 */
const CAPACIDAD_DE_OPERACION: Partial<Record<Operacion, Capacidad>> = {
  "image-to-image": "image_edit",
  "text-to-image": "text_to_image",
  "image-to-video": "image_to_video",
  "text-to-video": "text_to_video",
};

/** Agrupa las tarifas traducidas por identificador de modelo, conservando el orden del proveedor. */
function porModelo(traducidas: readonly TarifaTraducida[]): Map<string, TarifaTraducida[]> {
  const grupos = new Map<string, TarifaTraducida[]>();
  for (const tarifa of traducidas) {
    grupos.set(tarifa.modelo, [...(grupos.get(tarifa.modelo) ?? []), tarifa]);
  }
  return grupos;
}

/** Tarifas de un modelo **con familia**: solo las variantes que esta instalación ofrece, y solo por trabajo. */
function tarifasDeFamilia(modelo: string, tarifas: readonly TarifaTraducida[]): TarifaPublicada[] {
  const familia = familiaDe(modelo);
  if (!familia) return [];
  const porUnidad = new Map<string, TarifaPublicada>();
  for (const tarifa of tarifas) {
    if (!esPorTrabajo(tarifa.unidadPublicada)) continue;
    const variante = varianteDeTarifa(familia, tarifa.variante);
    if (!variante) continue;
    const unidad = unidadDeVariante(variante);
    // Dos registros para la misma variante (el proveedor repite algunos): se queda **el más caro**. Estimar por lo
    // alto solo hace confirmar de más; estimar por lo bajo haría reservar menos de lo que después se cobra.
    const previa = porUnidad.get(unidad);
    if (!previa || tarifa.creditos > previa.creditos) {
      porUnidad.set(unidad, { unidad, creditos: tarifa.creditos, referencia: tarifa.ancla });
    }
  }
  // En el orden de la familia: la primera variante es la de por defecto y es la que se le pone a un modelo nuevo.
  return familia.variantes
    .map((v) => porUnidad.get(unidadDeVariante(v)))
    .filter((t): t is TarifaPublicada => t !== undefined);
}

/**
 * Tarifas de un modelo **sin familia**: solo para enseñarlas. Se toma la más barata de las que se pagan por
 * trabajo o por segundo, para que la ficha diga por dónde anda su precio sin prometer que se puede usar.
 */
function tarifaDeReferencia(tarifas: readonly TarifaTraducida[]): TarifaPublicada | null {
  const utiles = tarifas.filter((t) => esPorTrabajo(t.unidadPublicada) || esPorSegundo(t.unidadPublicada));
  const barata = utiles.reduce<TarifaTraducida | null>(
    (mejor, t) => (mejor === null || t.creditos < mejor.creditos ? t : mejor),
    null,
  );
  if (!barata) return null;
  const detalle = [barata.variante.resolucion, barata.variante.calidad].filter((p) => p !== "").join(" ");
  const unidad = esPorSegundo(barata.unidadPublicada)
    ? `segundo${detalle === "" ? "" : ` a ${detalle}`}`
    : `trabajo${detalle === "" ? "" : ` a ${detalle}`}`;
  return { unidad, creditos: barata.creditos, referencia: barata.ancla };
}

/**
 * Tarifas de un modelo de vídeo **por duración**: una fila por cada duración que el modelo admite y que el
 * proveedor tarifa a la resolución que esta instalación pide. Nada se escala ni se interpola: una duración sin
 * tarifa publicada no se ofrece, porque un precio que no se sabe antes no se puede confirmar.
 */
function tarifasDeVideo(familia: FamiliaDeVideo, tarifas: readonly TarifaTraducida[]): TarifaPublicada[] {
  const porDuracion = new Map<number, TarifaPublicada>();
  for (const tarifa of tarifas) {
    if (!esPorTrabajo(tarifa.unidadPublicada)) continue;
    const { segundos, resolucion } = tarifa.variante;
    if (!familia.duraciones.includes(segundos)) continue;
    if (resolucion.toLowerCase() !== familia.resolucion.toLowerCase()) continue;
    const unidad = unidadDeClip(segundos, familia.resolucion);
    const previa = porDuracion.get(segundos);
    // Dos registros para la misma duración: se queda el más caro, igual que en las imágenes.
    if (!previa || tarifa.creditos > previa.creditos) {
      porDuracion.set(segundos, { unidad, creditos: tarifa.creditos, referencia: tarifa.ancla });
    }
  }
  return [...porDuracion.entries()].sort(([a], [b]) => a - b).map(([, tarifa]) => tarifa);
}

/** Catálogo publicado por KIE, ya en lenguaje de Escenara. No consume créditos ni necesita credencial. */
export async function modelosPublicadosDeKie(buscar: Buscador = fetch): Promise<ModeloPublicado[]> {
  const traducidas = traducirTarifas(await descargarTarifas(buscar));
  const publicados: ModeloPublicado[] = [];
  for (const [modelo, tarifas] of porModelo(traducidas)) {
    /**
     * **Modelos de canto** (0.29.0). Van primero porque su precio se publica «per second» y el resto del
     * importador solo sabe trabajar con tarifas por trabajo: si cayeran en la rama de siempre, se quedarían en
     * «tarifa variable» y no se podrían elegir. Lo que hace su rama es convertir esa tarifa por segundo en una
     * tarifa por cada duración facturable, que es lo que permite confirmar y reservar el clip exacto.
     */
    const canto = familiaDeCantoDe(modelo);
    if (canto) {
      const suyas = tarifasDeCanto(canto, tarifas);
      publicados.push({
        modelo,
        nombre: canto.nombre,
        capacidades: [...CAPACIDADES_DE_CANTO],
        // El clip suena: lo que se oye es el audio que se le envía, no una voz que él genere.
        conVoz: true,
        parametros: parametrosDeCanto(canto),
        tarifas: suyas,
        montable: suyas.length > 0,
        notas: suyas.length > 0 ? canto.notas : MOTIVO_TARIFA_VARIABLE,
        referencia: tarifas[0]?.ancla ?? "",
      });
      continue;
    }
    const video = familiaDeVideoDe(modelo);
    if (video) {
      const suyas = tarifasDeVideo(video, tarifas);
      publicados.push({
        modelo,
        nombre: video.nombre,
        capacidades: [...video.capacidades],
        conVoz: true,
        parametros: {
          duraciones: suyas.flatMap((t) => {
            const segundos = Number(/de (\d+) s/.exec(t.unidad)?.[1] ?? "");
            return Number.isFinite(segundos) && segundos > 0 ? [segundos] : [];
          }),
          proporciones: ["9:16"],
          resoluciones: [video.resolucion],
          formatosReferencia: ["image/jpeg", "image/png", "image/webp"],
          maximoReferencias: 7,
        },
        tarifas: suyas,
        montable: suyas.length > 0,
        notas: suyas.length > 0 ? video.notas : MOTIVO_TARIFA_VARIABLE,
        referencia: tarifas[0]?.ancla ?? "",
      });
      continue;
    }
    const familia = familiaDe(modelo);
    const nombre = familia?.nombre ?? tarifas[0]?.nombre ?? modelo;
    if (familia) {
      const suyas = tarifasDeFamilia(modelo, tarifas);
      // Una familia cuyas variantes no aparecen en la tabla publicada no se puede estimar: entra sin precio.
      publicados.push({
        modelo,
        nombre,
        capacidades: [...familia.capacidades],
        conVoz: false,
        parametros: parametrosDeFamilia(familia, familia.variantes[0] ?? { resolucion: "", calidad: "" }),
        tarifas: suyas,
        montable: suyas.length > 0,
        notas: suyas.length > 0 ? familia.notas : MOTIVO_TARIFA_VARIABLE,
        referencia: tarifas[0]?.ancla ?? "",
      });
      continue;
    }
    const referencia = tarifaDeReferencia(tarifas);
    publicados.push({
      modelo,
      nombre,
      capacidades: [
        ...new Set(
          tarifas.flatMap((t) => {
            const capacidad = CAPACIDAD_DE_OPERACION[t.operacion];
            return capacidad ? [capacidad] : [];
          }),
        ),
      ],
      conVoz: false,
      parametros: { ...PARAMETROS_VACIOS },
      tarifas: referencia ? [referencia] : [],
      montable: false,
      notas: MOTIVO_SIN_FAMILIA,
      referencia: tarifas[0]?.ancla ?? "",
    });
  }
  return publicados;
}
