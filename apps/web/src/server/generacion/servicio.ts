import type { Vista } from "@/lib/captura-personaje";
import { CLIP, type TipoTrabajo, type TrabajoVista } from "@/lib/generacion";
import { encolar, filaDeLaConfirmacion, type NuevoTrabajoEncolado } from "../cola/encolar";
import type { FilaMedio } from "../db/esquema";
import { decidir } from "../decisiones/reglas";
import type { Actor } from "../media/servicio";
import {
  contextoDeVersion,
  contextoParaGenerar,
  personajePorId,
  promptConContexto,
  versionDeTrabajo,
} from "../personajes/contexto";
import { exigirPersonajeUsable, personajeParaGenerar } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import type { Adaptador } from "../proveedores/contrato";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirCredencial,
  exigirCuota,
  exigirDerechos,
  exigirRevisionDeReferencias,
  exigirRitmo,
  exigirSaldo,
  imagenPropia,
  limpiarDialogo,
  limpiarPrompt,
  proveedorDeCredencial,
} from "./comprobaciones";
import { ErrorGeneracion } from "./errores";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { type EleccionDeTrabajo, elegirParaTipo, exigirSelloVigente } from "./precios";
import { esUuidGeneracion, filaPropia, personajeDeLaCadena, vistaDeFila } from "./trabajos";

/**
 * Alta de trabajos de generación con la clave del propio usuario (RF01). Desde la 0.12.0 esta capa **no
 * habla con el proveedor**: comprueba, reserva presupuesto y encola (ADR-0003). El envío lo hace el worker,
 * así que cerrar el navegador ya no detiene nada.
 *
 * Reglas duras, las mismas desde la 0.10.0:
 *
 * - nada se encola sin una confirmación explícita que incluya los créditos estimados que se mostraron: si el
 *   precio ha cambiado entre la pantalla y el botón, se rechaza y se vuelve a mostrar;
 * - la casilla de derecho de uso de la imagen es obligatoria y queda registrada con su fecha;
 * - cada confirmación lleva su clave de idempotencia: repetirla (doble clic, reintento tras un error de red)
 *   devuelve el trabajo que ya existe y no crea un segundo trabajo ni una segunda tarea;
 * - el tope de trabajos simultáneos y la reserva de presupuesto van en la misma transacción que el alta, con
 *   la fila del usuario bloqueada: dos envíos a la vez no se pasan del tope ni reservan el mismo saldo;
 * - si el coste no se puede acotar, el trabajo queda `esperando_limite` y no sale hasta que el usuario fije
 *   un límite (PRD §6).
 */

/** Confirmación común a los dos tipos de trabajo. */
interface Confirmacion {
  prompt: string;
  /** Créditos que el usuario tenía delante al confirmar. */
  creditosConfirmados: number;
  /** Casilla «tengo derecho a usar esta imagen». */
  derechos: boolean;
  /** Aviso aceptado cuando la estimación pasa del umbral configurado en Admin › Ajustes. */
  avisoUmbralAceptado?: boolean;
  /** Clave que genera el navegador al confirmar: la misma confirmación nunca se cobra dos veces. */
  claveIdempotencia: string;
  /** Modelo elegido en el catálogo; sin él se usa el predeterminado de la capacidad. */
  modelo?: string;
  /** Sello del precio con el que se hizo la estimación: si ha cambiado, se rechaza. */
  selloEstimacion?: string;
  /**
   * Versión de la ficha del personaje que se le mostró al confirmar (0.15.0). Si la que se usaría ahora es
   * otra, el trabajo se rechaza con 409: la ficha entra en el prompt, así que confirmar con una y enviar otra
   * sería gastar dinero en algo que el usuario no ha revisado.
   *
   * Opcional para no romper a quien siga enviando como en la 0.14.x; sin ella no se compara nada.
   */
  versionPersonaje?: string;
}

/**
 * La ficha citada tiene que ser la que se confirmó. Si entre la pantalla y el botón se creó una versión nueva
 * —una vista sintética que terminó, otra pestaña que guardó la ficha—, lo confirmado ya no es lo que se
 * enviaría, y se dice en lugar de gastar.
 */
function exigirVersionConfirmada(confirmada: string | undefined, seUsaria: string | null): void {
  if (confirmada === undefined || confirmada === "") return;
  if (confirmada === seUsaria) return;
  throw new ErrorGeneracion(
    409,
    "La ficha ha cambiado desde que la revisaste: vuelve a mirar el contexto que se enviará y confirma otra vez.",
  );
}

/**
 * Resultado de un alta. `nueva` es `false` cuando la confirmación ya se había encolado (misma clave de
 * idempotencia): el trabajo que se devuelve es el que ya existía.
 */
export interface Envio {
  trabajo: TrabajoVista;
  nueva: boolean;
}

export interface PeticionFotograma extends Confirmacion {
  /** Imagen de la biblioteca del usuario que sirve de referencia. Alternativa a `personajeId`. */
  medioId?: string;
  /**
   * Personaje del usuario con el que se genera (0.13.0). Sustituye a la imagen suelta y manda si llegan los
   * dos: se envían **varias** referencias suyas, hasta el tope que declare el modelo, porque dan mejor guía
   * de identidad. Exige consentimiento vigente y referencias suficientes, comprobado en el servidor.
   */
  personajeId?: string;
  /**
   * Confirmación de la revisión de referencias (ADR-0009): en las fotos del personaje no aparece ninguna otra
   * persona ni ningún menor. Obligatoria cuando se genera con un personaje.
   */
  sinTerceros?: boolean;
  /**
   * Vista de cobertura que este fotograma va a rellenar (0.14.0). La pone **el servidor**
   * (`personajes/vista-sintetica.ts`), nunca el navegador: es lo que marca el resultado como `vista_generada`
   * al terminar el trabajo, y un valor puesto desde fuera convertiría una foto en una etiqueta falsa.
   */
  vistaSintetica?: Vista;
}

export interface PeticionAnimacion extends Confirmacion {
  /** Fotograma ya generado que se anima (su medio es el primer fotograma del clip). */
  trabajoPadreId: string;
  /**
   * Revisión de referencias (ADR-0009). Obligatoria cuando el fotograma del que sale el clip se hizo con un
   * personaje: el clip envía la misma cara.
   */
  sinTerceros?: boolean;
  /** Lo que dice el personaje, opcional. Solo lo usa el clip: en el fotograma saldría escrito. */
  dialogo?: string;
}

/**
 * Lo que se guarda como entrada del trabajo: `prompt` es lo que escribió la persona y `parametros` lo que se
 * le enviará al proveedor. Nunca incluye las URL temporales del proveedor ni ningún secreto: cada modelo las
 * recibe por un campo distinto (`image_urls`, `input_urls`, `image_url`) y se quitan todos.
 */
function entradaGuardada(
  adaptador: Adaptador,
  prompt: string,
  referencias: string[],
  parametros: Record<string, unknown>,
) {
  const resto = { ...parametros };
  for (const campo of adaptador.camposDeUrl) delete resto[campo];
  return { prompt, referencias, parametros: resto };
}

/** Modelo elegido, su adaptador y sus créditos ya comprobados contra lo que confirmó el usuario. */
async function eleccionConfirmada(tipo: TipoTrabajo, peticion: Confirmacion): Promise<EleccionDeTrabajo> {
  const eleccion = await elegirParaTipo(tipo, peticion.modelo);
  // Quien elige modelo tiene que devolver el sello del precio que vio; sin modelo se usa el predeterminado.
  exigirSelloVigente(peticion.selloEstimacion, eleccion.precio.sello, Boolean(peticion.modelo));
  return eleccion;
}

/** Trabajo que ya salió de esta misma confirmación, si lo hay. */
async function trabajoDeLaConfirmacion(usuarioId: string, claveIdempotencia: string): Promise<TrabajoVista | null> {
  const fila = await filaDeLaConfirmacion(usuarioId, claveIdempotencia);
  return fila ? vistaDeFila(fila) : null;
}

/**
 * Contexto del personaje **heredado** por una imagen suelta que salió de otro trabajo hecho con él. Sin
 * personaje no hay contexto ni versión que citar.
 */
async function fichaHeredada(
  personajeId: string | null,
  maximoDelModelo: number,
): Promise<{ versionId: string | null; contexto: string }> {
  if (!personajeId) return { versionId: null, contexto: "" };
  const personaje = await personajePorId(personajeId);
  if (!personaje) return { versionId: null, contexto: "" };
  const { version, contexto } = await contextoParaGenerar(personaje, Math.max(1, maximoDelModelo));
  return { versionId: version.id, contexto };
}

/** Contexto de una versión concreta, tal como se compuso al generar el fotograma del que sale el clip. */
async function contextoDeLaVersion(versionId: string | null): Promise<string> {
  const version = await versionDeTrabajo(versionId);
  if (!version) return "";
  const personaje = await personajePorId(version.characterId);
  return personaje ? contextoDeVersion(version, personaje.kind) : "";
}

/** Comprobación previa determinista (contrato de decisiones): un rechazo no llega ni a encolarse. */
async function exigirDecisionFavorable(entrada: Parameters<typeof decidir>[0]): Promise<void> {
  const decision = await decidir(entrada);
  if (decision.estado === "rechazado") throw new ErrorGeneracion(400, decision.evidencia);
}

export async function crearFotograma(
  actor: Actor,
  peticion: PeticionFotograma,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  const prompt = limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const eleccion = await eleccionConfirmada("fotograma", peticion);
  const { modelo, adaptador, precio } = eleccion;
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const proveedor = proveedorDeCredencial(modelo);
  // La credencial se comprueba ahora, no al enviar: encolar algo que no se puede pagar no ayuda a nadie.
  await exigirCredencial(actor.id, proveedor);
  // Con personaje se envían varias referencias suyas; sin personaje, la imagen suelta de 0.10.0.
  if (peticion.personajeId) exigirRevisionDeReferencias(peticion.sinTerceros);
  const elegido = peticion.personajeId
    ? await personajeParaGenerar(actor, peticion.personajeId, modelo.parametros.maximoReferencias)
    : null;
  const referencias: FilaMedio[] = elegido ? elegido.referencias : [await imagenPropia(actor.id, peticion.medioId)];
  const [origen] = referencias;
  if (!origen) throw new ErrorGeneracion(400, "Elige un personaje o una imagen de referencia.");
  // Si la imagen suelta es el resultado de otro trabajo hecho con un personaje, este trabajo hereda ese
  // personaje: si no, animar o reeditar un fotograma escaparía del borrado de derivados y la cara sobreviviría
  // al borrado del personaje. Y si lo hereda, tiene que cumplir sus reglas como cualquier otro.
  const personajeId = elegido?.personaje.id ?? (await personajeDeLaCadena(actor.id, origen.id));
  if (personajeId && !elegido) {
    exigirRevisionDeReferencias(peticion.sinTerceros);
    await exigirPersonajeUsable(personajeId, "El personaje de esa imagen");
  }
  // La ficha del personaje es **contexto de generación**: el servidor la compone a partir de la versión
  // vigente y la añade al prompt. Un fotograma heredado (imagen suelta que salió de otro trabajo con
  // personaje) recibe el contexto de ese mismo personaje, porque es la misma cara.
  const conFicha = elegido
    ? { versionId: elegido.version.id, contexto: elegido.contexto }
    : await fichaHeredada(personajeId, modelo.parametros.maximoReferencias);
  exigirVersionConfirmada(peticion.versionPersonaje, conFicha.versionId);
  const promptFinal = promptConContexto(prompt, conFicha.contexto);
  await exigirCuota(actor, "fotograma");
  await exigirSaldo(actor.id, creditos, h.buscar, proveedor);
  await exigirRitmo(actor.id);
  await exigirDecisionFavorable({
    tipo: "fotograma",
    escena: prompt,
    dialogo: "",
    // El contexto de la ficha va aparte de la escena: las reglas miden la descripción que escribió la persona.
    contexto: conFicha.contexto,
    conVoz: modelo.conVoz,
    conReferencia: true,
    creditos,
  });

  const parametros = adaptador.montarEntrada(modelo, { escena: promptFinal, dialogo: "", urls: [] });
  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "fotograma",
    provider: proveedor,
    model: modelo.modelo,
    // Se guarda el prompt **compuesto**, que es el que se envía: así el trabajo sigue llevando el contexto de
    // la versión que citó aunque la ficha cambie después.
    prompt: promptFinal,
    input: {
      ...entradaGuardada(
        adaptador,
        promptFinal,
        referencias.map((r) => r.id),
        parametros,
      ),
      // Lo que escribió la persona y lo que añadió el servidor, separados: el historial tiene que poder
      // mostrar las dos cosas sin adivinar dónde acaba una y empieza la otra.
      escena: prompt,
      ...(conFicha.contexto === "" ? {} : { contextoPersonaje: conFicha.contexto }),
      // Marca de «este resultado es una vista generada del personaje»: la lee el cierre del trabajo para
      // añadirla como referencia etiquetada. Solo la pone el servidor.
      ...(peticion.vistaSintetica && personajeId ? { vistaSintetica: peticion.vistaSintetica } : {}),
    },
    sourceMediaId: origen.id,
    characterId: personajeId,
    characterVersionId: conFicha.versionId,
    // La revisión de referencias se guarda con su fecha, igual que la confirmación de derechos: es una
    // declaración y hay que poder demostrar cuándo se hizo.
    referencesReviewedAt: personajeId ? new Date() : null,
    estimatedCredits: creditos,
  };
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    acotacion: acotarCoste("fotograma", eleccion),
    valores,
    sello: precio.sello,
  });
  return { trabajo: await vistaDeFila(fila), nueva };
}

export async function crearAnimacion(
  actor: Actor,
  peticion: PeticionAnimacion,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  const prompt = limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const eleccion = await eleccionConfirmada("animacion", peticion);
  const { modelo, adaptador, precio } = eleccion;
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const proveedor = proveedorDeCredencial(modelo);
  await exigirCredencial(actor.id, proveedor);

  if (!esUuidGeneracion(peticion.trabajoPadreId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
  const padre = await filaPropia(actor.id, peticion.trabajoPadreId);
  if (padre.kind !== "fotograma") throw new ErrorGeneracion(400, "Solo se animan fotogramas.");
  if (padre.state !== "listo" || !padre.resultMediaId) {
    throw new ErrorGeneracion(409, "Espera a que el fotograma esté listo y guardado antes de animarlo.");
  }
  const origen = await imagenPropia(actor.id, padre.resultMediaId);
  // El clip hereda el personaje del fotograma, así que hereda también sus reglas: si el consentimiento se ha
  // revocado entre el fotograma y el clip, el clip no sale. Y la revisión de referencias se vuelve a confirmar,
  // porque es otra confirmación distinta sobre otro envío distinto.
  if (padre.characterId) {
    exigirRevisionDeReferencias(peticion.sinTerceros);
    await exigirPersonajeUsable(padre.characterId, "El personaje de este fotograma");
  }
  await exigirCuota(actor, "animacion");
  await exigirSaldo(actor.id, creditos, h.buscar, proveedor);
  await exigirRitmo(actor.id);

  // Un modelo sin voz no recibe nunca lo que dice el personaje (Hailuo 2.3 no tiene audio).
  const dialogo = modelo.conVoz ? limpiarDialogo(peticion.dialogo) : "";
  // El clip lleva el contexto de **la misma versión que el fotograma**, no de la vigente: si la ficha ha
  // cambiado entre los dos, animar tiene que seguir siendo el mismo personaje que se generó.
  exigirVersionConfirmada(peticion.versionPersonaje, padre.characterVersionId);
  const contexto = await contextoDeLaVersion(padre.characterVersionId);
  await exigirDecisionFavorable({
    tipo: "animacion",
    escena: prompt,
    dialogo,
    contexto,
    conVoz: modelo.conVoz,
    conReferencia: true,
    creditos,
  });
  const segundos = modelo.parametros.duraciones[0] ?? CLIP.segundos;
  const promptFinal = promptConContexto(prompt, contexto);
  const parametros = adaptador.montarEntrada(modelo, { escena: promptFinal, dialogo, urls: [] });
  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "animacion",
    provider: proveedor,
    model: modelo.modelo,
    prompt: promptFinal,
    input: {
      ...entradaGuardada(adaptador, promptFinal, [origen.id], { ...parametros, segundos }),
      dialogo,
      escena: prompt,
      ...(contexto === "" ? {} : { contextoPersonaje: contexto }),
    },
    sourceMediaId: origen.id,
    parentJobId: padre.id,
    characterId: padre.characterId,
    characterVersionId: padre.characterVersionId,
    referencesReviewedAt: padre.characterId ? new Date() : null,
    estimatedCredits: creditos,
  };
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    acotacion: acotarCoste("animacion", eleccion),
    valores,
    sello: precio.sello,
  });
  return { trabajo: await vistaDeFila(fila), nueva };
}
