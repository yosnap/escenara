import type { EvaluacionVista } from "@/lib/controles";
import { type FormatoMontaje, RESOLUCION_MONTAJE } from "@/lib/formatos";
import { BLOQUEAN_APROBACION } from "@/lib/proyectos";
import { afirmacionesDe } from "../asistente/consulta";
import type { Hechos } from "../controles/contrato";
import { parametrosDeControles } from "../controles/hechos";
import { evaluarParaMostrar, exigirFrenosDuros } from "../controles/puerta";
import type { FilaMontaje } from "../db/esquema";
import { type Actor, espacioUsado } from "../media/servicio";
import { criticosAbiertosDeProyecto } from "../revision/resultados";
import type { MaterialDelProyecto } from "./material";

/**
 * **La puerta del render** (RF12, RF07 y RF08): el único sitio por el que se pasa de «se puede exportar» a «se
 * encola la exportación».
 *
 * Aplica las reglas del **motor de controles** (0.18.0) y no una copia suya, así que el panel de la pantalla y
 * esta puerta no pueden decir cosas distintas. Lo que bloquea aquí:
 *
 * - un **fallo crítico abierto** en la revisión de continuidad (regla de 0.20.0, intacta);
 * - una **escena del montaje sin clip** y un montaje **vacío** (reglas nuevas de esta versión);
 * - **espacio** en la biblioteca para el MP4 resultante.
 *
 * Lo que **no** hay aquí: credencial, saldo, presupuesto ni sello de precio. Montar un vídeo no llama a ningún
 * proveedor y no cuesta créditos, así que exigir esos grupos sería pedir permisos para un gasto que no existe.
 */

/**
 * Bytes que se apartan para el MP4 resultante. Se estima por duración: un vertical de 1080 × 1920 a 30 fps con
 * el ajuste de calidad de esta versión sale por unos 2 MB/s medidos, y se pide **el doble** porque quedarse sin
 * cuota justo al guardar significaría haber montado el vídeo entero para nada.
 */
const BYTES_POR_SEGUNDO_PREVISTOS = 4 * 1024 * 1024;

/** Suelo de la previsión: un montaje muy corto sigue necesitando sitio para su contenedor. */
const BYTES_MINIMOS_PREVISTOS = 8 * 1024 * 1024;

export const bytesPrevistos = (segundos: number): number =>
  Math.max(BYTES_MINIMOS_PREVISTOS, Math.ceil(segundos * BYTES_POR_SEGUNDO_PREVISTOS));

/** Órdenes de las escenas del montaje que ya no tienen clip guardado. */
export function escenasSinClip(montaje: FilaMontaje, material: MaterialDelProyecto): number[] {
  const porId = new Map(material.escenas.map((e) => [e.escena.id, e]));
  const ordenes: number[] = [];
  for (const fragmento of montaje.fragments) {
    const escena = porId.get(fragmento.escenaId);
    // Un fragmento que apunta a una escena que ya no está cuenta como material que falta: es lo mismo desde el
    // punto de vista de quien exporta, y el orden que se muestra es el que tenía en la línea de tiempo.
    if (!escena) ordenes.push(montaje.fragments.indexOf(fragmento) + 1);
    else if (escena.duracionClip === null) ordenes.push(escena.escena.sortOrder);
  }
  return [...new Set(ordenes)];
}

/** Órdenes de las escenas del montaje con alguna afirmación de salud sin verificar. */
export async function escenasConSaludSinVerificar(
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<number[]> {
  const enElMontaje = new Set(montaje.fragments.map((f) => f.escenaId));
  const escenas = material.escenas.filter((e) => enElMontaje.has(e.escena.id));
  if (escenas.length === 0) return [];
  const pendientes = (await afirmacionesDe(escenas.map((e) => e.escena.id))).filter(
    (a) => a.state === "por_verificar" && BLOQUEAN_APROBACION.includes(a.kind),
  );
  const conPendientes = new Set(pendientes.map((a) => a.sceneId));
  return escenas.filter((e) => conPendientes.has(e.escena.id)).map((e) => e.escena.sortOrder);
}

/** Hechos del render, tal como los evalúa el motor. Es **lectura**: no aparta nada y no cuesta nada. */
export async function hechosDelMontaje(
  actor: Actor,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
  segundos: number,
): Promise<Hechos> {
  const [parametros, criticos, espacio, salud] = await Promise.all([
    parametrosDeControles(),
    criticosAbiertosDeProyecto(material.proyecto.id),
    espacioUsado(actor),
    escenasConSaludSinVerificar(montaje, material),
  ]);
  return {
    tipo: "montaje",
    parametros,
    exportacion: {
      criticos,
      fragmentos: montaje.fragments.length,
      escenasSinClip: escenasSinClip(montaje, material),
      afirmacionesSalud: salud,
    },
    cuota: {
      previstoBytes: bytesPrevistos(segundos),
      libresBytes: espacio.cuotaBytes === null ? null : espacio.cuotaBytes - espacio.usadoBytes,
    },
  };
}

/**
 * Cierra la puerta del render si algo lo impide, y guarda la evaluación. No admite confirmaciones: todo lo que
 * frena aquí es `bloqueado` y hay que arreglarlo.
 */
export async function exigirControlesDelMontaje(
  actor: Actor,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
  segundos: number,
): Promise<void> {
  const hechos = await hechosDelMontaje(actor, montaje, material, segundos);
  await exigirFrenosDuros({ usuarioId: actor.id, sujeto: "montaje", sujetoId: montaje.id, tipo: "montaje" }, hechos);
}

/** La misma evaluación, **sin cerrar nada ni guardar nada**: es lo que pinta el panel de exportación. */
export async function controlesDelMontajeParaMostrar(
  actor: Actor,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
  segundos: number,
): Promise<EvaluacionVista> {
  return evaluarParaMostrar(await hechosDelMontaje(actor, montaje, material, segundos));
}

/** Resolución de salida de un formato. Vive aquí para que la puerta y el render usen exactamente la misma. */
export const resolucionDe = (formato: FormatoMontaje) => RESOLUCION_MONTAJE[formato];
