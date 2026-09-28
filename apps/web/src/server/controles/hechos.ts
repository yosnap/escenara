import { esProveedor, PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { calcularCobertura, esVista, type Vista } from "@/lib/captura-personaje";
import { precioCaducado } from "@/lib/catalogo";
import { TIPO_RESULTADO, type TipoTrabajoCola } from "@/lib/generacion";
import { leerAjustes } from "../ajustes";
import { usarCredencialValida } from "../boveda/credenciales";
import type { FilaPersonaje } from "../db/esquema";
import { saldoDelUsuario } from "../generacion/estimacion";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { type Actor, espacioUsado, limiteSubida } from "../media/servicio";
import { referenciasVigentesDe } from "../personajes/consulta";
import { personajePorId } from "../personajes/contexto";
import { motivosParaNoGenerar } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import { comprometidoDe, topesDe } from "../presupuesto/deposito";
import type { Buscador } from "../proveedores/codigos";
import { criticosAbiertosDeProyecto } from "../revision/resultados";
import type {
  Hechos,
  HechosCredencial,
  HechosCuota,
  HechosEscena,
  HechosExportacion,
  HechosModelo,
  HechosOmni,
  HechosPersonaje,
  HechosProducto,
  ParametrosControles,
} from "./contrato";

/**
 * Recopila los **hechos** que evalúa el motor (`motor.ts`). Aquí está todo el acceso a datos y ninguna regla:
 * así el motor se puede probar sin PostgreSQL y la misma evaluación vale para el panel y para la puerta.
 *
 * Todo lo que se hace aquí es **lectura**: ninguna función de este fichero apunta un movimiento de
 * presupuesto, encola nada ni llama a un endpoint de pago del proveedor. La única llamada de red posible es la
 * del **saldo** (el mismo endpoint gratuito que ya usa la estimación, con su caché de 30 s), y un fallo suyo
 * deja el saldo en `null`, que no bloquea.
 */

export async function parametrosDeControles(): Promise<ParametrosControles> {
  const ajustes = await leerAjustes();
  return {
    exigirCoberturaVistas: ajustes.controlesExigirCoberturaVistas,
    exigirPrecioFresco: ajustes.controlesExigirPrecioFresco,
    maximoAvisos: ajustes.controlesMaximoAvisos,
  };
}

/** Estado de la credencial del usuario y su saldo en el proveedor del modelo elegido. */
export async function hechosDeCredencial(
  usuarioId: string,
  eleccion: EleccionDeTrabajo,
  buscar: Buscador,
): Promise<HechosCredencial> {
  const { proveedor, nombreProveedor } = eleccion.modelo;
  if (!esProveedor(proveedor)) {
    return { nombreProveedor, proveedorAdmitido: false, motivo: null, saldo: null };
  }
  const nombre = PROVEEDORES_PUBLICOS[proveedor].nombre;
  const credencial = await usarCredencialValida(usuarioId, proveedor);
  if (!credencial.ok) {
    return { nombreProveedor: nombre, proveedorAdmitido: true, motivo: credencial.motivo, saldo: null };
  }
  // Solo se pregunta el saldo cuando hay clave utilizable: sin clave no hay nada que preguntar. La comparación
  // con lo que cuesta el trabajo la hace el motor, que es quien decide.
  return {
    nombreProveedor: nombre,
    proveedorAdmitido: true,
    motivo: null,
    saldo: await saldoDelUsuario(usuarioId, buscar, proveedor),
  };
}

/** Modelo elegido y su precio, con la acotación del coste ya resuelta. */
export function hechosDeModelo(tipo: TipoTrabajoCola, eleccion: EleccionDeTrabajo): HechosModelo {
  const acotacion = acotarCoste(tipo, eleccion);
  return {
    nombre: eleccion.modelo.nombre,
    maximoReferencias: eleccion.modelo.parametros.maximoReferencias,
    precioComprobado: eleccion.precio.comprobado,
    precioCaducado: precioCaducado(eleccion.precio.comprobado),
    costeAcotado: acotacion.acotado,
    motivoSinAcotar: acotacion.acotado ? "" : acotacion.motivo,
  };
}

/**
 * Impedimentos duros del personaje y calidad de sus referencias. Los impedimentos salen de la **misma**
 * función que usa la ficha y que revalida el despacho (`personajes/puede-generar.ts`), así que el motivo que
 * se muestra en el panel es exactamente el que se muestra en el personaje.
 */
export async function hechosDePersonaje(personaje: FilaPersonaje, primerRetrato = false): Promise<HechosPersonaje> {
  // **Solo las vigentes**: una referencia cuyo medio está en la papelera no se envía a ningún proveedor, así que
  // no puede cubrir una vista ni dejar de señalarse por calidad.
  const [impedimentos, referencias] = await Promise.all([
    // El primer retrato de un personaje inventado es lo que le da sus referencias: no se le exigen antes.
    motivosParaNoGenerar(personaje.id, primerRetrato ? 0 : undefined),
    referenciasVigentesDe(personaje.id),
  ]);
  const cobertura = calcularCobertura(
    personaje.kind,
    referencias.map((r) => ({ vistaClave: esVista(r.viewKey) ? r.viewKey : null, origen: r.origin })),
    personaje.virtual,
  );
  return {
    nombre: personaje.name,
    impedimentos,
    vistasSinCubrir: [...cobertura.faltan],
    referenciasSenaladas: referencias.filter((r) => (r.rejectionReason ?? "") !== "").length,
  };
}

/** Espacio libre en la biblioteca frente al peor caso del tipo de resultado. */
export async function hechosDeCuota(actor: Actor, tipo: TipoTrabajoCola): Promise<HechosCuota> {
  const { usadoBytes, cuotaBytes } = await espacioUsado(actor);
  return {
    previstoBytes: limiteSubida(TIPO_RESULTADO[tipo]),
    libresBytes: cuotaBytes === null ? null : cuotaBytes - usadoBytes,
  };
}

/** Los tres techos del dinero: tope por trabajo, presupuesto del usuario y presupuesto del proyecto. */
export async function hechosDePresupuesto(
  usuarioId: string,
  creditos: number,
  proyecto: { autorizado: number | null; comprometido: number } | null,
): Promise<Hechos["presupuesto"]> {
  const ajustes = await leerAjustes();
  const { autorizado, topeTrabajo } = topesDe(ajustes);
  const comprometido = autorizado === null ? null : await comprometidoDe(usuarioId);
  return {
    creditos,
    topeTrabajo,
    disponibleUsuario:
      autorizado === null || comprometido === null
        ? null
        : autorizado - comprometido.reservado - comprometido.consumido,
    retenidoUsuario: comprometido?.retenido ?? 0,
    trabajosEnRevision: comprometido?.trabajosEnRevision ?? 0,
    llamadasDeTextoColgadas: comprometido?.llamadasDeTextoColgadas ?? 0,
    revisionesColgadas: comprometido?.revisionesColgadas ?? 0,
    autorizadoProyecto:
      proyecto && proyecto.autorizado !== null && proyecto.autorizado > 0 ? proyecto.autorizado : null,
    comprometidoProyecto: proyecto?.comprometido ?? 0,
  };
}

/** Techo de un proyecto, tal como lo resuelve quien llama (`asistente/plan.ts › techoDelProyecto`). */
export interface TechoDeProyecto {
  autorizado: number | null;
  comprometido: number;
}

/**
 * Personaje que el trabajo cita pero cuya ficha ya no está. Pasa si se borra entre que se resuelve el trabajo y
 * que se evalúa, y **tiene que bloquear**: `motivosParaNoGenerar` no encuentra consentimiento ni referencias, así
 * que devuelve sus impedimentos. Dejarlo en «sin personaje» sería saltarse la puerta del consentimiento por un
 * borrado a medias.
 */
export async function hechosDePersonajeCitado(personajeId: string, primerRetrato = false): Promise<HechosPersonaje> {
  const personaje = await personajePorId(personajeId);
  return personaje ? hechosDePersonaje(personaje, primerRetrato) : hechosDePersonajeAusente(personajeId);
}

async function hechosDePersonajeAusente(personajeId: string): Promise<HechosPersonaje> {
  return {
    nombre: "El personaje de esa imagen",
    impedimentos: await motivosParaNoGenerar(personajeId),
    vistasSinCubrir: [],
    referenciasSenaladas: 0,
  };
}

export interface SujetoDeHechos {
  tipo: TipoTrabajoCola;
  eleccion: EleccionDeTrabajo;
  /** Créditos totales del envío: la generación más su traducción, si esta instalación traduce. */
  creditos: number;
  /** Personaje del envío, elegido o heredado; `null` si el envío no lleva ninguno. */
  personajeId: string | null;
  /** Su ficha, si sigue existiendo. Con `personajeId` y sin ficha, el motor bloquea. */
  personaje: FilaPersonaje | null;
  /** Hechos de la escena del plan que se produce; `null` fuera de un proyecto. */
  escena: HechosEscena | null;
  /** Techo del proyecto al que pertenece; `null` si no pertenece a ninguno o no tiene techo. */
  proyecto: TechoDeProyecto | null;
  /** Identidad hablada registrada (0.22.0); ausente fuera del modo `omni`. */
  omni?: HechosOmni;
  /** Producto que se presenta (0.26.0); ausente cuando el envío no lleva ninguno. */
  producto?: HechosProducto;
  /**
   * Este envío es el **primer retrato** de un personaje inventado (0.22.0), es decir, lo que va a crear su
   * primera referencia. Con él no se le exigen las fotos que todavía no tiene; todo lo demás se evalúa igual.
   */
  primerRetrato?: boolean;
}

/**
 * Todos los hechos de un envío, listos para el motor. **Es el único sitio donde se reúnen**, y lo usan las dos
 * orillas: la puerta del encolado y la lectura que pinta el panel «Antes de generar». Así el panel no puede
 * decir «listo» por mirar cosas distintas de las que mira la puerta.
 */
export async function recopilarHechos(actor: Actor, sujeto: SujetoDeHechos, buscar: Buscador): Promise<Hechos> {
  const [parametros, credencial, personaje, cuota, presupuesto] = await Promise.all([
    parametrosDeControles(),
    hechosDeCredencial(actor.id, sujeto.eleccion, buscar),
    sujeto.personaje
      ? hechosDePersonaje(sujeto.personaje, sujeto.primerRetrato ?? false)
      : sujeto.personajeId
        ? hechosDePersonajeCitado(sujeto.personajeId)
        : null,
    hechosDeCuota(actor, sujeto.tipo),
    hechosDePresupuesto(actor.id, sujeto.creditos, sujeto.proyecto),
  ]);
  return {
    tipo: sujeto.tipo,
    parametros,
    credencial,
    modelo: hechosDeModelo(sujeto.tipo, sujeto.eleccion),
    personaje,
    cuota,
    presupuesto,
    escena: sujeto.escena,
    ...(sujeto.omni ? { omni: sujeto.omni } : {}),
    ...(sujeto.producto ? { producto: sujeto.producto } : {}),
  };
}

/**
 * Hechos de la revisión de continuidad del proyecto que se va a **exportar** (RF07, 0.20.0): sus escenas con un
 * fallo crítico abierto. Es lectura, y sale del mismo sitio que lo que enumera la pantalla de revisión.
 */
export async function hechosDeExportacion(proyectoId: string): Promise<HechosExportacion> {
  return { criticos: await criticosAbiertosDeProyecto(proyectoId) };
}

/**
 * Generar una vista que le falta al personaje **es** completar su cobertura: el aviso de que faltan vistas no
 * puede frenar justo lo que la arregla (ni pedir confirmar algo que el diálogo de la vista no ofrece). Se marca
 * en los hechos y el motor deja de contar las vistas sin cubrir; lo demás del personaje se evalúa igual.
 */
export function conVistaQueCompleta(hechos: Hechos, vista: Vista | null | undefined): Hechos {
  if (!vista || !hechos.personaje) return hechos;
  return { ...hechos, personaje: { ...hechos.personaje, completaCobertura: true } };
}
