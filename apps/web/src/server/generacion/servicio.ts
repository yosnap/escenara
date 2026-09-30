import type { Vista } from "@/lib/captura-personaje";
import { CAPACIDAD_DE_TIPO, duracionesConCoste, type ModeloVista, segundosDeUnidad } from "@/lib/catalogo";
import { DIRECCION_CON_ACENTO_VACIA, type DireccionElegidaConAcento } from "@/lib/direccion";
import { CLIP, type TipoTrabajo, type TrabajoVista } from "@/lib/generacion";
import type { TipoPersonaje } from "@/lib/personajes";
import type { SeleccionPresets } from "@/lib/presets";
import { duracionParaModelo } from "@/lib/produccion";
import type { PasoProductoDigital, ProductoElegido } from "@/lib/productos";
import { motivoDuracionNoAdmitida } from "@/lib/trends";
import { leerAjustes } from "../ajustes";
import { contextoAnimadoDeEscena } from "../animados/contexto-escena";
import { duracionDeClipDeEscena, proyectoDeEscena } from "../asistente/consulta";
import { hechosDeEscena, techoDelProyecto } from "../asistente/plan";
import { encolar, filaDeLaConfirmacion, type NuevoTrabajoEncolado } from "../cola/encolar";
import { conVistaQueCompleta, hechosDelReparto, hechosDelRepartoDeEscena, recopilarHechos } from "../controles/hechos";
import { exigirControles } from "../controles/puerta";
import type { FilaMedio, FilaTrabajo } from "../db/esquema";
import { decidir } from "../decisiones/reglas";
import { dirigirClipPara, familiaDe } from "../direccion/clip";
import { type DireccionSinTextoLibre, direccionDesdeEleccion, type PersonajeDirigido } from "../direccion/escena";
import { type CambiarSolo, componerInsercionDeCaptura, componerSeisC, type SeisC } from "../direccion/fotograma";
import { conHojaDeIdentidad } from "../direccion/hoja-identidad";
import { bloqueProductoSuelto, esInsercionDeCaptura } from "../direccion/producto";
import {
  type EleccionDelMapa,
  eleccionDeGeneracion,
  type ModoDeGeneracion,
  type OpcionDeGeneracion,
} from "../mapa/generacion";
import type { Actor } from "../media/servicio";
import { referenciasVigentesDe } from "../personajes/consulta";
import {
  contextoDeVersion,
  contextoParaGenerar,
  personajePorId,
  promptConContexto,
  versionDeTrabajo,
} from "../personajes/contexto";
import { personajePropio, referenciasParaGenerar } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import { eleccionDeFotosDelTrabajo, productoDelTrabajo } from "../productos/columnas";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { productoEnPrompt, productoParaGenerar } from "../productos/prompt";
import { referenciasDelPersonajeQueViajan } from "../productos/referencias";
import { hojaEnElEnvio, repartoDelEnvio } from "../productos/reparto-del-envio";
import { plantillaUsable } from "../prompts/consulta";
import { componerDesdePlantilla, type PromptCompuesto } from "../prompts/render";
import { creditosDelEnvio, traducirAlIngles } from "../prompts/traduccion";
import { duracionesDelTrend, exigirTrendVigente } from "../prompts/trends";
import type { Adaptador } from "../proveedores/contrato";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirDerechoDeMarca,
  exigirDerechos,
  exigirMedioElegido,
  exigirRevisionDeReferencias,
  exigirRitmo,
  imagenPropia,
  limpiarDialogo,
  limpiarPrompt,
  limpiarPromptOpcional,
  proveedorDeCredencial,
} from "./comprobaciones";
import { ErrorGeneracion } from "./errores";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { exigirSelloVigente } from "./precios";
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
  /**
   * Casilla **«tengo derecho a usar esta marca»** (0.26.0). Solo se pide cuando el envío lleva producto —es
   * entonces cuando hay una marca en juego— y sin ella el envío no sale. Se guarda con su fecha en el
   * trabajo: es una declaración, y hay que poder demostrar cuándo se hizo.
   */
  derechoMarca?: boolean;
  /** Aviso aceptado cuando la estimación pasa del umbral configurado en Admin › Ajustes. */
  avisoUmbralAceptado?: boolean;
  /** Clave que genera el navegador al confirmar: la misma confirmación nunca se cobra dos veces. */
  claveIdempotencia: string;
  /**
   * Avisos «Necesita ajustes» que el usuario ha confirmado expresamente, por su clave de regla (0.18.0).
   *
   * Es lo único que salva un aviso salvable, y **entra en la firma de idempotencia del cliente**: confirmar un
   * aviso distinto es otra confirmación y estrena clave. Una clave que corresponda a un freno `Requiere
   * revisión` o `Bloqueado` no hace nada: esos no se saltan nunca, tampoco desde la API.
   */
  avisosConfirmados?: string[];
  /** Modelo elegido en el catálogo; sin él se usa el predeterminado de la capacidad. */
  modelo?: string;
  /**
   * Duración del clip que se confirmó, en segundos (0.23.4). Cada duración es **una tarifa distinta** del
   * modelo, así que la que llega aquí es la que se estimó, la que se reserva y la que se le pide al proveedor.
   * Sin ella manda la del proyecto, y fuera de un proyecto, la primera que el modelo sabe cobrar.
   */
  segundos?: number;
  /**
   * Este envío repite algo que pudo cobrarse, así que consume un reintento autorizado de la escena (0.19.0,
   * ADR-0024). Lo pone **el servidor** de producción a partir del estado real de la escena, igual que
   * `vistaSintetica`: si lo pudiera poner el navegador, bastaría con no mandarlo para reintentar gratis.
   */
  reintentoDeEscena?: boolean;
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
  /**
   * Plantilla de prompt elegida (0.16.0) y la versión que se tenía en pantalla. Con ellas, **el servidor
   * compone el prompt** a partir de los presets elegidos: `prompt` pasa a ser solo el valor de la variable de
   * texto («qué quieres ver»). Sin plantilla, todo funciona como en la 0.15.x.
   */
  plantillaId?: string;
  plantillaVersionId?: string;
  /** Presets elegidos por categoría: identificadores, nunca texto. */
  presets?: SeleccionPresets;
  /**
   * Texto final editado a mano. Si llega, manda sobre lo que compone la plantilla, y pasa por la misma
   * limpieza anti-inyección: editar el texto no es una puerta para colar parámetros del proveedor.
   */
  promptEditado?: string;
  /**
   * **Dirección del clip** (0.25.0): lo que el usuario eligió con botones, ya resuelto a trozos de prompt en
   * inglés por `direccion/catalogo.ts`. Lo pone **el servidor** de producción a partir de la escena, nunca el
   * navegador: si el navegador pudiera mandarla, podría mandar texto suyo al proveedor saltándose el catálogo.
   *
   * Se aplica **después de traducir**, porque su hueco `escena` es el texto libre del usuario ya en inglés.
   * Sin ella todo funciona como en la 0.24.x.
   */
  direccion?: DireccionSinTextoLibre;
  /** Las 6C del fotograma, igual: las resuelve el servidor y se aplican después de traducir. */
  seisC?: Omit<SeisC, "contextoLibre">;
  /** Modo «cambiar solo…», cuando se parte de un fotograma ya aprobado. */
  cambiarSolo?: CambiarSolo;
}

/**
 * Texto base del prompt: lo que compuso la plantilla o, sin plantilla, lo que escribió la persona. `compuesto`
 * es lo que se guarda en el trabajo para poder auditarlo.
 */
interface BaseDelPrompt {
  escena: string;
  compuesto: PromptCompuesto | null;
}

/**
 * Compone el texto base con la plantilla elegida, si se eligió alguna. **Siempre en el servidor**: el navegador
 * manda identificadores de plantilla y de preset, y su previsualización coincide porque usa la misma función
 * pura, no porque se le crea el texto.
 */
async function baseDelPrompt(
  actor: Actor,
  peticion: Confirmacion,
  tipo: TipoTrabajo,
  modelo: ModeloVista,
  tipoPersonaje: TipoPersonaje | null,
  escenaEscrita: string,
  /** Duración que se le va a pedir al proveedor, si ya está decidida: es contra la que se valida un preset. */
  segundos?: number,
): Promise<BaseDelPrompt> {
  if (!peticion.plantillaId) return { escena: escenaEscrita, compuesto: null };
  const compuesto = await componerDesdePlantilla({
    usuarioId: actor.id,
    plantillaId: peticion.plantillaId,
    versionId: peticion.plantillaVersionId,
    tipo,
    presets: peticion.presets ?? {},
    // **Todas** las variables de tipo texto de la plantilla reciben esta escena, no solo la que se llame
    // «escena»: en «Crear» solo hay un campo, y el navegador previsualiza con la misma regla.
    escena: escenaEscrita,
    tipoPersonaje,
    modelo,
    ...(segundos === undefined ? {} : { segundos }),
    textoEditado: peticion.promptEditado,
  });
  return { escena: compuesto.texto, compuesto };
}

/** Lo que el trabajo guarda de la plantilla usada: identificadores y la marca de editado. */
const columnasDePlantilla = (compuesto: PromptCompuesto | null) =>
  compuesto
    ? {
        promptTemplateId: compuesto.plantillaId,
        promptTemplateVersionId: compuesto.versionId,
        promptEdited: compuesto.editado,
      }
    : {};

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
 * Reservas autorizadas que se guardan con el trabajo: a dónde puede relevarse si el proveedor rechaza la
 * petición **probando que no ha cobrado**, y con qué tope en la moneda de cada uno. Sin esto, el worker no
 * podría cambiar de proveedor sin gastar más de lo que el usuario tenía delante (`cola/despacho.ts`).
 */
const reservasGuardadas = (reservas: readonly OpcionDeGeneracion[]) =>
  reservas.length === 0
    ? {}
    : {
        reservas: reservas.map((r) => ({
          proveedor: r.eleccion.modelo.proveedor,
          compatibleId: r.entrada.compatibleId,
          modelo: r.eleccion.modelo.modelo,
          creditos: r.creditos,
          urlBase: "",
        })),
      };

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
   * Escena del proyecto que se está produciendo (0.17.0). Con ella, el trabajo **solo sale si el plan del
   * proyecto está aprobado y la aprobación de esa escena sigue en pie** (`exigirEscenaAprobada`): es la puerta
   * que impide encolar una generación de un guion que nadie ha autorizado. Sin ella, el camino rápido de
   * «Crear» funciona igual que en la 0.16.x.
   */
  escenaId?: string;
  /**
   * Vista de cobertura que este fotograma va a rellenar (0.14.0). La pone **el servidor**
   * (`personajes/vista-sintetica.ts`), nunca el navegador: es lo que marca el resultado como `vista_generada`
   * al terminar el trabajo, y un valor puesto desde fuera convertiría una foto en una etiqueta falsa.
   */
  vistaSintetica?: Vista;
  /**
   * Este fotograma es la **hoja de identidad 3×3** de un personaje (0.25.0). Lo pone el servidor
   * (`personajes/hoja-identidad.ts`), nunca el navegador.
   *
   * Hace dos cosas: marca el trabajo para que su resultado quede guardado como hoja del personaje al cerrarse,
   * y **excluye la petición del reparto del experimento**. La hoja se compone siempre desde las fotos sueltas:
   * generarla citando la hoja anterior daría una copia de una copia, y contaminaría con su propio predecesor
   * la métrica que compara las dos referencias.
   */
  hojaDeIdentidad?: boolean;
  /**
   * Este fotograma es un **retrato candidato de un personaje inventado** (0.22.0): no sale de ninguna foto, sino
   * de su descripción, y es lo que le dará su primera referencia. Lo pone el servidor
   * (`personajes/inventado.ts`), nunca el navegador: si lo pudiera poner un cliente, sería la forma de generar
   * con un personaje sin ninguna de sus fotos.
   */
  retratoInventado?: boolean;
  /**
   * **Paso del producto digital** (0.26.0). Solo tiene sentido con un producto de tipo digital:
   *
   * - sin él, el fotograma es el **primer paso**: el dispositivo con la pantalla apagada;
   * - con `insertar_captura`, es el **segundo**: se parte del fotograma anterior (`medioId`) y se mete
   *   dentro de la pantalla la captura del producto.
   *
   * Cada paso es una generación con su estimación, su confirmación y su clave: son dos cobros, y se ven.
   */
  pasoDigital?: PasoProductoDigital;
  /**
   * **Producto elegido en «Crear»** (0.26.0). En la producción de un proyecto no llega: ahí lo pone la escena,
   * que es donde se eligió y lo que manda.
   */
  productoElegido?: ProductoElegido;
}

export interface PeticionAnimacion extends Confirmacion {
  /**
   * Fotograma ya generado que se anima (su medio es el primer fotograma del clip). Alternativa a `medioId`:
   * hace falta uno de los dos.
   */
  trabajoPadreId?: string;
  /**
   * **Imagen de la biblioteca que se anima directamente** (0.25.1), sin generar antes ningún fotograma: un
   * fotograma de otro día, una vista del personaje o una foto subida. Tiene que ser del usuario —lo comprueba
   * `imagenPropia`, que responde 404 para una ajena— y, si salió de un trabajo hecho con un personaje, el clip
   * **hereda ese personaje** y todas sus reglas, igual que la imagen suelta del fotograma.
   *
   * Lo que se confirma y se cobra es solo el clip: no hay fotograma que pagar.
   */
  medioId?: string;
  /**
   * Revisión de referencias (ADR-0009). Obligatoria cuando el fotograma del que sale el clip se hizo con un
   * personaje: el clip envía la misma cara.
   */
  sinTerceros?: boolean;
  /** Lo que dice el personaje, opcional. Solo lo usa el clip: en el fotograma saldría escrito. */
  dialogo?: string;
  /**
   * **Dirección elegida en «Crear»** (0.25.1): claves del catálogo y enumerados, nunca texto de prompt. La
   * resuelve el servidor con `direccionDesdeEleccion`, que es el mismo camino que usa la producción de una
   * escena: el navegador elige, el catálogo traduce (ADR-0022).
   *
   * Se ignora si llega junto a `direccion`: esa la pone el servidor desde la escena y manda siempre.
   */
  direccionElegida?: DireccionElegidaConAcento;
  /**
   * **Producto elegido en «Crear»** (0.26.0): el identificador de un producto suyo y la clave de la acción. Se
   * comprueba aquí que sea suyo. En la producción de un proyecto no llega: el producto lo pone la escena, que
   * es donde se eligió.
   *
   * En esta versión **solo se guarda**: no cambia el prompt ni lo que se le envía al proveedor.
   */
  productoElegido?: ProductoElegido;
  /**
   * **Solo la pone el servidor** (la producción de un proyecto), nunca la ruta HTTP: la escena y el personaje
   * del proyecto cuando el clip parte de una imagen traída de la biblioteca. Sin esto el clip quedaba suelto:
   * sin escena (ni su duración, ni sus topes, ni su clip registrado) y sin el personaje del proyecto (ni su
   * consentimiento, ni el borrado en cascada).
   */
  escenaDelProyecto?: { escenaId: string; personajeId: string | null };
}

/**
 * **De dónde sale el clip**: el primer fotograma que se va a animar y todo lo que arrastra con él.
 *
 * Hay dos caminos y los dos acaban aquí, con la misma forma:
 *
 * - **un fotograma ya generado**: hereda su escena, su personaje y la versión de ficha con la que se hizo, y el
 *   clip queda colgado de él como trabajo hijo;
 * - **una imagen de la biblioteca** (0.25.1): no hay trabajo padre ni escena. El dueño se comprueba al leerla
 *   (`imagenPropia` responde 404 para una ajena) y, si la imagen salió de un trabajo hecho con un personaje, el
 *   clip **hereda ese personaje**: es la misma cara, así que cumple sus reglas. Es exactamente lo que ya hacía
 *   el fotograma con una imagen suelta.
 */
interface PartidaDelClip {
  /** Imagen que será el primer fotograma del clip. */
  medioId: string;
  trabajoPadreId: string | null;
  escenaId: string | null;
  personajeId: string | null;
  versionPersonajeId: string | null;
  referenciaIdentidad: FilaTrabajo["identityReferenceKind"];
}

async function partidaDelClip(usuarioId: string, peticion: PeticionAnimacion): Promise<PartidaDelClip> {
  if (peticion.trabajoPadreId) {
    if (!esUuidGeneracion(peticion.trabajoPadreId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
    const padre = await filaPropia(usuarioId, peticion.trabajoPadreId);
    if (padre.kind !== "fotograma") throw new ErrorGeneracion(400, "Solo se animan fotogramas.");
    if (padre.state !== "listo" || !padre.resultMediaId) {
      throw new ErrorGeneracion(409, "Espera a que el fotograma esté listo y guardado antes de animarlo.");
    }
    return {
      medioId: padre.resultMediaId,
      trabajoPadreId: padre.id,
      escenaId: padre.sceneId,
      personajeId: padre.characterId,
      versionPersonajeId: padre.characterVersionId,
      referenciaIdentidad: padre.identityReferenceKind,
    };
  }
  const medioId = peticion.medioId;
  if (!medioId) {
    throw new ErrorGeneracion(400, "Elige el fotograma de partida: un fotograma ya generado o una imagen tuya.");
  }
  // Que la imagen exista y sea suya lo decide esta lectura, no quien llama: una ajena responde 404.
  const medio = await imagenPropia(usuarioId, medioId);
  // La cara que sale en la imagen manda; si la imagen es una foto suelta, en un proyecto es la del protagonista.
  const personajeId =
    (await personajeDeLaCadena(usuarioId, medio.id)) ?? peticion.escenaDelProyecto?.personajeId ?? null;
  /**
   * La versión de ficha que se cita es la **vigente** del personaje heredado: la imagen puede ser de hace meses
   * y el clip se genera ahora. Sin personaje no hay ninguna que citar.
   */
  const conFicha = await fichaHeredada(personajeId, 1);
  return {
    medioId: medio.id,
    // No hay trabajo padre: el clip nace de una imagen, no de una generación de esta cadena.
    trabajoPadreId: null,
    escenaId: peticion.escenaDelProyecto?.escenaId ?? null,
    personajeId,
    versionPersonajeId: conFicha.versionId,
    // La imagen es la referencia: no se citó ninguna hoja 3×3 al hacerla desde aquí.
    referenciaIdentidad: "vistas",
  };
}

/**
 * Lo que el personaje del fotograma aporta a la dirección del clip en «Crear». La ficha **no** va en la
 * descripción: entra por su propio camino como contexto (`promptConContexto`), así que aquí solo van las reglas
 * que dependen de quién es.
 *
 * Sin personaje se trata como **persona real**: es el lado que no embellece, y equivocarse hacia ahí no hace
 * daño. Es el mismo criterio de `personajeDirigidoDe` en la producción de proyectos.
 */
async function personajeDelFotograma(personajeId: string | null): Promise<PersonajeDirigido> {
  const sinPersonaje: PersonajeDirigido = { descripcion: "", real: true, atractivoElegido: false, ejesVoz: {} };
  if (!personajeId) return sinPersonaje;
  const personaje = await personajePorId(personajeId);
  if (!personaje) return sinPersonaje;
  return {
    descripcion: "",
    real: !personaje.virtual,
    atractivoElegido: personaje.virtual && personaje.beautyOptIn,
    ejesVoz: personaje.voiceAxes,
  };
}

/**
 * Lo que se guarda como entrada del trabajo: `prompt` es lo que escribió la persona y `parametros` lo que se
 * le enviará al proveedor. Nunca incluye las URL temporales del proveedor ni ningún secreto: cada modelo las
 * recibe por un campo distinto (`image_urls`, `input_urls`, `image_url`) y se quitan todos.
 */
export function entradaGuardada(
  adaptador: Adaptador,
  prompt: string,
  referencias: string[],
  parametros: Record<string, unknown>,
) {
  const resto = { ...parametros };
  for (const campo of adaptador.camposDeUrl) delete resto[campo];
  return { prompt, referencias, parametros: resto };
}

/**
 * Con qué se genera este trabajo y a dónde podría relevarse, ya comprobado contra lo que confirmó el usuario.
 *
 * Desde la 0.22.0 sale del **mapa de modelos** del usuario (0.21.1 para la voz, ahora también para imagen y
 * vídeo): la primera entrada utilizable es con la que se intenta y las siguientes quedan autorizadas como
 * reservas, con su coste **en la moneda de cada proveedor**. Si el usuario ha elegido modelo a mano en «Crear»,
 * manda su elección y no hay reservas: no ha visto el coste de ninguna otra.
 */
async function eleccionConfirmada(
  usuarioId: string,
  tipo: TipoTrabajo,
  peticion: Confirmacion,
  /**
   * Cómo se va a generar: sin imagen de partida hace falta un modelo de **texto a imagen**, y la duración
   * elegida decide qué tarifa se cobra. Es el mismo modo con el que se hizo la estimación, así que lo que se
   * confirma y lo que se envía son la misma tarifa del mismo modelo.
   */
  modo: ModoDeGeneracion = {},
): Promise<EleccionDelMapa> {
  const delMapa = await eleccionDeGeneracion(usuarioId, tipo, peticion.modelo, modo);
  // Quien elige modelo tiene que devolver el sello del precio que vio; sin modelo se usa el del mapa.
  exigirSelloVigente(peticion.selloEstimacion, delMapa.elegida.eleccion.precio.sello, Boolean(peticion.modelo));
  return delMapa;
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
): Promise<{ versionId: string | null; contexto: string; tipo: TipoPersonaje | null }> {
  if (!personajeId) return { versionId: null, contexto: "", tipo: null };
  const personaje = await personajePorId(personajeId);
  if (!personaje) return { versionId: null, contexto: "", tipo: null };
  const { version, contexto } = await contextoParaGenerar(personaje, Math.max(1, maximoDelModelo));
  return { versionId: version.id, contexto, tipo: personaje.kind };
}

/** Contexto de una versión concreta, tal como se compuso al generar el fotograma del que sale el clip. */
async function contextoDeLaVersion(
  versionId: string | null,
): Promise<{ contexto: string; tipo: TipoPersonaje | null }> {
  const version = await versionDeTrabajo(versionId);
  if (!version) return { contexto: "", tipo: null };
  const personaje = await personajePorId(version.characterId);
  if (!personaje) return { contexto: "", tipo: null };
  return { contexto: contextoDeVersion(version, personaje.kind), tipo: personaje.kind };
}

/**
 * Tope de escenas en vuelo del usuario para este envío (0.19.0). `null` fuera de un proyecto: el camino rápido
 * de «Crear» no produce ninguna escena y solo lo acota el tope de trabajos simultáneos.
 */
async function topeDeEscenasEnVuelo(
  escenaId: string | null,
  reintento = false,
): Promise<{ escenaId: string; maximo: number; reintento: boolean } | null> {
  if (!escenaId) return null;
  const { escenasEnVuelo } = await leerAjustes();
  return { escenaId, maximo: escenasEnVuelo, reintento };
}

/**
 * Lo que se guarda en el trabajo de las fotos del producto: **solo las que caben**, en el orden de prioridad
 * con el que se van a enviar. El worker no vuelve a repartir nada; envía esto, que es lo que se ha avisado y
 * se ha confirmado.
 */
function referenciasDeProductoGuardadas(
  producto: { fotos: readonly string[] } | null,
  conProducto: { reparto: { producto: number } } | null,
): { referenciasProducto?: string[] } {
  if (!producto || !conProducto || conProducto.reparto.producto === 0) return {};
  return { referenciasProducto: producto.fotos.slice(0, conProducto.reparto.producto) };
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
  /**
   * **Sin imagen de partida** (0.23.4): el retrato candidato de un personaje inventado nace de su descripción,
   * y en «Crear» se puede describir una escena sin elegir personaje ni foto. Las dos cosas necesitan un modelo
   * de texto a imagen; pedírselo a uno de edición se rechaza **después** de que el proveedor cobre la petición.
   */
  const sinReferencia = peticion.retratoInventado === true || (!peticion.personajeId && !peticion.medioId);
  const { elegida, reservas } = await eleccionConfirmada(actor.id, "fotograma", peticion, { sinReferencia });
  const eleccion = elegida.eleccion;
  const { modelo, adaptador, precio } = eleccion;
  const creditos = Math.ceil(precio.creditos);
  // Lo que el usuario confirma es **todo** lo que va a pagar por este envío: la generación y, si esta instalación
  // traduce, la traducción (decisión provisional del propietario, 2026-09-27). Y es esa suma la que tiene que
  // caber en los topes que comprueba el motor de controles.
  const totales = await creditosDelEnvio(creditos);
  exigirConfirmacion(peticion.creditosConfirmados, totales);
  await exigirAvisoUmbral(totales, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  /**
   * El ritmo va **aquí**: después del corte de idempotencia (repetir una confirmación no gasta ritmo) y **antes**
   * del motor. Es lo único que acota cuántas veces se puede pedir una evaluación que va a fallar: sin este orden,
   * un bucle de envíos rechazados leería el saldo y escribiría una fila de `control_evaluations` por intento.
   */
  await exigirRitmo(actor.id);

  /**
   * Producir una escena exige que su plan esté aprobado y que su aprobación siga en pie. Solo se aplica cuando
   * llega `escenaId`: el camino rápido de «Crear» no pertenece a ningún proyecto (ADR-0021).
   */
  const conEscena = peticion.escenaId ? await hechosDeEscena(actor, peticion.escenaId) : null;
  // Con personaje se envían varias referencias suyas; sin personaje, la imagen suelta de 0.10.0. Y si esa
  // imagen suelta salió de otro trabajo hecho con un personaje, este trabajo **hereda** ese personaje: si no,
  // animar o reeditar un fotograma escaparía del borrado de derivados y la cara sobreviviría al borrado del
  // personaje. Heredarlo significa cumplir sus reglas como cualquier otro.
  // Sin imagen de partida no se exige ninguna: es el propio modo de generación, no un dato que falte.
  const medioId = peticion.personajeId || sinReferencia ? null : exigirMedioElegido(peticion.medioId);
  const personajeId = peticion.personajeId ?? (medioId === null ? null : await personajeDeLaCadena(actor.id, medioId));
  // Un personaje inventado no tiene fotos, así que no hay terceros que revisar en ellas: lo que se envía es su
  // descripción. Exigir esa casilla aquí sería pedir una declaración sobre unas fotos que no existen.
  if (personajeId && !peticion.retratoInventado) exigirRevisionDeReferencias(peticion.sinTerceros);
  const personaje = peticion.personajeId
    ? await personajePropio(actor, peticion.personajeId)
    : personajeId
      ? await personajePorId(personajeId)
      : null;

  /**
   * **El producto del fotograma** (0.26.0). Sale de la escena, que es donde se elige: el camino rápido de
   * «Crear» elige el producto junto a la dirección del clip, no aquí. Se resuelve **antes** de la puerta
   * porque sus avisos —la identidad que no cabe, la marca que el filtro puede rechazar— son de los que hay
   * que dar antes de cobrar nada.
   */
  const columnasProducto = await productoDelTrabajo(actor.id, conEscena?.escena.id ?? null, peticion.productoElegido);
  const producto = await productoParaGenerar(
    actor.id,
    columnasProducto.productId,
    columnasProducto.productAction,
    { ...(peticion.pasoDigital ? { pasoSolicitado: peticion.pasoDigital } : {}) },
    await eleccionDeFotosDelTrabajo(conEscena?.escena.id ?? null, peticion.productoElegido),
  );
  // Con producto hay una marca en juego, y usarla es una declaración aparte de la de la imagen.
  if (producto) exigirDerechoDeMarca(peticion.derechoMarca);
  const conProducto = producto
    ? await repartoDelEnvio({
        producto,
        adaptador,
        modelo,
        envio: {
          tipo: "fotograma",
          // Las fotos del personaje solo viajan cuando se genera **con** él; heredado de una imagen suelta, viaja esa sola.
          personaje: personaje && peticion.personajeId && !peticion.retratoInventado ? personaje : null,
          sinReferencia,
          conHoja:
            personaje !== null &&
            !peticion.hojaDeIdentidad &&
            hojaEnElEnvio(personaje, peticion.escenaId ?? peticion.claveIdempotencia),
        },
      })
    : null;
  if (conProducto) {
    await completarModelosSugeridos(conProducto.hechos, sinReferencia ? "text_to_image" : CAPACIDAD_DE_TIPO.fotograma);
  }
  /**
   * Insertar la captura **exige** que la captura viaje: si en este modelo no cabe, no hay nada que insertar y
   * el paso no se puede hacer. No es un aviso que se confirme, es que el envío no tiene sentido.
   */
  if (producto?.pasoDigital === "insertar_captura" && conProducto?.reparto.producto === 0) {
    throw new ErrorGeneracion(
      409,
      `${modelo.nombre} no admite una segunda imagen de referencia, así que no se le puede dar la captura para meterla en la pantalla. Elige un modelo de imagen que acepte dos referencias y vuelve a estimar el coste.`,
    );
  }

  const conReparto = conEscena ? await hechosDelReparto(conEscena.escena) : null;

  // ── Punto único: el motor decide si esto se puede generar ─────────────────────────────────────────────
  await exigirControles(
    {
      usuarioId: actor.id,
      sujeto: conEscena ? "escena" : "trabajo",
      sujetoId: conEscena?.escena.id ?? null,
      tipo: "fotograma",
    },
    conVistaQueCompleta(
      await recopilarHechos(
        actor,
        {
          tipo: "fotograma",
          eleccion,
          creditos: totales,
          personajeId,
          personaje,
          ...(peticion.retratoInventado ? { primerRetrato: true } : {}),
          ...(peticion.vistaSintetica ? { vistaSintetica: true } : {}),
          escena: conEscena?.hechos ?? null,
          proyecto: conEscena ? await techoDelProyecto(conEscena.escena.projectId) : null,
          // Reparto de la escena (0.28.0): el consentimiento se gatea **por cada persona real** que sale en ella.
          ...(conReparto ? { reparto: conReparto } : {}),
          ...(conProducto ? { producto: conProducto.hechos } : {}),
        },
        h.buscar,
      ),
      peticion.vistaSintetica && personajeId ? peticion.vistaSintetica : undefined,
    ),
    peticion.avisosConfirmados ?? [],
  );

  // A partir de aquí ya no queda ninguna regla: el motor las ha aplicado todas. `proveedorDeCredencial` solo
  // acota el tipo (el motor ya ha bloqueado un proveedor sin soporte), y la cola necesita ese valor acotado.
  const proveedor = proveedorDeCredencial(modelo);
  const elegido =
    personaje && peticion.personajeId && !peticion.retratoInventado
      ? await referenciasParaGenerar(
          personaje,
          modelo.parametros.maximoReferencias,
          // La hoja nunca se genera desde sí misma: se compone siempre desde las fotos sueltas.
          !peticion.hojaDeIdentidad && conHojaDeIdentidad(personaje, peticion.escenaId ?? peticion.claveIdempotencia),
        )
      : null;
  /**
   * El retrato candidato de un personaje inventado **no tiene referencia**: nace de su descripción, que es
   * justamente lo que lo hace inventado. Todos los demás caminos siguen exigiendo una imagen de origen.
   */
  const referencias: FilaMedio[] = elegido
    ? elegido.referencias
    : sinReferencia
      ? []
      : [await imagenPropia(actor.id, medioId)];
  const [origen] = referencias;
  if (!origen && !sinReferencia) {
    throw new ErrorGeneracion(400, "Elige un personaje o una imagen de referencia.");
  }
  // La ficha del personaje es **contexto de generación**: el servidor la compone a partir de la versión
  // vigente y la añade al prompt. Un fotograma heredado (imagen suelta que salió de otro trabajo con
  // personaje) recibe el contexto de ese mismo personaje, porque es la misma cara.
  const conFicha = elegido
    ? { versionId: elegido.version.id, contexto: elegido.contexto, tipo: elegido.personaje.kind }
    : await fichaHeredada(personajeId, modelo.parametros.maximoReferencias);
  const contextoTotal = [conFicha.contexto, await contextoAnimadoDeEscena(conEscena?.escena.id ?? null, personaje)]
    .filter(Boolean)
    .join("\n");
  exigirVersionConfirmada(peticion.versionPersonaje, conFicha.versionId);
  // Se compone una vez con **el texto original**: valida la combinación de plantilla, presets y modelo, y es lo
  // que miden las reglas de la decisión. Todo esto es gratis, y tiene que fallar **antes** de que se pague nada.
  const original = await baseDelPrompt(actor, peticion, "fotograma", modelo, conFicha.tipo, prompt);
  await exigirDecisionFavorable({
    tipo: "fotograma",
    // Las reglas miden lo que escribió la persona, en su idioma: es lo único sobre lo que puede decidir.
    escena: original.escena,
    dialogo: "",
    // El contexto de la ficha va aparte de la escena: las reglas miden la descripción que escribió la persona.
    contexto: contextoTotal,
    conVoz: modelo.conVoz,
    conReferencia: !sinReferencia,
    ...(sinReferencia ? { sinReferencia: true } : {}),
    creditos,
  });
  // Y solo ahora, que ya no queda ninguna puerta gratis: los prompts van **siempre en inglés** (decisión firme
  // del propietario, 2026-09-27). Apagada la traducción, esto devuelve los textos tal cual; encendida y con
  // fallo, no se encola nada.
  const enIngles = await traducirAlIngles(
    actor.id,
    [
      { texto: prompt },
      { texto: contextoTotal, personajeId },
      // La descripción del producto la escribe el usuario en castellano y el prompt va en inglés.
      { texto: producto?.descripcionOriginal ?? "" },
    ],
    h.buscar,
  );
  const escenaEnIngles = enIngles.get(prompt) ?? prompt;
  const contextoEnIngles = enIngles.get(contextoTotal) ?? contextoTotal;
  /**
   * El producto tal como entra en las 6C. `conReferencias` dice la verdad sobre lo que va a recibir el modelo:
   * si no le cabe ninguna foto suya, se le pide un envase sin marca en lugar de prometerle una foto que no va
   * a llegar, que es lo que le hace inventarse la etiqueta.
   */
  const productoDelPrompt =
    producto && conProducto
      ? productoEnPrompt(
          producto,
          producto.descripcionOriginal === "" ? "" : (enIngles.get(producto.descripcionOriginal) ?? ""),
          conProducto.reparto.producto > 0,
        )
      : null;
  /**
   * **Las 6C sustituyen a la plantilla, no se meten dentro de ella.**
   *
   * Una escena dirigida trae ya sus seis bloques con su orden y su cierre de anclajes; pasarla como valor de
   * la variable `{{escena}}` de `fotograma-social` produciría dos cabeceras de cámara y dos bloques de
   * realismo, y el «C6 cierra siempre» dejaría de ser verdad porque la plantilla pone lo suyo después.
   *
   * La plantilla sigue siendo el camino de «Crear», donde no hay escena que dirija nada.
   */
  /**
   * **El producto también entra en el prompt cuando no hay seis C** (0.26.0), que es el camino de «Crear»: lo
   * compone una plantilla y no tiene hueco donde meter un bloque, así que el producto va detrás de lo que
   * ponga ella. Sin esto, elegir un producto en «Crear» no cambiaba una sola palabra de lo que se pedía.
   *
   * Y el **segundo paso del producto digital** sustituye el prompt entero: lo que se pide ahí no es una foto
   * nueva, es meter la captura en la pantalla de la que ya existe.
   */
  const base =
    productoDelPrompt && esInsercionDeCaptura(productoDelPrompt)
      ? { escena: componerInsercionDeCaptura(), compuesto: original.compuesto }
      : peticion.seisC
        ? {
            escena: componerSeisC(
              { ...peticion.seisC, contextoLibre: escenaEnIngles, producto: productoDelPrompt },
              peticion.cambiarSolo,
            ),
            // El texto no sale de la plantilla, pero la plantilla se validó y es la que aprobó la escena: se sigue
            // registrando para que la aprobación y la auditoría de «con qué versión se hizo» no queden en nulo.
            compuesto: original.compuesto,
          }
        : escenaEnIngles === prompt
          ? original
          : await baseDelPrompt(actor, peticion, "fotograma", modelo, conFicha.tipo, escenaEnIngles);
  const escenaDelFotograma =
    productoDelPrompt && !peticion.seisC && !esInsercionDeCaptura(productoDelPrompt)
      ? `${base.escena}\n${bloqueProductoSuelto(productoDelPrompt)}`
      : base.escena;
  const promptFinal = promptConContexto(escenaDelFotograma, contextoEnIngles);

  const parametros = adaptador.montarEntrada(modelo, { escena: promptFinal, dialogo: "", urls: [] });
  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "fotograma",
    provider: proveedor,
    model: modelo.modelo,
    // Se guarda el prompt **compuesto**, que es el que se envía: así el trabajo sigue llevando el contexto de
    // la versión que citó aunque la ficha cambie después.
    prompt: promptFinal,
    // Con qué referencia salió: es el dato que permite comparar la hoja 3×3 con las vistas sueltas.
    identityReferenceKind: elegido?.referenciaIdentidad ?? "vistas",
    input: {
      ...entradaGuardada(
        adaptador,
        promptFinal,
        referenciasDelPersonajeQueViajan(referencias, conProducto?.reparto ?? null).map((r) => r.id),
        parametros,
      ),
      // La tarifa exacta que se ha confirmado. El worker envía **esa** variante: sin esto, un cambio de variante
      // en el catálogo entre encolar y enviar pediría una cosa y cobraría otra.
      unidadPrecio: precio.unidad,
      // Lo que escribió la persona y lo que añadió el servidor, separados: el historial tiene que poder
      // mostrar las dos cosas sin adivinar dónde acaba una y empieza la otra.
      escena: prompt,
      // Lo que compuso la plantilla, aparte de lo que escribió la persona: el historial tiene que poder
      // mostrar las dos cosas, y auditar un prompt exige saber de qué plantilla y de qué presets salió.
      ...(base.compuesto
        ? {
            plantilla: {
              id: base.compuesto.plantillaId,
              version: base.compuesto.versionNumero,
              ...(base.compuesto.trend ? { kind: "trend" } : {}),
              editado: base.compuesto.editado,
              presets: base.compuesto.presetsElegidos,
            },
            textoDeLaPlantilla: base.escena,
          }
        : {}),
      ...(contextoEnIngles === "" ? {} : { contextoPersonaje: contextoEnIngles }),
      ...reservasGuardadas(reservas),
      // Marca de «este resultado es una vista generada del personaje»: la lee el cierre del trabajo para
      // añadirla como referencia etiquetada. Solo la pone el servidor.
      ...(peticion.vistaSintetica && personajeId ? { vistaSintetica: peticion.vistaSintetica } : {}),
      ...(peticion.hojaDeIdentidad && personajeId ? { hojaDeIdentidad: true } : {}),
      // Marca de «este fotograma nace de una descripción y no de ninguna foto» (0.22.0). La lee el worker para
      // no buscar referencias que no existen, y el cierre para añadir el retrato elegido como vista generada.
      ...(peticion.retratoInventado ? { retratoInventado: true } : {}),
      // Marca de «este trabajo no parte de ninguna imagen»: la lee el worker para no buscar referencias que no
      // existen y para montar la entrada del modelo de texto a imagen tal como se estimó.
      ...(sinReferencia ? { sinReferencia: true } : {}),
      // Fotos del producto que viajan con este envío, ya repartidas contra el tope del modelo. Se guardan sus
      // identificadores y no sus URL: las del proveedor caducan y no se guardan nunca.
      ...referenciasDeProductoGuardadas(producto, conProducto),
    },
    sourceMediaId: origen?.id ?? null,
    sceneId: conEscena?.escena.id ?? null,
    // El fotograma de una escena hereda su producto. En «Crear» no llega ninguno: allí el producto se elige
    // junto a la dirección del clip, que es donde se ve lo que se le va a pedir.
    ...columnasProducto,
    // Qué paso del producto digital es este envío, y la declaración de marca con su fecha.
    digitalStep: producto?.pasoDigital ?? "",
    brandRightsAt: producto ? new Date() : null,
    characterId: personajeId,
    characterVersionId: conFicha.versionId,
    ...columnasDePlantilla(base.compuesto),
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
    // El tope por trabajo se mide con lo que el usuario confirma, aquí y en el motor.
    creditosDelEnvio: totales,
    escena: await topeDeEscenasEnVuelo(conEscena?.escena.id ?? null, peticion.reintentoDeEscena),
  });
  return { trabajo: await vistaDeFila(fila), nueva };
}

/**
 * Duración que se le va a pedir al proveedor, **comprobada contra la tarifa que se acaba de leer**.
 *
 * La regla es una: lo que se paga y lo que se pide tienen que ser lo mismo. Si el precio del modelo depende de
 * la duración, la duración es la de esa tarifa; si no depende (Veo 3 cuesta igual a 4 y a 8 s), se pide la que
 * el usuario haya elegido siempre que el modelo la admita. Una duración que el modelo no sabe cobrar no se
 * aproxima con otra: se dice y no se gasta.
 */
function duracionCobrada(modelo: ModeloVista, unidad: string, pedidos: number | null): number {
  const deLaTarifa = segundosDeUnidad(unidad);
  const cobrables = duracionesConCoste(modelo);
  if (pedidos !== null && deLaTarifa !== null && pedidos !== deLaTarifa) {
    throw new ErrorGeneracion(
      409,
      `${modelo.nombre} no tiene precio registrado para un clip de ${pedidos} s: solo sabe cobrar ${cobrables.map((d) => `${d.segundos} s`).join(", ")}. Elige una de esas duraciones o cambia de modelo.`,
    );
  }
  if (deLaTarifa !== null) return deLaTarifa;
  if (pedidos !== null && modelo.parametros.duraciones.includes(pedidos)) return pedidos;
  const primera = cobrables[0]?.segundos ?? modelo.parametros.duraciones[0];
  if (primera !== undefined) return primera;
  // Un modelo de vídeo que no declara ninguna duración: se le pide la de referencia, como hasta la 0.23.3.
  return duracionParaModelo(modelo.parametros.duraciones, pedidos ?? CLIP.segundos);
}

export async function crearAnimacion(
  actor: Actor,
  peticion: PeticionAnimacion,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  /**
   * Un clip **dirigido** puede ir sin descripción: la imagen de partida ya dice lo que se ve y la dirección
   * pone el encuadre, la cámara y el gesto. Sin dirección se sigue exigiendo, como antes: entonces la
   * descripción es lo **único** que describe el clip.
   */
  const dirigiendo = peticion.direccion !== undefined || peticion.direccionElegida !== undefined;
  /** El trend elegido y las duraciones que admite. Sin lista, cualquier duración le vale. */
  let trendElegido: { nombre: string; duracionesAdmitidas: number[] } | null = null;
  if (peticion.plantillaId) {
    const plantilla = await plantillaUsable(actor.id, peticion.plantillaId);
    if (plantilla.kind === "trend") {
      await exigirTrendVigente(plantilla);
      trendElegido = { nombre: plantilla.name, duracionesAdmitidas: duracionesDelTrend(plantilla) };
    }
  }
  const prompt = dirigiendo ? limpiarPromptOpcional(peticion.prompt) : limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const partida = await partidaDelClip(actor.id, peticion);
  /**
   * **La duración se decide antes de estimar nada**, porque cada duración es una tarifa distinta del modelo: si
   * se estimara con una y se pidiera otra, lo reservado no cubriría lo que se cobra. Manda la del proyecto
   * cuando el clip produce una escena —esa ya la eligió el usuario para todo el proyecto— y, fuera de un
   * proyecto, la que se haya confirmado en «Crear».
   */
  const pedidos = partida.escenaId ? await duracionDeClipDeEscena(partida.escenaId) : (peticion.segundos ?? null);
  const sinDuracionAdmitida = trendElegido
    ? motivoDuracionNoAdmitida(trendElegido, pedidos, partida.escenaId ? "proyecto" : "clip")
    : null;
  if (sinDuracionAdmitida) {
    throw new ErrorGeneracion(
      409,
      `${sinDuracionAdmitida} Revisa la duración y el coste antes de confirmar. No se ha reservado nada.`,
    );
  }
  const { elegida, reservas } = await eleccionConfirmada(actor.id, "animacion", peticion, {
    ...(pedidos === null ? {} : { segundos: pedidos }),
  });
  const eleccion = elegida.eleccion;
  const { modelo, adaptador, precio } = eleccion;
  const creditos = Math.ceil(precio.creditos);
  const totales = await creditosDelEnvio(creditos);
  exigirConfirmacion(peticion.creditosConfirmados, totales);
  await exigirAvisoUmbral(totales, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  // Igual que en el fotograma: tras el corte de idempotencia y **antes** del motor.
  await exigirRitmo(actor.id);

  // El clip hereda el personaje del fotograma, así que hereda también sus reglas: si el consentimiento se ha
  // revocado entre el fotograma y el clip, el clip no sale. Y la revisión de referencias se vuelve a confirmar,
  // porque es otra confirmación distinta sobre otro envío distinto.
  if (partida.personajeId) exigirRevisionDeReferencias(peticion.sinTerceros);
  const personaje = partida.personajeId ? await personajePorId(partida.personajeId) : null;

  /**
   * **El producto del clip** (0.26.0): el de la escena cuando el clip sale de un proyecto, y el elegido en
   * «Crear» cuando no hay escena. Se resuelve antes de la puerta, que es donde se avisa de lo que cuesta
   * llevarlo: las referencias que no caben y la marca que el filtro del proveedor puede rechazar.
   */
  const columnasProducto = await productoDelTrabajo(actor.id, partida.escenaId, peticion.productoElegido);
  // El clip **no** es un paso del producto digital: anima el fotograma que ya tiene la captura puesta.
  const producto = await productoParaGenerar(
    actor.id,
    columnasProducto.productId,
    columnasProducto.productAction,
    undefined,
    await eleccionDeFotosDelTrabajo(partida.escenaId, peticion.productoElegido),
  );
  if (producto) exigirDerechoDeMarca(peticion.derechoMarca);
  // Un clip parte de **una** imagen: su fotograma aprobado. Este camino no cita ninguna identidad registrada: la
  // escena hablada en modo Omni va por `omni/escena.ts`.
  const conProducto = producto ? await repartoDelEnvio({ producto, adaptador, modelo, envio: { tipo: "clip" } }) : null;
  if (conProducto) await completarModelosSugeridos(conProducto.hechos, CAPACIDAD_DE_TIPO.animacion);

  const conRepartoDelClip = await hechosDelRepartoDeEscena(partida.escenaId);

  // ── Punto único: el mismo motor, con los hechos del clip ──────────────────────────────────────────────
  await exigirControles(
    // El sujeto es la escena cuando el clip pertenece a una: es lo que hay que poder auditar después, y guardar
    // «trabajo» con un `subject_id` de escena haría imposible filtrar las evaluaciones de un proyecto.
    {
      usuarioId: actor.id,
      sujeto: partida.escenaId ? "escena" : "trabajo",
      sujetoId: partida.escenaId,
      tipo: "animacion",
    },
    await recopilarHechos(
      actor,
      {
        tipo: "animacion",
        eleccion,
        creditos: totales,
        personajeId: partida.personajeId,
        personaje,
        // El clip hereda la escena del fotograma, así que hereda también su presupuesto. Su **aprobación** no se
        // vuelve a mirar: ya se comprobó al producir el fotograma, y el clip no es otra decisión de guion.
        escena: null,
        proyecto: partida.escenaId ? await techoDelProyecto(await proyectoDeEscena(partida.escenaId)) : null,
        // El clip hereda también el reparto de su escena: si el consentimiento de la segunda persona se ha
        // revocado entre el fotograma y el clip, el clip no sale.
        ...(conRepartoDelClip ? { reparto: conRepartoDelClip } : {}),
        ...(conProducto ? { producto: conProducto.hechos } : {}),
      },
      h.buscar,
    ),
    peticion.avisosConfirmados ?? [],
  );

  const proveedor = proveedorDeCredencial(modelo);
  const origen = await imagenPropia(actor.id, partida.medioId);
  // Un modelo sin voz no recibe nunca lo que dice el personaje (Hailuo 2.3 no tiene audio).
  const dialogo = modelo.conVoz ? limpiarDialogo(peticion.dialogo) : "";
  // El clip lleva el contexto de **la misma versión que el fotograma**, no de la vigente: si la ficha ha
  // cambiado entre los dos, animar tiene que seguir siendo el mismo personaje que se generó.
  exigirVersionConfirmada(peticion.versionPersonaje, partida.versionPersonajeId);
  const { contexto: contextoPersonaje, tipo } = await contextoDeLaVersion(partida.versionPersonajeId);
  const contexto = [contextoPersonaje, await contextoAnimadoDeEscena(partida.escenaId, personaje)]
    .filter(Boolean)
    .join("\n");
  /**
   * La dirección del clip. La de la producción de un proyecto la resuelve el servidor desde la escena y manda
   * siempre; la de «Crear» llega como **claves elegidas** y se resuelve aquí con el catálogo del usuario, que es
   * el único sitio donde una clave se convierte en texto de prompt (ADR-0022).
   */
  const direccionElegida =
    peticion.direccion ??
    (peticion.direccionElegida
      ? await direccionDesdeEleccion(
          actor.id,
          peticion.direccionElegida,
          await personajeDelFotograma(partida.personajeId),
        )
      : null);
  // La plantilla del clip compone el texto con la duración y el look elegidos. La duración que declare el
  // preset se valida contra la que se le envía de verdad al proveedor (`segundos`), que es la unidad con la
  // que está medido el precio: pedir otra se rechaza con su motivo en lugar de cobrarse mal. Se compone primero
  // con el texto original: valida la combinación y es lo que miden las reglas, y las dos cosas son gratis.
  /**
   * Duración del clip: la que ha elegido el proyecto de la escena, y la del modelo cuando el clip no pertenece a
   * ninguna (el camino rápido de «Crear»). Se decide **antes** de componer, porque un preset de duración se valida
   * contra la que de verdad se va a pedir.
   */
  const segundos = duracionCobrada(modelo, precio.unidad, pedidos);
  const original = await baseDelPrompt(actor, peticion, "animacion", modelo, tipo, prompt, segundos);
  const direccion =
    direccionElegida ??
    (original.compuesto?.trend
      ? await direccionDesdeEleccion(
          actor.id,
          DIRECCION_CON_ACENTO_VACIA,
          await personajeDelFotograma(partida.personajeId),
        )
      : null);
  if (original.compuesto?.trend && direccion?.modoExperto)
    throw new ErrorGeneracion(
      409,
      "El modo experto sustituiría el formato del trend. Desactívalo para generar este clip.",
    );
  await exigirDecisionFavorable({
    tipo: "animacion",
    escena: original.escena,
    dialogo: original.compuesto?.trend && !original.compuesto.trend.permiteHabla ? "" : dialogo,
    contexto,
    conVoz: modelo.conVoz,
    conReferencia: true,
    ...(direccion ? { dirigido: true } : {}),
    creditos,
  });
  // Igual que en el fotograma: la descripción y el contexto se traducen al inglés antes de componer, y solo
  // después de todas las puertas gratis. **El diálogo no**: es lo que dirá el personaje y tiene que salir en el
  // idioma en que se escribió.
  // El matiz de voz del usuario viaja con el resto del texto libre: está escrito en castellano y el prompt va
  // en inglés. El diálogo sigue sin traducirse, que es lo que se va a oír.
  const matizDeVoz = direccion?.direccionVocalOriginal ?? "";
  // Las instrucciones adicionales y la descripción del modo experto viajan con el resto del texto libre: las
  // escribe el usuario en castellano y el prompt va en inglés. Ya vienen limpias del borde.
  const instrucciones = direccion?.instruccionesExtraOriginal ?? "";
  const descripcionExperta = direccion?.descripcionExpertaOriginal ?? "";
  const enIngles = await traducirAlIngles(
    actor.id,
    [
      { texto: prompt },
      { texto: contexto, personajeId: partida.personajeId },
      { texto: matizDeVoz },
      { texto: instrucciones },
      { texto: descripcionExperta },
      // La descripción del producto viaja con el resto del texto libre: la escribe el usuario en castellano.
      { texto: producto?.descripcionOriginal ?? "" },
    ],
    h.buscar,
  );
  const escenaEnIngles = enIngles.get(prompt) ?? prompt;
  const contextoEnIngles = enIngles.get(contexto) ?? contexto;
  const enInglesO = (texto: string) => (texto === "" ? "" : (enIngles.get(texto) ?? texto));
  // La dirección se aplica **aquí**, con el texto libre ya en inglés y después de todas las puertas gratis: es
  // lo que pone el encuadre, la cámara, el gesto en su momento y la regla de toma única alrededor de la escena.
  const productoDelPrompt =
    producto && conProducto
      ? productoEnPrompt(
          producto,
          producto.descripcionOriginal === "" ? "" : (enIngles.get(producto.descripcionOriginal) ?? ""),
          conProducto.reparto.producto > 0,
        )
      : null;
  const dirigido = direccion
    ? dirigirClipPara(familiaDe(modelo.modelo), {
        ...direccion,
        trend: original.compuesto?.trend ?? null,
        producto: productoDelPrompt,
        direccionVocal: enInglesO(matizDeVoz),
        instruccionesExtra: enInglesO(instrucciones),
        descripcionExperta: enInglesO(descripcionExperta),
        escena: original.compuesto?.trend
          ? (await baseDelPrompt(actor, peticion, "animacion", modelo, tipo, escenaEnIngles, segundos)).escena
          : escenaEnIngles,
        dialogo,
        // La duración **resuelta para este modelo**, que es la que se sella en el precio y la que decide si el
        // gesto cabe fuera del diálogo. La planificada de la escena puede no ser la que acepta el modelo.
        segundos,
      })
    : null;
  const escenaDirigida = dirigido?.escena ?? escenaEnIngles;
  // En formato mudo el diálogo **no viaja**, aunque el guion tenga texto: el clip lleva la boca cerrada.
  const dialogoFinal = dirigido ? dirigido.dialogo : dialogo;
  /**
   * **La dirección sustituye a la plantilla, no se mete dentro de ella.**
   *
   * Es la misma regla que ya seguían las 6C del fotograma, y por el mismo motivo: un clip dirigido trae su
   * bloque de cámara, su gesto en su sitio y su regla de toma única. Pasarlo como valor de `{{escena}}` de
   * `clip-social` ponía **dos** cabeceras de cámara, dos veces la toma única y un look que competía con el
   * registro estético ya elegido. Cada concepto se pide una sola vez.
   *
   * La plantilla se sigue componiendo antes (valida la combinación con el modelo) y se sigue registrando: la
   * auditoría tiene que poder decir con qué versión se aprobó el trabajo.
   */
  const base = dirigido
    ? { escena: escenaDirigida, compuesto: original.compuesto }
    : escenaDirigida === prompt
      ? original
      : await baseDelPrompt(actor, peticion, "animacion", modelo, tipo, escenaDirigida, segundos);
  const promptFinal = promptConContexto(base.escena, contextoEnIngles);
  const parametros = adaptador.montarEntrada(modelo, {
    escena: promptFinal,
    dialogo: dialogoFinal,
    urls: [],
    segundos,
  });
  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "animacion",
    provider: proveedor,
    model: modelo.modelo,
    prompt: promptFinal,
    /**
     * El clip **hereda** la referencia de su fotograma: la cara que se anima es la que salió de ahí, así que
     * el veredicto de identidad del clip mide la misma referencia que el fotograma usó.
     */
    identityReferenceKind: partida.referenciaIdentidad,
    input: {
      ...entradaGuardada(adaptador, promptFinal, [origen.id], { ...parametros, segundos }),
      // La tarifa confirmada: es la de **esta** duración, y es la que el worker vuelve a comprobar antes de enviar.
      unidadPrecio: precio.unidad,
      dialogo: dialogoFinal,
      escena: prompt,
      /**
       * Lo que el usuario eligió, **en claves**, para poder volver a abrirlo tal cual en «Cambiar y volver a
       * generar» (0.25.1). No es el prompt: son los identificadores que leyó en los botones, así que puede
       * salir hacia su navegador sin romper ADR-0022. En un proyecto no se guarda: lo elegido vive en la escena.
       */
      ...(peticion.direccionElegida ? { direccionElegida: peticion.direccionElegida } : {}),
      ...(base.compuesto
        ? {
            plantilla: {
              id: base.compuesto.plantillaId,
              version: base.compuesto.versionNumero,
              ...(base.compuesto.trend ? { kind: "trend" } : {}),
              editado: base.compuesto.editado,
              presets: base.compuesto.presetsElegidos,
            },
            textoDeLaPlantilla: base.escena,
          }
        : {}),
      ...(contextoEnIngles === "" ? {} : { contextoPersonaje: contextoEnIngles }),
      ...reservasGuardadas(reservas),
      ...referenciasDeProductoGuardadas(producto, conProducto),
    },
    sourceMediaId: origen.id,
    // El clip hereda la escena del fotograma: su aprobación es la misma y ya se comprobó al producirlo.
    sceneId: partida.escenaId,
    // El producto con el que se pidió: el de la escena cuando el clip sale de un proyecto y el elegido en
    // «Crear» cuando no hay escena.
    ...columnasProducto,
    // El clip no es un paso del producto digital, pero sí lleva la declaración de marca con su fecha.
    brandRightsAt: producto ? new Date() : null,
    parentJobId: partida.trabajoPadreId,
    characterId: partida.personajeId,
    characterVersionId: partida.versionPersonajeId,
    ...columnasDePlantilla(base.compuesto),
    referencesReviewedAt: partida.personajeId ? new Date() : null,
    estimatedCredits: creditos,
  };
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    acotacion: acotarCoste("animacion", eleccion),
    valores,
    sello: precio.sello,
    creditosDelEnvio: totales,
    escena: await topeDeEscenasEnVuelo(partida.escenaId, peticion.reintentoDeEscena),
  });
  return { trabajo: await vistaDeFila(fila), nueva };
}
