import { ETIQUETA_VISTA, esVista } from "@/lib/captura-personaje";
import { DIAS_PRECIO_FRESCO } from "@/lib/catalogo";
import { type EstadoControl, peorEstado } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import { formatearTamano } from "@/lib/media/reglas";
import { formatearFecha } from "@/lib/proyectos";
import { accionSinPresupuesto, motivoSinPresupuesto } from "../presupuesto/mensajes";
import {
  type Evaluacion,
  type Freno,
  type FrenoResuelto,
  type Hechos,
  type HechosCredencial,
  REGLAS_VERSION,
} from "./contrato";

/**
 * Motor de reglas de los controles previos (RF12, 0.18.0). **Es el único sitio donde se decide si algo se
 * puede generar.**
 *
 * Determinista y puro: la misma entrada da siempre la misma salida, no consulta nada y no cuesta nada. Todo
 * lo que hay que leer se lee antes (`hechos.ts`), así que la misma evaluación vale para pintar el panel
 * «Antes de generar» —una lectura que no mueve ni un céntimo— y para cerrar la puerta del encolado
 * (`puerta.ts`).
 *
 * Las reglas están en **orden de precedencia**: lo objetivo y comprobable primero (credencial, derechos de
 * imagen, modelo, dinero), después lo que exige que el usuario aporte algo, y al final los avisos salvables.
 * El estado global es el peor de los frenos que hayan saltado.
 *
 * Lo que este motor **no** hace, a propósito (decisión provisional del propietario, 2026-09-27): validar la
 * petición. La limpieza del prompt, las casillas declarativas, el coste confirmado, el sello del precio, la
 * clave de idempotencia y el ritmo de envíos siguen en `generacion/comprobaciones.ts`, porque no son estados
 * del sujeto y no se pueden mostrar en un panel antes de pulsar. Ninguna de ellas está duplicada aquí.
 */

type Regla = (h: Hechos) => Freno | null;

/** Mensaje de credencial por motivo, tal como se le dice al usuario desde 0.10.0. */
const CREDENCIAL: Record<NonNullable<HechosCredencial["motivo"]>, (nombre: string) => [string, string]> = {
  boveda: () => [
    "Esta instalación aún no admite credenciales.",
    "Pídeselo a quien la administra: sin bóveda no se puede guardar ninguna clave.",
  ],
  "sin-credencial": (nombre) => [`No tienes ninguna clave de ${nombre} guardada.`, "Añádela en «Tu cuenta»."],
  invalida: (nombre) => [
    `Tu clave de ${nombre} está marcada como no válida.`,
    "Pruébala o sustitúyela en «Tu cuenta».",
  ],
  ilegible: () => [
    "La clave guardada no se puede leer en esta instalación.",
    "Bórrala y vuelve a guardarla en «Tu cuenta».",
  ],
};

const etiquetaDeVista = (clave: string): string => (esVista(clave) ? ETIQUETA_VISTA[clave] : clave);

const lista = (partes: readonly string[]): string => partes.join(", ");

/**
 * Reglas del motor, en orden de precedencia. Cada una devuelve `null` si no tiene nada que decir.
 *
 * Las que devuelven `bloqueado` son exactamente las que ya bloqueaban en 0.10.0–0.17.0: se han **movido**
 * aquí, no relajado. Cambiar una de ellas a aviso salvable es abrir una puerta de dinero o de consentimiento,
 * así que no se hace sin decisión expresa del propietario.
 */
const REGLAS: readonly Regla[] = [
  // ── Credencial: sin clave utilizable no se encola nada, porque nadie podría pagarlo ──────────────────
  (h) =>
    h.credencial && !h.credencial.proveedorAdmitido
      ? {
          regla: "credencial-sin-soporte",
          estado: "bloqueado",
          motivo: `Esta instalación aún no puede pagar trabajos en ${h.credencial.nombreProveedor}.`,
          accion: "Elige un modelo de otro proveedor.",
          http: 503,
          excepcion: "generacion",
        }
      : null,
  (h) => {
    if (!h.credencial || h.credencial.motivo === null) return null;
    const [motivo, accion] = CREDENCIAL[h.credencial.motivo](h.credencial.nombreProveedor);
    return {
      regla: "credencial",
      estado: "bloqueado",
      motivo,
      accion,
      enlace: "/cuenta",
      http: 409,
      excepcion: "generacion",
    };
  },

  // ── Consentimiento y mínimo de referencias: la puerta de 0.13.0, intacta ─────────────────────────────
  (h) =>
    h.personaje && h.personaje.impedimentos.length > 0
      ? {
          regla: "consentimiento",
          estado: "bloqueado",
          motivo: `«${h.personaje.nombre}» no se puede usar para generar todavía. ${h.personaje.impedimentos.join(" ")}`,
          accion: "Arréglalo en la ficha del personaje y vuelve a intentarlo.",
          enlace: "/personajes",
          http: 409,
          excepcion: "personaje",
        }
      : null,
  (h) =>
    h.personaje && h.modelo && h.modelo.maximoReferencias < 1
      ? {
          regla: "modelo-sin-referencias",
          estado: "bloqueado",
          motivo: `El modelo ${h.modelo.nombre} no acepta fotos de referencia, así que no se puede usar con un personaje.`,
          accion: "Elige otro modelo.",
          http: 400,
          excepcion: "personaje",
        }
      : null,

  // ── Identidad hablada registrada: sin registro, la escena no puede salir con esa cara ni esa voz ────
  (h) =>
    h.omni && !h.omni.registrado
      ? {
          regla: "omni-sin-registro",
          estado: "bloqueado",
          motivo: `Este proyecto genera sus escenas con la cara y la voz registradas de su protagonista, y ${h.omni.falta}`,
          accion: "Regístralo antes de producir: registrar la voz y el personaje no cuesta créditos.",
          enlace: "/personajes",
          http: 409,
          excepcion: "personaje",
        }
      : null,

  // ── Aprobación del plan: sin plan aprobado no se produce ninguna escena (0.17.0) ─────────────────────
  (h) =>
    h.escena && !h.escena.planAprobado
      ? {
          regla: "plan-sin-aprobar",
          estado: "bloqueado",
          motivo: "Este proyecto no tiene el plan aprobado.",
          accion: "Apruébalo antes de producir sus escenas.",
          http: 409,
          excepcion: "proyecto",
        }
      : null,

  // ── Revisión de continuidad: no se exporta un proyecto con un fallo crítico abierto (RF07, 0.20.0) ───
  (h) => {
    const criticos = h.exportacion?.criticos ?? [];
    if (criticos.length === 0) return null;
    const escenas = criticos.map((c) => c.orden).join(", ");
    return {
      regla: "revision-critica-abierta",
      estado: "bloqueado",
      motivo:
        criticos.length === 1
          ? `La escena ${escenas} tiene un fallo crítico abierto en su revisión: ${criticos[0]?.motivo ?? ""}`
          : `${criticos.length} escenas tienen un fallo crítico abierto en su revisión (${escenas}).`,
      accion: "Resuélvelo en la revisión del proyecto: regenera esas escenas o acepta el fallo expresamente.",
      enlace: "/proyectos",
      http: 409,
      excepcion: "proyecto",
    };
  },

  // ── Espacio: guardar el resultado no puede quedarse sin sitio después de pagarlo ─────────────────────
  (h) => {
    if (!h.cuota) return null;
    const { previstoBytes, libresBytes } = h.cuota;
    if (libresBytes === null || previstoBytes <= libresBytes) return null;
    return {
      regla: "cuota",
      estado: "bloqueado",
      motivo: `Necesitas ${formatearTamano(previstoBytes)} libres en la biblioteca para guardar el resultado y te quedan ${formatearTamano(Math.max(0, libresBytes))}.`,
      accion: "Vacía la papelera o borra archivos antes de generar.",
      enlace: "/biblioteca",
      http: 413,
      excepcion: "generacion",
    };
  },

  // ── Dinero: los tres techos que existen, cada uno con su motivo ──────────────────────────────────────
  (h) =>
    h.credencial?.saldo != null && h.presupuesto && h.credencial.saldo < h.presupuesto.creditos
      ? {
          regla: "saldo",
          estado: "bloqueado",
          motivo: `Tu cuenta de ${h.credencial.nombreProveedor} tiene ${h.credencial.saldo} créditos y este trabajo necesita ${h.presupuesto.creditos}.`,
          accion: "Recarga créditos en el proveedor.",
          http: 402,
          excepcion: "generacion",
        }
      : null,
  (h) =>
    h.presupuesto?.topeTrabajo != null && h.presupuesto.creditos > h.presupuesto.topeTrabajo
      ? {
          regla: "tope-trabajo",
          estado: "bloqueado",
          motivo: `Este trabajo necesita ${formatearCreditos(h.presupuesto.creditos)} y el tope por trabajo de esta instalación es de ${formatearCreditos(h.presupuesto.topeTrabajo)}.`,
          accion: "Pídele a quien administra que lo suba, o elige un modelo más barato.",
          http: 402,
          excepcion: "generacion",
        }
      : null,
  (h) => {
    const p = h.presupuesto;
    if (!p || p.disponibleUsuario === null || p.creditos <= p.disponibleUsuario) return null;
    const datos = {
      disponible: p.disponibleUsuario,
      creditos: p.creditos,
      retenido: p.retenidoUsuario,
      trabajosEnRevision: p.trabajosEnRevision,
      llamadasDeTextoColgadas: p.llamadasDeTextoColgadas,
      revisionesColgadas: p.revisionesColgadas,
    };
    return {
      regla: "presupuesto-usuario",
      estado: "bloqueado",
      // El mismo texto que lanza la reserva dentro de la transacción (`presupuesto/mensajes.ts`).
      motivo: motivoSinPresupuesto(datos),
      accion: accionSinPresupuesto(datos),
      http: 402,
      excepcion: "generacion",
    };
  },
  (h) => {
    if (!h.presupuesto) return null;
    const { autorizadoProyecto, comprometidoProyecto, creditos } = h.presupuesto;
    if (autorizadoProyecto === null || comprometidoProyecto + creditos <= autorizadoProyecto) return null;
    return {
      regla: "presupuesto-proyecto",
      estado: "bloqueado",
      motivo: `Este proyecto tiene ${formatearCreditos(autorizadoProyecto)} autorizados y lleva ${formatearCreditos(Math.round(comprometidoProyecto))} comprometidos, así que no caben los ${formatearCreditos(creditos)} de esto.`,
      accion: "Sube el presupuesto del proyecto o quita escenas.",
      http: 402,
      excepcion: "proyecto",
    };
  },

  // ── Requiere revisión: hace falta que el usuario aporte algo ─────────────────────────────────────────
  (h) =>
    h.escena && !h.escena.aprobada
      ? {
          regla: "escena-sin-aprobar",
          estado: "revision",
          motivo:
            h.escena.motivoInvalidacion !== ""
              ? h.escena.motivoInvalidacion
              : "Esta escena no está aprobada en el plan.",
          accion: "Apruébala en el plan antes de producirla.",
          http: 409,
          excepcion: "proyecto",
        }
      : null,
  (h) =>
    h.escena?.precioCambiado
      ? {
          regla: "aprobacion-precio",
          estado: "revision",
          motivo: "El precio del modelo ha cambiado desde que aprobaste el plan.",
          accion: "Revísalo y vuelve a aprobarlo.",
          http: 409,
          excepcion: "proyecto",
        }
      : null,
  (h) =>
    h.escena?.fichaCambiada
      ? {
          regla: "aprobacion-ficha",
          estado: "revision",
          motivo: "La ficha del personaje ha cambiado desde que aprobaste el plan.",
          accion: "Revisa lo que se enviará y vuelve a aprobarlo.",
          http: 409,
          excepcion: "proyecto",
        }
      : null,
  (h) =>
    h.escena?.plantillaCambiada
      ? {
          regla: "aprobacion-plantilla",
          estado: "revision",
          motivo: "La plantilla de prompt ha cambiado desde que aprobaste el plan.",
          accion: "Revisa el coste y vuelve a aprobarlo.",
          http: 409,
          excepcion: "proyecto",
        }
      : null,
  (h) => {
    const cuantas = h.escena?.afirmacionesPorVerificar ?? 0;
    if (cuantas === 0) return null;
    return {
      regla: "afirmaciones-sin-verificar",
      estado: "revision",
      motivo:
        cuantas === 1
          ? "Esta escena tiene una afirmación sin verificar."
          : `Esta escena tiene ${cuantas} afirmaciones sin verificar.`,
      accion: "Verifícala con su fuente, corrígela o descártala antes de producirla.",
      http: 409,
      excepcion: "proyecto",
    };
  },

  // ── Necesita ajustes: salvable confirmándolo expresamente ────────────────────────────────────────────
  (h) => {
    if (!h.parametros.exigirCoberturaVistas || !h.personaje) return null;
    const { referenciasSenaladas } = h.personaje;
    const vistasSinCubrir = h.personaje.completaCobertura ? [] : h.personaje.vistasSinCubrir;
    if (vistasSinCubrir.length === 0 && referenciasSenaladas === 0) return null;
    const partes: string[] = [];
    if (vistasSinCubrir.length > 0) {
      partes.push(`faltan fotos de ${lista(vistasSinCubrir.map(etiquetaDeVista))}`);
    }
    if (referenciasSenaladas > 0) {
      partes.push(
        referenciasSenaladas === 1
          ? "una de sus fotos la señaló el control de calidad"
          : `${referenciasSenaladas} de sus fotos las señaló el control de calidad`,
      );
    }
    return {
      regla: "referencias-cobertura",
      estado: "ajustes",
      motivo: `Las referencias de «${h.personaje.nombre}» no cubren todas las vistas recomendadas: ${lista(partes)}.`,
      accion: "Añade las fotos que faltan en su ficha, o confirma que quieres generar con las que hay.",
      enlace: "/personajes",
      http: 409,
      excepcion: "personaje",
      confirmable: true,
    };
  },
  /**
   * Guion escrito en una escena de **voz en off** (0.25.0): el clip saldrá mudo y esa frase no se le envía al
   * modelo. Es confirmable y no un freno —montar la narración encima es legítimo—, pero se confirma porque es
   * dinero: pagar un clip sin la voz que uno escribió, sin que nadie lo diga, es lo que prohíbe la norma de
   * errores visibles con causa.
   */
  (h) => {
    if (!h.escena?.guionEnClipMudo) return null;
    return {
      regla: "guion-en-clip-mudo",
      estado: "ajustes",
      motivo:
        "Esta escena es de voz en off, así que el clip saldrá mudo: el personaje no dirá el guion que has escrito y esa frase no se le envía al modelo.",
      accion:
        "Cambia el formato a «UGC a cámara» si quieres que lo diga, o confirma que el guion es para montar la narración encima.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  /**
   * **Avisos del producto** (0.26.0). Los tres son salvables y ninguno bloquea: el usuario decide si le
   * compensa. Lo que no se puede hacer es cobrarle sin decírselo, que es la norma de errores visibles.
   */
  (h) => {
    if (!h.producto?.identidadRegistradaPerdida) return null;
    return {
      regla: "producto-sin-identidad-registrada",
      estado: "ajustes",
      motivo: `Para que «${h.producto.nombre}» salga con su etiqueta hay que enviarle sus fotos al modelo, y eso es incompatible con la identidad que tienes registrada en el proveedor: esta escena se generará con las fotos del personaje en lugar de con su identidad registrada, así que su cara y su voz pueden variar respecto a las demás escenas.`,
      accion:
        "Si necesitas que la cara sea idéntica entre escenas, quita el producto de esta escena y haz un plano del producto solo para montarlo aparte. Si prefieres el producto aquí, confírmalo.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  (h) => {
    if (!h.producto?.referenciasNoCaben) return null;
    return {
      regla: "producto-referencias-no-caben",
      estado: "ajustes",
      motivo: `${h.modelo?.nombre ?? "Este modelo"} admite ${h.modelo?.maximoReferencias ?? 1} ${(h.modelo?.maximoReferencias ?? 1) === 1 ? "imagen de referencia" : "imágenes de referencia"}, y entre el personaje y «${h.producto.nombre}» hay más: algunas se quedan fuera. Se envían primero la identidad del personaje y la foto frontal del producto, así que lo que sobra puede salir distinto.`,
      accion:
        "Elige un modelo que admita más referencias, o quita fotos del producto dejando la frontal con la etiqueta. Si te vale así, confírmalo.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  /**
   * **El modelo elegido no admite la foto del producto** (decisión firme del propietario, 2026-09-28). Nunca
   * se cambia de modelo por su cuenta: cambiar de modelo cambia la tarifa, y lo que se paga lo decide el
   * usuario. Se avisa, se dice cuáles sí la llevan y él elige.
   */
  (h) => {
    if (!h.producto?.sinHuecoDeReferencia) return null;
    const sugeridos = h.producto.modelosConFoto;
    return {
      regla: "producto-sin-hueco-de-referencia",
      estado: "ajustes",
      motivo: `${h.modelo?.nombre ?? "Este modelo"} no admite la foto de «${h.producto.nombre}» como referencia, así que el producto viajará solo descrito con palabras y su etiqueta puede salir distinta.`,
      accion:
        sugeridos.length > 0
          ? `Cambia el modelo a uno que sí lleve la foto del producto (${sugeridos.join(", ")}) y vuelve a estimar el coste, porque la tarifa es otra. No se cambia solo por eso. Si te vale con la descripción, confírmalo.`
          : "Hoy no hay ningún otro modelo disponible que acepte la foto del producto. Si te vale con la descripción, confírmalo.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  /**
   * **Acción poco fiable**: las de piel salen mal a menudo con los modelos de hoy. No se prohíben —el usuario
   * decide en qué gasta—, pero se dice antes de cobrar y no después.
   */
  (h) => {
    if (!h.producto?.pocoFiable) return null;
    return {
      regla: "producto-accion-poco-fiable",
      estado: "ajustes",
      motivo: `«${h.producto.nombreAccion}» es de las acciones que peor salen hoy: abrir un envase, extender un producto sobre la piel o seguir una mano moviéndose falla a menudo, y el resultado puede no servirte.`,
      accion:
        "Añade la foto del mecanismo y la del frontal para darle todo lo que se puede, cuenta con repetirlo, o elige una acción más sencilla. Si quieres probarlo igualmente, confírmalo.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  (h) => {
    if (!h.producto?.sinFotos) return null;
    return {
      regla: "producto-sin-fotos",
      estado: "ajustes",
      motivo: `«${h.producto.nombre}» no tiene ninguna foto de referencia que enviar, así que el modelo no sabe qué aspecto tiene: se le pedirá un envase sin marca y el resultado no será tu producto.`,
      accion: "Añade al menos la foto frontal con la etiqueta en la ficha del producto, o confirma que te vale así.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  /**
   * Marcas ajenas. No hay detección propia de marcas y no la va a haber: lo que hay es el aviso de que el
   * filtro del proveedor puede rechazarlo —un rechazo suyo **no cobra**, porque prueba que no llegó a crear
   * ninguna tarea— y la declaración expresa de que el uso está autorizado, que es lo que el usuario confirma.
   */
  (h) => {
    if (!h.producto?.marcaVisible) return null;
    return {
      regla: "producto-con-marca",
      estado: "ajustes",
      motivo: `Has declarado que en «${h.producto.nombre}» se ve una marca. El filtro del proveedor puede rechazar un logo de marca, y en ese caso no se genera nada, no se te cobra y se te dice el motivo.`,
      accion:
        "Confirma que tienes autorización para usar esa marca y que aceptas que el proveedor pueda rechazar el envío.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  (h) => {
    if (!h.parametros.exigirPrecioFresco || !h.modelo?.precioCaducado) return null;
    const fecha = h.modelo.precioComprobado === "" ? "nunca" : `el ${formatearFecha(h.modelo.precioComprobado)}`;
    return {
      regla: "precio-antiguo",
      estado: "ajustes",
      motivo: `El precio de ${h.modelo.nombre} se comprobó ${fecha}, hace más de ${DIAS_PRECIO_FRESCO} días, así que la estimación puede haberse quedado corta.`,
      accion: "Pídele a quien administra que lo vuelva a comprobar, o confirma que aceptas la estimación tal cual.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  (h) =>
    !h.modelo || h.modelo.costeAcotado
      ? null
      : {
          regla: "coste-no-acotable",
          estado: "ajustes",
          motivo: h.modelo.motivoSinAcotar,
          accion: "El trabajo quedará esperando a que fijes cuántos créditos autorizas como máximo.",
          http: 409,
          excepcion: "generacion",
          // No cierra ninguna puerta: el propio `esperando_limite` de 0.12.0 es la acción de este aviso.
          gatea: false,
        },
];

const resolver = (freno: Freno): FrenoResuelto => ({
  enlace: freno.enlace ?? null,
  // Solo un aviso puede ser salvable: marcar como confirmable un `revision` o un `bloqueado` sería abrir una
  // puerta que la fase cierra a propósito, así que aquí se corrige en lugar de confiar en quien declaró la regla.
  confirmable: freno.estado === "ajustes" && freno.confirmable === true,
  // Y lo mismo con `gatea`: **solo un aviso puede no cerrar puerta**. Un `bloqueado` o un `revision` declarados
  // con `gatea: false` serían un freno que no frena, es decir, un pase gratis escrito por descuido. Se fuerza a
  // `true` fuera de `ajustes` en lugar de confiar en quien escriba la regla siguiente.
  gatea: freno.estado !== "ajustes" || freno.gatea !== false,
  regla: freno.regla,
  estado: freno.estado,
  motivo: freno.motivo,
  accion: freno.accion,
  http: freno.http,
  excepcion: freno.excepcion,
});

/**
 * Evalúa los hechos y devuelve el estado global con todos los frenos que han saltado (no solo el primero: el
 * panel tiene que poder enumerar **todo** lo que falta, no obligar a arreglarlo de uno en uno).
 *
 * El estado global es el peor de los frenos que **cierran puerta**; los que solo informan no lo empeoran por
 * debajo de su propio estado, pero tampoco pueden dejar el conjunto en `listo` si hay algo que decir.
 */
export function evaluar(hechos: Hechos): Evaluacion {
  const frenos = REGLAS.map((regla) => regla(hechos))
    .filter((f): f is Freno => f !== null)
    .map(resolver);
  return { estado: peorEstado(frenos.map((f) => f.estado)), reglasVersion: REGLAS_VERSION, frenos };
}

/** Frenos que cierran la puerta del encolado y no se pueden salvar confirmándolos. */
export const frenosQueGatean = (evaluacion: Evaluacion): FrenoResuelto[] =>
  evaluacion.frenos.filter((f) => f.gatea && !f.confirmable);

/** Avisos salvables que el usuario tiene que confirmar para poder generar. */
export const avisosSalvables = (evaluacion: Evaluacion): FrenoResuelto[] =>
  evaluacion.frenos.filter((f) => f.confirmable && f.gatea);

/** Estado global de una evaluación tal como se muestra en un listado (el plan del proyecto). */
export const estadoDe = (evaluacion: Evaluacion): EstadoControl => evaluacion.estado;
