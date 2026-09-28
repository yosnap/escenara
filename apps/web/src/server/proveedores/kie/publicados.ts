import { type Capacidad, PARAMETROS_VACIOS } from "@/lib/catalogo";
import type { Buscador } from "../codigos";
import type { ModeloPublicado, TarifaPublicada } from "../contrato";
import type { Operacion, TarifaTraducida } from "./correspondencia";
import { traducirTarifas } from "./correspondencia";
import { familiaDe, parametrosDeFamilia, unidadDeVariante, varianteDeTarifa } from "./familias";
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
const UNIDADES_POR_TRABAJO = ["per image", "per video", "per generation", "per request"];
const UNIDAD_POR_SEGUNDO = "per second";

const esPorTrabajo = (unidad: string) => UNIDADES_POR_TRABAJO.includes(unidad.trim().toLowerCase());
const esPorSegundo = (unidad: string) => unidad.trim().toLowerCase() === UNIDAD_POR_SEGUNDO;

/**
 * Capacidad de Escenara que corresponde a cada operación de la tabla publicada. Solo sirve para que un modelo
 * **sin familia** se vea en el filtro que le toca: como no es elegible, declararla no le deja pedir nada.
 */
const CAPACIDAD_DE_OPERACION: Partial<Record<Operacion, Capacidad>> = {
  "image-to-image": "image_edit",
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
    // Dos registros para la misma variante (el proveedor repite algunos): se queda el más barato, nunca el caro.
    const previa = porUnidad.get(unidad);
    if (!previa || tarifa.creditos < previa.creditos) {
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

/** Catálogo publicado por KIE, ya en lenguaje de Escenara. No consume créditos ni necesita credencial. */
export async function modelosPublicadosDeKie(buscar: Buscador = fetch): Promise<ModeloPublicado[]> {
  const traducidas = traducirTarifas(await descargarTarifas(buscar));
  const publicados: ModeloPublicado[] = [];
  for (const [modelo, tarifas] of porModelo(traducidas)) {
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
