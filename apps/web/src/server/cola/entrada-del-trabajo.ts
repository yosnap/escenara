import { esVista, proporcionDeVista } from "@/lib/captura-personaje";
import { CAPACIDAD_DE_TIPO, type ModeloVista } from "@/lib/catalogo";
import { esLadoReparto, esMiradaReparto } from "@/lib/reparto";
import type { PresenteDeEnvio, RepartoDeEnvio, TurnoDeEnvio } from "@/lib/reparto-envio";
import { type ParametrosVoz, parametrosVozDe } from "@/lib/voz";
import type { FilaTrabajo } from "../db/esquema";
import type { ReservaAutorizada } from "../mapa/voz";

/**
 * Lo que el despacho lee de la entrada guardada de un trabajo al encolarlo. Son lecturas puras y tolerantes:
 * un trabajo anterior a que se guardara un dato devuelve el valor neutro en lugar de fallar.
 */

/**
 * Capacidad con la que hay que resolver este trabajo. Un fotograma **sin imagen de partida** lo genera un
 * modelo de texto a imagen, y buscarlo entre los de edición diría que el modelo «no sirve para esto» cuando lo
 * que pasa es que se está buscando en la lista equivocada.
 */
export function capacidadDelTrabajo(fila: FilaTrabajo) {
  if (fila.kind === "fotograma") return sinReferenciaDe(fila) ? "text_to_image" : CAPACIDAD_DE_TIPO.fotograma;
  /**
   * Un clip **cantado** (0.29.0) se encola como `animacion` —lo que produce es el clip de la escena, y el cierre
   * de la cola ya sabe qué hacer con uno—, pero su modelo es de lip-sync y su capacidad es `audio_to_video`.
   * Buscarlo entre los de `image_to_video` diría que el modelo «no sirve para esto» cuando lo que pasa es que se
   * está buscando en la lista equivocada, igual que con el fotograma sin imagen de partida.
   */
  if (fila.kind === "animacion" && esCantoDe(fila)) return "audio_to_video";
  return CAPACIDAD_DE_TIPO[fila.kind];
}

/**
 * `true` si el trabajo se encoló como **clip cantado**: su clip sale de un audio subido y no de animar un
 * fotograma. Lectura tolerante, como el resto: un trabajo anterior a esta versión devuelve `false`.
 */
export function esCantoDe(fila: FilaTrabajo): boolean {
  return (fila.input as { canto?: unknown }).canto === true;
}

/** `true` si el trabajo se encoló para generarse sin ninguna imagen de partida. */
export function sinReferenciaDe(fila: FilaTrabajo): boolean {
  const input = fila.input as { retratoInventado?: unknown; sinReferencia?: unknown };
  return input.retratoInventado === true || input.sinReferencia === true;
}

/** Unidad de precio que se confirmó al encolar; `null` en los trabajos anteriores a que se guardara. */
export function unidadConfirmadaDe(fila: FilaTrabajo): string | null {
  const unidad = (fila.input as { unidadPrecio?: unknown }).unidadPrecio;
  return typeof unidad === "string" && unidad !== "" ? unidad : null;
}

/**
 * Duración que se le pidió al proveedor al encolar, tal como quedó en la entrada guardada; `null` en un trabajo
 * anterior a que la duración se eligiera, que se queda con la que declare su modelo.
 */
export function segundosDe(fila: FilaTrabajo): number | null {
  const parametros = (fila.input as { parametros?: unknown }).parametros;
  if (!parametros || typeof parametros !== "object") return null;
  const segundos = (parametros as { segundos?: unknown }).segundos;
  return typeof segundos === "number" && segundos > 0 ? segundos : null;
}

/**
 * Reservas autorizadas de una voz, **en orden**, tal como quedaron guardadas al encolar (0.21.1). Cada una trae
 * su tope en la moneda de su proveedor: es lo único a donde puede ir el relevo automático, porque es lo único
 * cuyo coste el usuario ha visto y ha autorizado.
 */
export function reservasAutorizadas(fila: FilaTrabajo): ReservaAutorizada[] {
  const guardadas = (fila.input as { reservas?: unknown }).reservas;
  if (!Array.isArray(guardadas)) return [];
  const salida: ReservaAutorizada[] = [];
  for (const cruda of guardadas) {
    const r = cruda as Record<string, unknown>;
    if (typeof r?.proveedor !== "string" || typeof r.modelo !== "string" || typeof r.creditos !== "number") continue;
    salida.push({
      proveedor: r.proveedor,
      compatibleId: typeof r.compatibleId === "string" ? r.compatibleId : null,
      modelo: r.modelo,
      creditos: r.creditos,
      familia: r.familia === "kokoro" ? "kokoro" : "elevenlabs",
      urlBase: typeof r.urlBase === "string" ? r.urlBase : "",
    });
  }
  return salida;
}

/** Reservas de este trabajo que quedan por probar: las que van después del proveedor y modelo que acaban de fallar. */
export function reservasPendientes(fila: FilaTrabajo): ReservaAutorizada[] {
  const todas = reservasAutorizadas(fila);
  const yaUsada = todas.findIndex((r) => r.proveedor === fila.provider && r.modelo === fila.model);
  return yaUsada === -1 ? todas : todas.slice(yaUsada + 1);
}

/** Dirección base del servicio compatible que quedó guardada al encolar; vacía en los demás proveedores. */
export function urlBaseDe(fila: FilaTrabajo): string {
  const url = (fila.input as { urlBase?: unknown }).urlBase;
  return typeof url === "string" ? url : "";
}

/** Muestra de voz que este trabajo usa como audio de referencia; vacío en todo lo que no la use. */
export function audioDeReferenciaDe(fila: FilaTrabajo): string {
  const guardado = (fila.input as { audioDeReferencia?: unknown }).audioDeReferencia;
  return typeof guardado === "string" ? guardado : "";
}

/**
 * Personajes registrados en el proveedor que este trabajo tiene que citar (modo `omni`, 0.22.0), tal como
 * quedaron guardados al encolar. Vacío en todo lo demás, que es todo lo anterior a la 0.22.0.
 */
export function personajesOmniDe(fila: FilaTrabajo): string[] {
  const guardados = (fila.input as { personajesOmni?: unknown }).personajesOmni;
  if (!Array.isArray(guardados)) return [];
  return guardados.filter((id): id is string => typeof id === "string" && id !== "");
}

/**
 * Fotos del **producto** que este trabajo tiene que enviar como referencia (0.26.0), tal como quedaron al
 * encolar y en el orden en que se decidió enviarlas. Aquí no se vuelve a repartir nada contra el tope del
 * modelo: el reparto se hizo al encolar, es lo que se avisó y es lo que el usuario confirmó.
 */
export function referenciasDeProductoDe(fila: FilaTrabajo): string[] {
  const guardadas = (fila.input as { referenciasProducto?: unknown }).referenciasProducto;
  if (!Array.isArray(guardadas)) return [];
  return guardadas.filter((id): id is string => typeof id === "string" && id !== "");
}

/** Identificador del servicio compatible con el que se encoló, si lo hubo. */
export function compatibleIdDe(fila: FilaTrabajo): string {
  const guardado = (fila.input as { compatibleId?: unknown }).compatibleId;
  if (typeof guardado === "string" && guardado !== "") return guardado;
  // Tras un relevo, el servicio es el de la reserva a la que se encaminó.
  const usada = reservasAutorizadas(fila).find((r) => r.proveedor === fila.provider && r.modelo === fila.model);
  return usada?.compatibleId ?? "";
}

/**
 * **Reparto de dos personajes** de este trabajo (0.28.0), tal como quedó guardado al encolar: quién sale, por qué
 * lado, adónde mira y qué dice en cada turno.
 *
 * Se lee de aquí y **no se vuelve a calcular** desde la escena: entre encolar y despachar el usuario puede haber
 * cambiado los turnos o el lado, y lo que se paga tiene que ser lo que confirmó. La lectura es tolerante y
 * devuelve `null` en todo lo anterior a esta versión, que es todo lo que no tiene reparto.
 */
export function repartoDeEnvioDe(fila: FilaTrabajo): RepartoDeEnvio | null {
  const guardado = (fila.input as { reparto?: unknown }).reparto;
  if (!guardado || typeof guardado !== "object") return null;
  const r = guardado as Record<string, unknown>;
  if (r.formato !== "podcast" && r.formato !== "dualcast") return null;
  if (!Array.isArray(r.presentes) || !Array.isArray(r.turnos)) return null;
  const presentes: PresenteDeEnvio[] = [];
  for (const crudo of r.presentes) {
    const p = (crudo ?? {}) as Record<string, unknown>;
    if (typeof p.nombre !== "string" || !esLadoReparto(p.lado) || !esMiradaReparto(p.mirada)) continue;
    presentes.push({ nombre: p.nombre, lado: p.lado, mirada: p.mirada, habla: p.habla === true });
  }
  if (presentes.length === 0) return null;
  const turnos: TurnoDeEnvio[] = [];
  for (const crudo of r.turnos) {
    const t = (crudo ?? {}) as Record<string, unknown>;
    if (typeof t.nombre !== "string" || typeof t.texto !== "string" || t.texto === "") continue;
    turnos.push({ nombre: t.nombre, texto: t.texto, direccion: typeof t.direccion === "string" ? t.direccion : "" });
  }
  return {
    formato: r.formato,
    presentes,
    turnos,
    orden: typeof r.orden === "number" && r.orden > 0 ? r.orden : 1,
  };
}

/** Lo que dice el personaje, tal como se guardó al encolar. Lo usan el clip y la voz. */
export function dialogoDe(fila: FilaTrabajo): string {
  const dialogo = (fila.input as { dialogo?: unknown }).dialogo;
  return typeof dialogo === "string" ? dialogo : "";
}

/**
 * Proporción que se **eligió** para este trabajo al encolarlo (0.41.0: el formato de la pieza o del proyecto), o
 * `null` si no se eligió ninguna y manda la del modelo. Es la que el despacho le vuelve a pedir al proveedor.
 */
export function proporcionElegidaDe(fila: Pick<FilaTrabajo, "input">): string | null {
  const proporcion = (fila.input as { proporcion?: unknown }).proporcion;
  return typeof proporcion === "string" && /^\d{1,2}:\d{1,2}$/.test(proporcion) ? proporcion : null;
}

/**
 * Proporción con la que se generó, para enseñarla en el historial: la elegida o, en un trabajo anterior a poder
 * elegirla, la que quedó en los parámetros enviados. `null` si el modelo no la acepta (toma la de la imagen).
 */
export function proporcionDelTrabajo(fila: Pick<FilaTrabajo, "input" | "kind">): string | null {
  // Una vista del personaje sale en la suya (cabeza 3:4), no en la del preset.
  const vista = (fila.input as { vistaSintetica?: unknown }).vistaSintetica;
  if (fila.kind === "fotograma" && esVista(vista)) return proporcionDeVista(vista);
  const enviada = (fila.input as { parametros?: { aspect_ratio?: unknown } }).parametros?.aspect_ratio;
  return proporcionElegidaDe(fila) ?? (typeof enviada === "string" && enviada !== "" ? enviada : null);
}

/**
 * Proporción que el despacho le pide al proveedor. Una **vista** del personaje sale con la suya (cabeza 3:4, cuerpo
 * 9:16); lo demás, con la elegida al encolar o, si no se eligió ninguna, con la del modelo.
 *
 * Si se eligió una y el modelo que va a recibirla **no la admite** (un relevo a una reserva, un catálogo cambiado
 * entre encolar y enviar), no se envía con otra en silencio: se devuelve el motivo para cerrar sin coste.
 */
export function proporcionPedidaDe(
  fila: FilaTrabajo,
  modelo: Pick<ModeloVista, "nombre" | "parametros">,
): { proporcion?: string } | { error: string } {
  const vista = (fila.input as { vistaSintetica?: unknown }).vistaSintetica;
  if (fila.kind === "fotograma" && esVista(vista)) return { proporcion: proporcionDeVista(vista) };
  const elegida = proporcionElegidaDe(fila);
  if (elegida === null) return {};
  if (modelo.parametros.proporciones.includes(elegida)) return { proporcion: elegida };
  return {
    error: `Este trabajo se pidió en ${elegida} y ${modelo.nombre} no admite esa proporción, así que no se ha enviado para no generarlo en otra. No se ha enviado nada al proveedor y no se te ha cobrado: vuelve a pedirlo con un modelo que la admita.`,
  };
}

/**
 * Voz y parámetros con los que se encoló la pista, tal como quedaron en la entrada guardada. `null` si el trabajo
 * no los trae: sin voz, el adaptador rechaza la petición en lugar de inventarse un timbre.
 */
export function vozDe(fila: FilaTrabajo): { voz: string; parametros: ParametrosVoz } | null {
  const guardada = (fila.input as { voz?: unknown }).voz;
  if (!guardada || typeof guardada !== "object") return null;
  const { voz, parametros } = guardada as { voz?: unknown; parametros?: unknown };
  if (typeof voz !== "string" || voz === "") return null;
  return { voz, parametros: parametrosVozDe(parametros) };
}
