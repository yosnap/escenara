import { and, eq, inArray, sql } from "drizzle-orm";
import { esProveedor, type Proveedor } from "@/lib/boveda";
import {
  type Capacidad,
  type EstadoModelo,
  EVIDENCIA_MINIMA,
  esCapacidad,
  esEstadoModelo,
  esSeleccionable,
  type ModeloVista,
} from "@/lib/catalogo";
import { ESTADOS_ACTIVOS } from "@/lib/generacion";
import { db } from "../db/cliente";
import { generationJobs, modelCatalogChanges, modelPrices, models } from "../db/esquema";
import { listarModelos, modeloPorId, olvidarCatalogo } from "./catalogo";
import { ErrorCatalogo } from "./contrato";

/**
 * Cambios del catálogo. **Solo el admin** los hace: quien llama a estas funciones ya ha comprobado el rol
 * en el servidor (`exigirAdmin`). Todo cambio queda en el historial con quién, cuándo, de qué a qué y con
 * qué evidencia.
 *
 * Un cambio de precio **no toca ningún trabajo ya creado**: los créditos estimados y los consumidos que se
 * guardaron son un hecho histórico. Lo que hace es subir la versión del precio, y con ella cambia el sello
 * que viaja en cada estimación: las estimaciones anteriores quedan caducadas y hay que volver a
 * confirmarlas antes de gastar.
 */

const MAXIMO_CREDITOS = 1_000_000;
const MAXIMO_TEXTO = 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface CambioPrecio {
  modeloId: string;
  creditos: number;
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó el precio. */
  comprobado: string;
}

export interface CambioEstado {
  modeloId: string;
  estado: EstadoModelo;
  /**
   * Obligatoria para `validado` (coste medido y ejemplo o informe) y recomendable al retirar o degradar:
   * el motivo queda en el historial.
   */
  evidencia: string;
}

export interface CambioPredeterminado {
  modeloId: string;
  /** Capacidad de la que pasa a ser la opción por defecto. */
  capacidad: Capacidad;
}

export interface ResultadoCambio {
  modelo: ModeloVista;
  /**
   * Trabajos de este modelo que siguen en marcha cuando se cambió el precio: sus estimaciones ya no valen
   * y quien las tenga en pantalla tendrá que volver a confirmarlas. Sus créditos no se tocan.
   */
  estimacionesAfectadas: number;
}

function exigirTexto(valor: unknown, campo: string, minimo = 1): string {
  const texto = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  if (texto.length < minimo) throw new ErrorCatalogo(400, `${campo} no puede quedar vacío.`);
  if (texto.length > MAXIMO_TEXTO)
    throw new ErrorCatalogo(400, `${campo} no puede pasar de ${MAXIMO_TEXTO} caracteres.`);
  return texto;
}

/** Texto libre opcional (motivo de una retirada, por ejemplo): se limpia y se acota, pero puede ir vacío. */
function textoOpcional(valor: unknown): string {
  const texto = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  return texto.slice(0, MAXIMO_TEXTO);
}

function exigirCreditos(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0 || valor > MAXIMO_CREDITOS) {
    throw new ErrorCatalogo(400, "Los créditos tienen que ser un número mayor que cero.");
  }
  // Dos decimales: los precios medidos llegan a la mitad de crédito (Seedream, 6,5).
  return Math.round(valor * 100) / 100;
}

function exigirFecha(valor: unknown): Date {
  if (typeof valor !== "string" || !FECHA.test(valor)) {
    throw new ErrorCatalogo(400, "La fecha de comprobación tiene que ser AAAA-MM-DD.");
  }
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new ErrorCatalogo(400, "Esa fecha no existe.");
  // Un precio no se puede haber comprobado mañana.
  if (fecha.getTime() > Date.now() + 86_400_000) throw new ErrorCatalogo(400, "Esa fecha está en el futuro.");
  return fecha;
}

/**
 * El registro de precios comparte enumeración con las credenciales: un trabajo se paga siempre con la
 * clave del usuario para ese proveedor. Un proveedor que solo está en el catálogo (el hueco de Google) no
 * tiene todavía dónde guardar precios.
 */
function proveedorConPrecios(slug: string): Proveedor {
  if (!esProveedor(slug)) {
    throw new ErrorCatalogo(409, `El proveedor ${slug} aún no admite credenciales, así que tampoco precios.`);
  }
  return slug;
}

/** Cuántos trabajos de este modelo siguen en marcha (sus estimaciones quedan caducadas). */
async function trabajosEnMarcha(modelo: string): Promise<number> {
  const [{ total } = { total: 0 }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(and(eq(generationJobs.model, modelo), inArray(generationJobs.state, [...ESTADOS_ACTIVOS])));
  return total;
}

/** Cambia el precio de un modelo con su fuente y su fecha, y sube la versión del precio. */
export async function cambiarPrecioDeModelo(cambio: CambioPrecio, autorId: string): Promise<ResultadoCambio> {
  const modelo = await modeloPorId(cambio.modeloId);
  const creditos = exigirCreditos(cambio.creditos);
  const fuente = exigirTexto(cambio.fuente, "La fuente del precio", 3);
  const comprobado = exigirFecha(cambio.comprobado);
  const proveedor = proveedorConPrecios(modelo.proveedor);
  const afectadas = await trabajosEnMarcha(modelo.modelo);
  const anterior = modelo.precio;

  await db().transaction(async (tx) => {
    const [fila] = await tx
      .select()
      .from(modelPrices)
      .where(
        and(
          eq(modelPrices.provider, proveedor),
          eq(modelPrices.model, modelo.modelo),
          eq(modelPrices.unit, modelo.unidad),
        ),
      )
      .limit(1);
    if (fila) {
      await tx
        .update(modelPrices)
        .set({
          credits: creditos,
          source: fuente,
          checkedAt: comprobado,
          version: fila.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(modelPrices.id, fila.id));
    } else {
      await tx.insert(modelPrices).values({
        provider: proveedor,
        model: modelo.modelo,
        unit: modelo.unidad,
        credits: creditos,
        source: fuente,
        checkedAt: comprobado,
      });
    }
    await tx
      .update(models)
      .set({ version: modelo.version + 1, updatedAt: new Date() })
      .where(eq(models.id, modelo.id));
    await tx.insert(modelCatalogChanges).values({
      modelId: modelo.id,
      field: "precio",
      fromValue: anterior
        ? `${anterior.creditos} créditos por ${anterior.unidad} (${anterior.comprobado})`
        : "sin precio",
      toValue: `${creditos} créditos por ${modelo.unidad} (${cambio.comprobado})`,
      evidence: fuente,
      changedBy: autorId,
    });
  });

  olvidarCatalogo();
  return { modelo: await modeloPorId(modelo.id), estimacionesAfectadas: afectadas };
}

/**
 * Cambia el estado de un modelo. `validado` exige evidencia escrita; retirar o degradar la acepta como
 * motivo y la guarda en el historial. **El modelo por defecto de una capacidad no se puede retirar sin
 * designar otro antes**: si no, «Crear» se quedaría sin opción predeterminada.
 */
export async function cambiarEstadoDeModelo(cambio: CambioEstado, autorId: string): Promise<ResultadoCambio> {
  const modelo = await modeloPorId(cambio.modeloId);
  if (!esEstadoModelo(cambio.estado)) throw new ErrorCatalogo(400, "Ese estado no existe.");
  const evidencia =
    cambio.estado === "validado"
      ? exigirTexto(cambio.evidencia, "La evidencia", EVIDENCIA_MINIMA)
      : textoOpcional(cambio.evidencia);
  if (cambio.estado === "validado" && modelo.precio === null) {
    throw new ErrorCatalogo(409, "No se puede validar un modelo sin precio medido: registra antes su precio.");
  }
  if (!esSeleccionable(cambio.estado) && modelo.predeterminado) {
    throw new ErrorCatalogo(
      409,
      `${modelo.nombre} es la opción por defecto de su capacidad: marca otro modelo como predeterminado antes de retirarlo.`,
    );
  }
  if (cambio.estado === modelo.estado) return { modelo, estimacionesAfectadas: 0 };

  await db().transaction(async (tx) => {
    await tx
      .update(models)
      .set({
        state: cambio.estado,
        // La evidencia de la validación se conserva; al salir de `validado` deja de ser vigente.
        evidence: cambio.estado === "validado" ? evidencia : modelo.evidencia,
        version: modelo.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(models.id, modelo.id));
    await tx.insert(modelCatalogChanges).values({
      modelId: modelo.id,
      field: "estado",
      fromValue: modelo.estado,
      toValue: cambio.estado,
      evidence: evidencia,
      changedBy: autorId,
    });
  });

  olvidarCatalogo();
  return { modelo: await modeloPorId(modelo.id), estimacionesAfectadas: 0 };
}

/**
 * Marca un modelo como opción por defecto de una capacidad, quitándosela al que la tuviera. Solo un modelo
 * elegible puede serlo: el predeterminado es lo que «Crear» ofrece sin que nadie elija nada.
 */
export async function marcarPredeterminado(cambio: CambioPredeterminado, autorId: string): Promise<ResultadoCambio> {
  const modelo = await modeloPorId(cambio.modeloId);
  if (!esCapacidad(cambio.capacidad)) throw new ErrorCatalogo(400, "Esa capacidad no existe.");
  if (!modelo.capacidades.includes(cambio.capacidad)) {
    throw new ErrorCatalogo(400, `${modelo.nombre} no sirve para esa capacidad.`);
  }
  if (!esSeleccionable(modelo.estado) || modelo.precio === null) {
    throw new ErrorCatalogo(409, `${modelo.nombre} no se puede usar todavía, así que no puede ser el predeterminado.`);
  }

  const anteriores = (await listarModelos({ capacidad: cambio.capacidad })).filter(
    (m) => m.predeterminado && m.id !== modelo.id,
  );
  await db().transaction(async (tx) => {
    for (const anterior of anteriores) {
      await tx
        .update(models)
        .set({ isDefault: false, version: anterior.version + 1, updatedAt: new Date() })
        .where(eq(models.id, anterior.id));
      await tx.insert(modelCatalogChanges).values({
        modelId: anterior.id,
        field: "predeterminado",
        fromValue: "por defecto",
        toValue: "no",
        evidence: `Sustituido por ${modelo.nombre} en ${cambio.capacidad}.`,
        changedBy: autorId,
      });
    }
    await tx
      .update(models)
      .set({ isDefault: true, version: modelo.version + 1, updatedAt: new Date() })
      .where(eq(models.id, modelo.id));
    await tx.insert(modelCatalogChanges).values({
      modelId: modelo.id,
      field: "predeterminado",
      fromValue: "no",
      toValue: "por defecto",
      evidence: `Opción por defecto de ${cambio.capacidad}.`,
      changedBy: autorId,
    });
  });

  olvidarCatalogo();
  return { modelo: await modeloPorId(modelo.id), estimacionesAfectadas: 0 };
}
