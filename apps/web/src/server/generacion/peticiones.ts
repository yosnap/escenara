import type { Vista } from "@/lib/captura-personaje";
import type { DireccionElegidaConAcento } from "@/lib/direccion";
import type { LugarElegido } from "@/lib/lugares";
import type { SeleccionPresets } from "@/lib/presets";
import type { PasoProductoDigital, ProductoElegido } from "@/lib/productos";
import type { DireccionSinTextoLibre } from "../direccion/escena";
import type { CambiarSolo, SeisC } from "../direccion/fotograma";
import type { EdicionDeLugar } from "../lugares/edicion";
import type { EdicionDeProducto } from "../productos/generacion";

/**
 * **Lo que llega para encargar un trabajo** de generación: la confirmación común y las peticiones del fotograma y del
 * clip. Son solo tipos; las reglas que los comprueban viven en `servicio.ts`, que los reexporta.
 */

/** Confirmación común a los dos tipos de trabajo. */
export interface Confirmacion {
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
  /** Proporción que fija **el servidor** (el formato principal del proyecto, 0.41.0). Manda sobre el preset. */
  proporcion?: string;
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

export interface PeticionFotograma extends Confirmacion {
  referenciasTemporales?: unknown;
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
  /** **Lugar elegido en «Crear»**. En un proyecto no llega: lo pone la escena (o lo hereda del proyecto). */
  lugarElegido?: LugarElegido | null;
  /** Foto editada o candidato de un lugar: lo pone el servidor (`lugares/edicion.ts`), nunca el navegador. */
  edicionDeLugar?: EdicionDeLugar;
  /** Vista generada de un producto: la pone el servidor (`productos/generacion.ts`), nunca el navegador. */
  edicionDeProducto?: EdicionDeProducto;
  /** Lo que ve el usuario como «escena» cuando el prompt lo compone el servidor (ADR-0022). Solo lo pone el servidor. */
  escenaVisible?: string;
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
