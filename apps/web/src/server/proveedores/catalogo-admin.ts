import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import {
  cargarCatalogo,
  listarModelos,
  modeloPorId,
  olvidarCatalogo,
  parametrosDeTexto,
  textoDeParametros,
} from "./catalogo";
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

export interface CambioVariante {
  modeloId: string;
  /** Unidad de la tarifa que pasa a usarse: tiene que ser una de las registradas de ese modelo. */
  unidad: string;
}

/**
 * Cambia **qué variante se envía** de un modelo cuyo proveedor cobra distinto según la resolución o la calidad
 * (0.23.0): GPT Image 2 cuesta 6 créditos a 1K y 16 a 4K, y es la misma llamada con un campo distinto.
 *
 * La unidad es la que une el modelo con su precio, así que cambiarla cambia a la vez lo que se cobra y lo que
 * se envía: los parámetros del modelo se rehacen con la resolución de la variante elegida. Sube la versión del
 * registro, con lo que las estimaciones que alguien tuviera en pantalla quedan caducadas y hay que volver a
 * confirmarlas antes de gastar. Los créditos ya consumidos no se tocan.
 *
 * Solo se puede elegir una variante **registrada**: una unidad inventada dejaría el modelo sin precio y no se
 * podría ni estimar.
 */
export async function cambiarVarianteDeModelo(cambio: CambioVariante, autorId: string): Promise<ResultadoCambio> {
  const modelo = await modeloPorId(cambio.modeloId);
  const unidad = exigirTexto(cambio.unidad, "La variante", 1);
  const tarifa = modelo.tarifas.find((t) => t.unidad === unidad);
  if (!tarifa) {
    throw new ErrorCatalogo(409, `${modelo.nombre} no tiene ninguna tarifa registrada para «${unidad}».`);
  }
  if (unidad === modelo.unidad) return { modelo, estimacionesAfectadas: 0 };
  const afectadas = await trabajosEnMarcha(modelo.modelo);
  // La resolución que se envía es la de la variante: es lo que se ha estimado y lo que se va a cobrar.
  const parametros = parametrosDeTexto(textoDeParametros(modelo.parametros));
  parametros.resoluciones = resolucionDeUnidad(unidad);

  await db().transaction(async (tx) => {
    await tx
      .update(models)
      .set({
        unit: unidad,
        parameters: textoDeParametros(parametros),
        version: modelo.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(models.id, modelo.id));
    await tx.insert(modelCatalogChanges).values({
      modelId: modelo.id,
      field: "variante",
      fromValue: `${modelo.precio ? modelo.precio.creditos : "sin precio"} por ${modelo.unidad}`,
      toValue: `${tarifa.creditos} por ${unidad}`,
      evidence: "Variante que se envía al proveedor, elegida entre las tarifas que publica.",
      changedBy: autorId,
    });
  });

  olvidarCatalogo();
  return { modelo: await modeloPorId(modelo.id), estimacionesAfectadas: afectadas };
}

/** Resolución que nombra una unidad de tarifa («imagen a 2K» → `["2K"]`); vacía si no nombra ninguna. */
function resolucionDeUnidad(unidad: string): string[] {
  const resolucion = /^imagen a (.+)$/.exec(unidad.trim())?.[1];
  return resolucion ? [resolucion] : [];
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

/**
 * Tolerancia al comparar lo publicado con lo cobrado. Medio crédito: los proveedores redondean, y avisar por
 * una décima sería ruido que acabaría tapando una desviación de verdad.
 */
const TOLERANCIA_DESVIACION = 0.5;

/**
 * Deja constancia de que el proveedor ha cobrado algo distinto de lo que publica (0.23.0).
 *
 * Solo aplica a un modelo cuyo precio sea **publicado**: cuando el precio está medido en esta instalación, la
 * diferencia ya la vigila el aviso de exceso del presupuesto, que es el que mira el techo autorizado. Aquí lo
 * que se comprueba es otra cosa: si la tarifa que el proveedor publica se corresponde con lo que cobra.
 *
 * **No cambia ningún precio ni ningún trabajo.** El consumo que se apunta sigue siendo el real y la decisión
 * de corregir la tarifa es de quien administra; esto solo pone la diferencia donde se vea, en el historial del
 * catálogo. Se agrupa por modelo y por cifra: repetir la misma desviación en cada trabajo no dice nada nuevo.
 */
export async function anotarDesviacionDeTarifa(
  proveedor: string,
  modelo: string,
  creditosInformados: number | null,
): Promise<boolean> {
  if (creditosInformados === null || !Number.isFinite(creditosInformados)) return false;
  const { modelos } = await cargarCatalogo();
  const fila = modelos.find((m) => m.proveedor === proveedor && m.modelo === modelo);
  if (!fila?.precio?.publicado) return false;
  const publicado = fila.precio.creditos;
  if (Math.abs(creditosInformados - publicado) <= TOLERANCIA_DESVIACION) return false;
  const hasta = `${creditosInformados} créditos cobrados por ${fila.precio.unidad}`;
  const [ultima] = await db()
    .select({ hasta: modelCatalogChanges.toValue })
    .from(modelCatalogChanges)
    .where(and(eq(modelCatalogChanges.modelId, fila.id), eq(modelCatalogChanges.field, "desviacion")))
    .orderBy(desc(modelCatalogChanges.createdAt))
    .limit(1);
  if (ultima?.hasta === hasta) return false;
  console.warn(
    `[catalogo] ${modelo} publica ${publicado} créditos por ${fila.precio.unidad} y ha cobrado ${creditosInformados}`,
  );
  await db()
    .insert(modelCatalogChanges)
    .values({
      modelId: fila.id,
      field: "desviacion",
      fromValue: `${publicado} créditos publicados por ${fila.precio.unidad}`,
      toValue: hasta,
      evidence:
        "Diferencia entre la tarifa publicada por el proveedor y lo que ha cobrado de verdad. El consumo apuntado es el real; revisa el precio del modelo si se repite.",
    });
  return true;
}
