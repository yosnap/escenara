import type { CambioUnico, RegistroEstetico } from "@/lib/direccion";
import {
  ANCLAJES_ANIMADOS,
  ANCLAJES_REALISMO,
  ATRACTIVO_ELEGIDO,
  IDENTIDAD_DE_REFERENCIA,
  REGISTRO_ANCLAJE_INGLES,
  REGISTRO_CAMARA_INGLES,
  REGISTRO_LUZ_INGLES,
  SIN_NOMBRAR_LA_TECNICA,
  SIN_RETOQUE_FINAL,
} from "./ingles";
import { contextoDelLugar, type LugarEnPrompt, SOLO_EL_SITIO_DE_LA_IMAGEN, SUJETO_LUGAR_SOLO } from "./lugar";
import {
  bloqueProducto,
  EXCEPCION_TEXTO_PRODUCTO,
  esInsercionDeCaptura,
  INSERCION_DE_CAPTURA,
  type ProductoEnPrompt,
  REGLA_ETIQUETA_PRODUCTO,
  sustituyeAlSujeto,
} from "./producto";

/**
 * **Método 6C**: la estructura del prompt del **fotograma** del que sale el clip.
 *
 * Seis bloques, siempre en este orden y siempre los seis:
 *
 * | C | Qué fija |
 * |---|---|
 * | C1 | **Personaje**: quién es. Con una persona real, sus referencias y nada más |
 * | C2 | **Cámara**: plano, ángulo y óptica; el realismo de foto hecha con un móvil |
 * | C3 | **Ropa**: outfit, estilismo y accesorios |
 * | C4 | **Contexto**: dónde está y qué hay detrás. Con un lugar, el sitio de su maestra |
 * | C5 | **Luz**: tipo de luz, sombras, grano y ambiente |
 * | C6 | **Anclajes de realismo**: piel de verdad, anatomía correcta y la línea final |
 *
 * **C6 cierra siempre** y el usuario no puede tocarlo (decisión firme del propietario, 2026-09-28): es lo que
 * separa una foto creíble de un render, y su última línea —nada escrito, nada de marca de agua, nada
 * deformado— es la que el modelo obedece mejor por ir la última.
 *
 * Esto sustituye a la plantilla `fotograma-social`, que cubría a medias lo mismo con `especialidad`,
 * `personaje`, `escena`, `vestuario`, `estilo`, `formato` y `accion`, y cuyo único anclaje era el `no text and
 * no logos` del final.
 */

/** Las seis C ya resueltas a inglés. El catálogo (`catalogo.ts`) es quien las traduce desde lo que se eligió. */
export interface SeisC {
  /** Acabado del proyecto. Con animación se conserva el maestro y no se piden fotos ni piel real. */
  animado?: boolean;
  /** C1: quién es. Con personaje real, la ficha y sus referencias; nunca adjetivos de atractivo. */
  personaje: string;
  /**
   * `true` cuando el personaje es una **persona real**. Con una persona real nunca se embellece: ni por
   * catálogo, ni por registro estético, ni porque el usuario lo pida.
   */
  personajeReal: boolean;
  /**
   * `true` solo si el personaje es **inventado** y el usuario ha elegido expresamente el atractivo. Nunca por
   * defecto. Con `personajeReal` se ignora.
   */
  atractivoElegido: boolean;
  /** C2: plano, ángulo y óptica, ya en inglés. Los vacíos se omiten. */
  plano: string;
  angulo: string;
  optica: string;
  /** C3: vestuario y accesorios. */
  ropa: string;
  /** C4: localización del catálogo y el texto libre del usuario, ya traducido. */
  localizacion: string;
  contextoLibre: string;
  /** C5: luz del catálogo. */
  luz: string;
  /** Lo que hace el personaje en el fotograma. */
  accion: string;
  registroEstetico: RegistroEstetico;
  /**
   * C6 del catálogo de quien administra. Vacío = se usa el bloque de reserva del código: un fotograma sin
   * anclajes saldría de plástico, así que aquí no hay «sin anclajes».
   */
  anclajes: string;
  /**
   * El producto que se presenta en el fotograma, ya resuelto a inglés (0.26.0). `null` = ninguno.
   *
   * Va en su propio bloque, **entre la acción y los anclajes**: es una C más de lo que se ve, y lleva pegada
   * la regla de que su etiqueta no se toca. C6 sigue cerrando siempre, que es lo que promete el método.
   */
  producto?: ProductoEnPrompt | null;
  /**
   * El lugar de la escena, ya resuelto a inglés. `null` o ausente = ninguno, y entonces C4 es exactamente lo de
   * siempre. Con lugar, C4 es el sitio de la maestra y el preset de localización no entra.
   */
  lugar?: LugarEnPrompt | null;
}

/**
 * Modo «cambiar solo…»: se parte de un fotograma ya aprobado y se cambia **una** C, dejando el resto literal.
 * Es también el mecanismo del antes/después: dos salidas de la misma imagen con un rasgo cambiado.
 */
export interface CambiarSolo {
  que: CambioUnico;
  /** Lo nuevo, ya en inglés: el outfit, el sitio o la postura. */
  valor: string;
  /** `true` si se acompaña de una segunda imagen de referencia (la prenda o el fondo). */
  conSegundaReferencia: boolean;
}

const etiqueta = (nombre: string, cuerpo: string): string => {
  const texto = cuerpo.trim();
  if (texto === "") return "";
  return `${nombre}: ${/[.!?]$/.test(texto) ? texto : `${texto}.`}`;
};

const unir = (partes: readonly string[]): string =>
  partes
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .join(". ");

/** C1. La identidad sale de las referencias y el atractivo solo entra si se cumplen las dos condiciones. */
function c1Personaje(seis: SeisC): string {
  if (seis.personajeReal) return etiqueta("Subject", unir([seis.personaje, IDENTIDAD_DE_REFERENCIA]));
  const atractivo = seis.atractivoElegido ? ATRACTIVO_ELEGIDO : "";
  return etiqueta("Subject", unir([seis.personaje, atractivo]));
}

/**
 * Compone el prompt del fotograma con las seis C. Función **pura**: se prueba entera sin base de datos y sin
 * proveedor.
 */
export function componerSeisC(seis: SeisC, cambiarSolo?: CambiarSolo): string {
  const cambio = cambiarSolo && cambiarSolo.que !== "ninguno" ? cambiarSolo : null;
  // La C que se cambia toma el valor nuevo; las demás se copian **literales** del fotograma de partida.
  const base: SeisC = cambio
    ? {
        ...seis,
        ...(cambio.que === "outfit" ? { ropa: cambio.valor } : {}),
        ...(cambio.que === "localizacion" ? { localizacion: cambio.valor, contextoLibre: "" } : {}),
        ...(cambio.que === "pose" ? { accion: cambio.valor } : {}),
      }
    : seis;
  const producto = base.producto ?? null;
  /**
   * **Paso 2 del producto digital**: esto no es un fotograma nuevo, es una edición de uno que ya existe y que
   * el usuario ya ha pagado. Describirle otra vez las seis C sería invitarle a rehacer la foto entera; lo que
   * se le pide es que cambie el rectángulo de la pantalla y deje lo demás igual.
   */
  if (esInsercionDeCaptura(producto)) return componerInsercionDeCaptura();
  // Con el plano del producto solo no sale nadie: el sujeto es el producto, y describir además a un personaje
  // metería a una persona en un fotograma que se pidió sin ninguna.
  const soloProducto = sustituyeAlSujeto(producto);
  const lugar = base.lugar ?? null;
  // El plano del lugar solo: el sujeto es el sitio, y ni personaje ni ropa tienen quien los lleve.
  const soloLugar = lugar?.soloLugar === true;
  const sinNadie = soloProducto || soloLugar;
  const bloques = [
    soloLugar ? etiqueta("Subject", SUJETO_LUGAR_SOLO) : soloProducto ? "" : c1Personaje(base),
    etiqueta(
      "Camera",
      unir([base.plano, base.angulo, base.optica, base.animado ? "" : REGISTRO_CAMARA_INGLES[base.registroEstetico]]),
    ),
    sinNadie ? "" : etiqueta("Wardrobe", base.ropa),
    etiqueta(
      "Context",
      lugar
        ? unir([
            contextoDelLugar(lugar),
            base.contextoLibre,
            lugar.conReferencia && !lugar.soloLugar ? SOLO_EL_SITIO_DE_LA_IMAGEN : "",
          ])
        : unir([base.localizacion, base.contextoLibre]),
    ),
    etiqueta("Light", unir([base.luz, base.animado ? "" : REGISTRO_LUZ_INGLES[base.registroEstetico]])),
    etiqueta("Action", base.accion),
    producto ? etiqueta("Product", unir([bloqueProducto(producto), REGLA_ETIQUETA_PRODUCTO])) : "",
  ];
  if (cambio) bloques.push(bloqueCambiarSolo(cambio));
  // C6 va la última **siempre**, y nunca viene vacío: sin catálogo se usa el bloque del código.
  const anclajes = base.animado
    ? ANCLAJES_ANIMADOS
    : base.anclajes.trim() === ""
      ? ANCLAJES_REALISMO
      : base.anclajes.trim();
  bloques.push(
    etiqueta(
      base.animado ? "Animated style" : "Realism",
      unir([
        anclajes,
        base.animado ? "" : REGISTRO_ANCLAJE_INGLES[base.registroEstetico],
        base.animado ? "" : SIN_NOMBRAR_LA_TECNICA,
        // Con una persona real, la regla de no retoque se repite **después** del catálogo: ningún fragmento
        // redactado por alguien puede quedar por delante de ella.
        base.personajeReal && !sinNadie ? SIN_RETOQUE_FINAL : "",
        // Detrás de «nada escrito», para que no borre la etiqueta del producto.
        producto ? EXCEPCION_TEXTO_PRODUCTO : "",
      ]),
    ),
  );
  return bloques.filter((b) => b !== "").join("\n");
}

/**
 * El prompt del **segundo paso del producto digital**: la captura dentro de la pantalla apagada.
 *
 * Lleva la regla de la etiqueta igual que cualquier otro envío con producto —aquí la «etiqueta» es la
 * interfaz de la app, y reescribir sus textos es exactamente el fallo que hay que impedir— y cierra con los
 * anclajes mínimos, que son los que evitan que la pantalla salga como un cartel pegado encima.
 */
export function componerInsercionDeCaptura(): string {
  return [
    etiqueta("Screen insert", INSERCION_DE_CAPTURA),
    etiqueta("Product", REGLA_ETIQUETA_PRODUCTO),
    etiqueta(
      "Realism",
      unir([
        "The screen is part of the photograph: it sits behind the glass, at the same distance and with the same focus as the device",
        SIN_NOMBRAR_LA_TECNICA,
      ]),
    ),
  ].join("\n");
}

const QUE_CAMBIA: Record<Exclude<CambioUnico, "ninguno">, string> = {
  outfit: "the clothing",
  localizacion: "the location and the background",
  pose: "the body pose",
};

/**
 * El bloque que hace que «cambiar solo…» signifique lo que dice: se nombra **qué** cambia y se pide
 * explícitamente que todo lo demás quede idéntico. Sin esa segunda mitad el modelo reencuadra, cambia la luz y
 * devuelve otra foto.
 */
function bloqueCambiarSolo(cambio: CambiarSolo): string {
  const que = QUE_CAMBIA[cambio.que as Exclude<CambioUnico, "ninguno">];
  const segunda = cambio.conSegundaReferencia
    ? " The second reference image shows what it has to become; copy it and nothing else from that image."
    : "";
  return etiqueta(
    "Change only",
    `Start from the first reference image and change only ${que}, to ${cambio.valor.trim()}. Everything else stays identical: the same person, the same face, the same framing, the same camera, the same light and the same background.${segunda}`,
  );
}
