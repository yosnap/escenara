import type { EvaluacionVista } from "./controles";
import type { EstadoTrabajo, MotivoFallo, TipoTrabajoCola } from "./generacion";
import type { Medio } from "./media/tipos";
import type { EstadoEscena } from "./proyectos";

/**
 * Producción de las escenas de un proyecto aprobado (RF06, 0.19.0) tal como la comparten el servidor y el
 * navegador. Aquí no hay ninguna lectura ni ninguna regla de dinero: solo tipos, etiquetas y funciones puras.
 *
 * La regla que gobierna este fichero es una: **el progreso no se inventa**. No hay ningún porcentaje, ninguna
 * estimación de «faltan N segundos» y ninguna fase calculada con un reloj. Lo único que se muestra son las
 * **etapas reales** por las que pasa un trabajo, deducidas de su estado propio y del estado que informa el
 * proveedor, y el tiempo transcurrido, que es un dato medido.
 */

// ── Etapas del trabajo ────────────────────────────────────────────────────────────────────────────────────

/**
 * Etapas por las que pasa un trabajo, en orden. Cada una corresponde a un hecho comprobable:
 *
 * - `preparando`: un worker lo ha tomado y está resolviendo modelo, credencial y referencias;
 * - `enviado`: existe la tarea en el proveedor (hay `task_id`);
 * - `en_curso`: el proveedor informa de que está generando;
 * - `descargando`: el proveedor dice que está listo y se está trayendo el archivo a la biblioteca;
 * - `listo`: el archivo está guardado.
 */
export const ETAPAS_TRABAJO = ["preparando", "enviado", "en_curso", "descargando", "listo"] as const;
export type EtapaTrabajo = (typeof ETAPAS_TRABAJO)[number];

export const esEtapaTrabajo = (v: unknown): v is EtapaTrabajo => ETAPAS_TRABAJO.includes(v as EtapaTrabajo);

export const ETIQUETA_ETAPA: Record<EtapaTrabajo, string> = {
  preparando: "Preparando el envío",
  enviado: "En cola en el proveedor",
  en_curso: "Generando",
  descargando: "Guardando en tu biblioteca",
  listo: "Listo",
};

/** Estados en los que el trabajo todavía no ha entrado en ninguna etapa: espera su turno o una decisión. */
const ANTES_DE_EMPEZAR: readonly EstadoTrabajo[] = ["en_cola", "esperando_limite"];

/** Estados en los que el trabajo ya no avanza: no hay etapa «en curso» que señalar. */
const TERMINADOS: readonly EstadoTrabajo[] = ["listo", "fallido", "cancelado", "desconocido"];

/**
 * Etapa en la que está un trabajo. `etapaGuardada` es lo que apuntó el servidor al pasar por ella (la columna
 * `stage`); el estado manda cuando las dos cosas no coinciden, porque el estado es lo que decide el dinero.
 *
 * `null` = el trabajo no ha entrado en ninguna etapa todavía, o ya terminó sin llegar a la última.
 */
export function etapaDeTrabajo(estado: EstadoTrabajo, etapaGuardada: EtapaTrabajo | null): EtapaTrabajo | null {
  if (estado === "listo") return "listo";
  if (ANTES_DE_EMPEZAR.includes(estado)) return null;
  if (estado === "preparando" || estado === "enviando") return "preparando";
  if (estado === "enviado") return "enviado";
  if (estado === "en_curso") return etapaGuardada === "descargando" ? "descargando" : "en_curso";
  // `fallido`, `cancelado` y `desconocido`: la última etapa por la que pasó, si se apuntó alguna.
  return etapaGuardada;
}

/** Estado de cada etapa para el componente de progreso, sin ningún porcentaje. */
export interface EtapaVista {
  nombre: string;
  estado: "hecha" | "en-curso" | "pendiente" | "error";
}

/**
 * Las cinco etapas con su estado, a partir de hechos: la etapa actual, si el trabajo terminó y si falló. Función
 * pura, así que se prueba tal cual y no puede divergir de lo que se pinta.
 */
export function etapasDeTrabajo(estado: EstadoTrabajo, etapaGuardada: EtapaTrabajo | null): EtapaVista[] {
  const actual = etapaDeTrabajo(estado, etapaGuardada);
  const fallado = estado === "fallido" || estado === "cancelado" || estado === "desconocido";
  const indiceActual = actual === null ? -1 : ETAPAS_TRABAJO.indexOf(actual);
  return ETAPAS_TRABAJO.map((etapa, indice) => ({
    nombre: ETIQUETA_ETAPA[etapa],
    estado:
      indice < indiceActual
        ? "hecha"
        : indice > indiceActual
          ? "pendiente"
          : fallado
            ? "error"
            : estado === "listo"
              ? "hecha"
              : "en-curso",
  }));
}

/** `true` cuando el trabajo ha terminado, de cualquier manera. */
export const trabajoTerminado = (estado: EstadoTrabajo): boolean => TERMINADOS.includes(estado);

// ── Reintentos de pago ────────────────────────────────────────────────────────────────────────────────────

/**
 * Motivos de fallo que se cierran **sin coste probado**: son los únicos que se pueden repetir sin consumir un
 * reintento de pago. Es la misma lista blanca de 0.12.0, leída al revés: `temporal`, `contenido` y `respuesta`
 * quedan fuera porque **puede haberse pagado** (algunos modelos cobran el intento, y un 5xx no prueba nada).
 */
export const FALLOS_SIN_COSTE: readonly MotivoFallo[] = [
  "interno",
  "limite",
  "cancelado",
  "consentimiento",
  "sin_acotar",
  "credencial",
  "saldo",
];

/** `true` cuando ese fallo puede haber costado dinero, así que repetirlo consume un reintento autorizado. */
export const falloConCoste = (motivo: MotivoFallo | null): boolean =>
  motivo !== null && !FALLOS_SIN_COSTE.includes(motivo);

// ── Duraciones y formatos disponibles ─────────────────────────────────────────────────────────────────────

/**
 * Duraciones de clip que esta versión ofrece, en segundos, de la predeterminada a la opcional.
 *
 * Las dos están **medidas con dinero real** el 2026-09-27: KIE cobra los mismos 60 créditos por un clip de 4 s
 * que por uno de 8 s, así que la duración corta no abarata nada y la larga es la de fábrica. El resto de
 * proporciones y resoluciones llega en 0.26.0.
 */
export const DURACIONES_DISPONIBLES: readonly number[] = [8, 4];

/** Duración de clip de un proyecto nuevo. La misma que el valor por omisión de la columna del proyecto. */
export const DURACION_PREDETERMINADA = 8;

export const PROPORCION_DISPONIBLE = "9:16";
export const RESOLUCION_DISPONIBLE = "720p";

export const esDuracionDisponible = (segundos: number): boolean => DURACIONES_DISPONIBLES.includes(segundos);

/** Las duraciones ofrecidas escritas para leerlas en un aviso: «8 o 4 s». */
export const duracionesEnTexto = (): string => `${DURACIONES_DISPONIBLES.join(" o ")} s`;

/**
 * Duración que se le pide de verdad al modelo para un clip de este proyecto: la del proyecto si el modelo la
 * admite y, si no, la primera que declare. Un modelo que no declara ninguna se queda con la del proyecto: es lo
 * que se ha estimado y lo que se le va a cobrar.
 */
export function duracionParaModelo(duraciones: readonly number[], segundosDelProyecto: number): number {
  if (duraciones.length === 0 || duraciones.includes(segundosDelProyecto)) return segundosDelProyecto;
  return duraciones[0] ?? segundosDelProyecto;
}

/** Zona segura de cada plataforma vertical, en % del alto y del ancho del fotograma (medido el 2026-09-27). */
export interface ZonaSegura {
  plataforma: string;
  /** Franja de arriba que tapa la interfaz de la aplicación, en % del alto. */
  arribaPorCiento: number;
  /** Franja de abajo (leyenda, audio, botones), en % del alto. */
  abajoPorCiento: number;
  /** Franja de la derecha (botones de acción), en % del ancho. */
  derechaPorCiento: number;
  /** Qué tapa exactamente, para poder decirlo en lenguaje llano. */
  nota: string;
}

/**
 * Zonas seguras de las tres plataformas verticales. Son **aproximaciones documentadas**, no una garantía: cada
 * aplicación cambia su interfaz cuando quiere, así que la previsualización las dibuja y lo dice.
 */
export const ZONAS_SEGURAS: readonly ZonaSegura[] = [
  {
    plataforma: "TikTok",
    arribaPorCiento: 10,
    abajoPorCiento: 22,
    derechaPorCiento: 18,
    nota: "Arriba el buscador y las pestañas; abajo el nombre, la descripción y el audio; a la derecha los botones.",
  },
  {
    plataforma: "Reels",
    arribaPorCiento: 8,
    abajoPorCiento: 20,
    derechaPorCiento: 16,
    nota: "Arriba el título; abajo el perfil y la descripción; a la derecha los botones de acción.",
  },
  {
    plataforma: "Shorts",
    arribaPorCiento: 8,
    abajoPorCiento: 18,
    derechaPorCiento: 16,
    nota: "Abajo el título y el canal; a la derecha los botones; arriba la barra de la aplicación.",
  },
];

// ── Vistas que viajan al navegador ────────────────────────────────────────────────────────────────────────

/** Un trabajo de la producción de una escena, reducido a lo que la rejilla necesita. */
export interface TrabajoDeEscena {
  id: string;
  tipo: TipoTrabajoCola;
  estado: EstadoTrabajo;
  /** Estado crudo del proveedor, tal cual, si se conoce. */
  estadoProveedor: string | null;
  /** Etapa real por la que va, o `null` si aún no ha entrado en ninguna. */
  etapa: EtapaTrabajo | null;
  creditosEstimados: number;
  creditosConsumidos: number | null;
  error: string | null;
  motivoFallo: MotivoFallo | null;
  /** Puesto real en la cola de la instalación, contado en la base de datos. */
  posicionEnCola: number | null;
  /** Medio resultante ya guardado, si existe, con su URL temporal para poder verlo. */
  medio: Medio | null;
  modelo: string;
  creadoEn: string;
  enviadoEn: string | null;
  terminadoEn: string | null;
}

/** Una versión anterior de una escena: qué se generó, con qué y cuánto costó. */
export interface VersionDeEscena {
  trabajoId: string;
  tipo: TipoTrabajoCola;
  modelo: string;
  estado: EstadoTrabajo;
  creditosEstimados: number;
  creditosConsumidos: number | null;
  medio: Medio | null;
  creadoEn: string;
  /**
   * Qué cambió respecto a la generación anterior, en lenguaje llano (PRD §6). Vacío en la primera generación de
   * la escena o cuando no cambió nada que se pueda nombrar.
   */
  cambio: string;
}

/** Una escena en la rejilla de producción, con su estado real y lo que se puede hacer con ella. */
export interface EscenaProduccionVista {
  id: string;
  orden: number;
  resumen: string;
  estado: EstadoEscena;
  segundos: number;
  /** Controles previos de la escena (mismo motor que cierra la puerta al producirla). */
  controles: EvaluacionVista;
  /** Trabajo del fotograma en marcha o el último que hubo; `null` si nunca se ha producido. */
  fotograma: TrabajoDeEscena | null;
  /** Trabajo de la animación, igual. */
  animacion: TrabajoDeEscena | null;
  /** Fotograma que el usuario aprobó; `null` mientras no apruebe ninguno. Es el que se anima y el que monta. */
  fotogramaAprobado: Medio | null;
  /** Clip resultante de la escena, si ya está. */
  clip: Medio | null;
  /** Créditos estimados de la escena entera (fotograma + clip), tal como los congeló el plan. */
  creditosEstimados: number;
  /** Créditos ya consumidos en esta escena, informados por el proveedor. */
  creditosConsumidos: number;
  /** Reintentos de pago consumidos y autorizados (decisión 2 de la fase). */
  reintentosUsados: number;
  presupuestoReintentos: number;
  /** Motivo del último fallo apto para el usuario; vacío si no ha fallado nada. */
  motivoUltimoFallo: string;
  /** La escena se editó después de generarla: lo producido ya no corresponde a lo que dice. */
  cambiadaDesdeLaGeneracion: boolean;
  /** Versiones anteriores, de la más reciente a la más antigua. */
  versiones: VersionDeEscena[];
}

/** Estado completo de la producción de un proyecto: es lo que pinta `/proyectos/[id]/produccion`. */
export interface ProduccionVista {
  proyectoId: string;
  titulo: string;
  /** Presupuesto autorizado del proyecto en créditos; 0 = sin fijar. */
  presupuestoCreditos: number;
  /** Créditos ya comprometidos del proyecto (reservas vivas más consumos, incluido el asistente). */
  comprometidoCreditos: number;
  /** `true` cuando el plan del proyecto está aprobado: sin eso no se produce nada. */
  planAprobado: boolean;
  escenas: EscenaProduccionVista[];
  /** Escenas que se pueden encolar ahora mismo y lo que costaría hacerlo. */
  porProducir: number;
  creditosPorFotograma: number;
  /**
   * Umbral de aviso por gasto alto de Admin › Ajustes, en créditos y **por trabajo**. Es el mismo que compara el
   * servidor (`generacion/comprobaciones.ts › exigirAvisoUmbral`), así que la confirmación puede pedir la casilla
   * del aviso exactamente cuando el servidor la va a exigir.
   */
  umbralAvisoCreditos: number;
  /** Lo que costaría animar un fotograma aprobado, con su sello. Es el segundo gasto de cada escena. */
  creditosPorClip: number;
  selloClip: string;
  /** Sello del precio del fotograma vigente: viaja en la confirmación del gasto. */
  selloFotograma: string;
  /**
   * Controles previos del **modelo** con el que se produce: son los del proyecto entero, no de una escena, porque
   * el modelo y su precio son los mismos para todas. Aquí salen los avisos salvables (precio comprobado hace más
   * de 90 días, coste que no se puede acotar), que se confirman una vez y valen para toda la producción.
   */
  controlesDelModelo: EvaluacionVista;
  /** Escenas del usuario con algún trabajo en marcha, y el tope de esta instalación. */
  enVuelo: number;
  maximoEnVuelo: number;
  /** Lo que impide producir ahora mismo, en lenguaje llano. Vacío = se puede producir. */
  impedimentos: string[];
}

// ── Funciones puras de la rejilla ──────────────────────────────────────────────────────────────────────────

const EN_MARCHA: readonly EstadoTrabajo[] = ["en_cola", "preparando", "enviando", "enviado", "en_curso"];

/** `true` si ese trabajo sigue vivo en la cola o en el proveedor. */
export const trabajoEnMarcha = (trabajo: TrabajoDeEscena | null): boolean =>
  trabajo !== null && EN_MARCHA.includes(trabajo.estado);

/** `true` si la escena tiene algo en marcha: es lo que cuenta para el tope de escenas en vuelo. */
export const escenaEnVuelo = (escena: EscenaProduccionVista): boolean =>
  trabajoEnMarcha(escena.fotograma) || trabajoEnMarcha(escena.animacion);

/** `true` cuando hay un fotograma listo y guardado que el usuario todavía no ha aprobado. */
export const fotogramaPorAprobar = (escena: EscenaProduccionVista): boolean =>
  escena.fotograma?.estado === "listo" && escena.fotograma.medio !== null && escena.fotogramaAprobado === null;

/**
 * `true` cuando ese importe **por trabajo** pasa del umbral de aviso de la instalación, así que hay que aceptar el
 * aviso de gasto alto antes de enviarlo.
 *
 * Es la **misma comparación** que hace el servidor antes de encolar (`generacion/comprobaciones.ts ›
 * exigirAvisoUmbral`) y la misma que usa «Crear». Con el umbral a cero —que en Admin › Ajustes significa «avisar
 * siempre»— avisa de cualquier gasto: si la casilla no apareciera, el envío se rechazaría con un 400 y no habría
 * forma de producir.
 */
export const exigeAvisoDeGasto = (creditos: number, umbral: number): boolean => creditos > umbral;

/** `true` si ese trabajo falló **después** de hablar con el proveedor, así que puede haberse cobrado. */
const falloQuePudoCobrarse = (trabajo: TrabajoDeEscena | null): boolean =>
  trabajo !== null && trabajo.estado === "fallido" && falloConCoste(trabajo.motivoFallo);

/**
 * `true` cuando el último trabajo de la escena falló con coste posible. Volver a enviarla no es gratis: pasa por
 * regenerarla, que consume un reintento autorizado (ADR-0024). Por eso una escena así **no entra en el lote** de
 * «producir lo pendiente»: el botón de lote no puede volver a pagar un fallo sin que nadie lo autorice.
 */
export const esperaAutorizacionDeReintento = (escena: EscenaProduccionVista): boolean =>
  falloQuePudoCobrarse(escena.fotograma) || falloQuePudoCobrarse(escena.animacion);

/**
 * `true` cuando hay un fotograma aprobado, no hay clip y nada lo está animando: el clip no llegó a encolarse (su
 * envío se rechazó por un tope, por el techo del proyecto o por un control) y la salida honesta es volver a ofrecer
 * animarlo, no obligar a regenerar el fotograma y pagarlo otra vez. Si la animación falló con coste posible, no:
 * eso pasa por los reintentos autorizados.
 */
export const clipPorEncolar = (escena: EscenaProduccionVista): boolean =>
  escena.fotogramaAprobado !== null &&
  escena.clip === null &&
  !trabajoEnMarcha(escena.animacion) &&
  !falloQuePudoCobrarse(escena.animacion);

/** `true` cuando la escena ya tiene su clip guardado: es el hito de «escena lista». */
export const escenaLista = (escena: EscenaProduccionVista): boolean => escena.clip !== null;

/**
 * Qué se puede cancelar de una escena y qué no. Es **zona de claridad**: lo que todavía no ha salido hacia el
 * proveedor suelta su reserva, y lo que ya salió se cobrará (decisión provisional del propietario,
 * 2026-09-27: KIE no documenta ninguna cancelación).
 */
export interface EfectoCancelacion {
  /** Trabajos que se cancelarían de verdad, soltando su reserva. */
  seCancelan: number;
  /** Trabajos ya enviados: no se cancelan y se cobrarán. */
  seCobraran: number;
}

export function efectoDeCancelar(escena: EscenaProduccionVista): EfectoCancelacion {
  const trabajos = [escena.fotograma, escena.animacion].filter((t): t is TrabajoDeEscena => t !== null);
  const vivos = trabajos.filter((t) => EN_MARCHA.includes(t.estado));
  const sinEnviar = vivos.filter((t) => t.estado === "en_cola" || t.estado === "esperando_limite");
  return { seCancelan: sinEnviar.length, seCobraran: vivos.length - sinEnviar.length };
}

/** Texto honesto de lo que va a pasar al cancelar. Nunca promete cancelar lo que ya se está pagando. */
export function textoDeCancelacion(efecto: EfectoCancelacion): string {
  if (efecto.seCancelan === 0 && efecto.seCobraran === 0) return "Esta escena no tiene nada en marcha que cancelar.";
  const partes: string[] = [];
  if (efecto.seCancelan > 0) {
    partes.push(
      efecto.seCancelan === 1
        ? "Se cancelará un trabajo que todavía no ha salido y se soltará su reserva: no habrá costado nada."
        : `Se cancelarán ${efecto.seCancelan} trabajos que todavía no han salido y se soltarán sus reservas: no habrán costado nada.`,
    );
  }
  if (efecto.seCobraran > 0) {
    partes.push(
      efecto.seCobraran === 1
        ? "Hay un trabajo que ya está en el proveedor: se cobrará y seguirá hasta el final. El proveedor no admite cancelarlo."
        : `Hay ${efecto.seCobraran} trabajos que ya están en el proveedor: se cobrarán y seguirán hasta el final. El proveedor no admite cancelarlos.`,
    );
  }
  return partes.join(" ");
}
