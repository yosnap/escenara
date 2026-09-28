import { and, desc, eq } from "drizzle-orm";
import {
  type CambioCatalogo,
  type Capacidad,
  type EstadoModelo,
  esSeleccionable,
  type ModeloElegible,
  type ModeloVista,
  PARAMETROS_VACIOS,
  type ParametrosModelo,
  precioCaducado,
  recortarModelo,
  type TarifaVista,
} from "@/lib/catalogo";
import { db } from "../db/cliente";
import {
  type FilaModelo,
  type FilaProveedorModelo,
  modelCapabilities,
  modelCatalogChanges,
  modelPrices,
  modelProviders,
  models,
  users,
} from "../db/esquema";
import { ErrorCatalogo, type PrecioModelo } from "./contrato";

/**
 * Lectura del catálogo de modelos. El catálogo tiene decenas de filas como máximo (un proveedor no ofrece
 * miles de modelos útiles), así que se lee entero y se filtra en memoria: es más simple que tres uniones y
 * no hay ninguna consulta caliente que lo justifique.
 *
 * Los parámetros se guardan como JSON en una columna de texto y se validan al leerlos: un registro con
 * parámetros ilegibles se trata como «sin parámetros», nunca como «acepta cualquiera».
 */

export interface FiltroCatalogo {
  capacidad?: Capacidad;
  proveedor?: string;
  estado?: EstadoModelo;
}

/** Parámetros de un modelo a partir del JSON guardado. Lo que no se entiende se descarta. */
export function parametrosDeTexto(texto: string): ParametrosModelo {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ...PARAMETROS_VACIOS };
  }
  if (!crudo || typeof crudo !== "object") return { ...PARAMETROS_VACIOS };
  const o = crudo as Record<string, unknown>;
  const maximo = o.maximoReferencias;
  return {
    duraciones: numeros(o.duraciones),
    proporciones: textos(o.proporciones),
    resoluciones: textos(o.resoluciones),
    formatosReferencia: textos(o.formatosReferencia),
    maximoReferencias: typeof maximo === "number" && Number.isInteger(maximo) && maximo > 0 ? maximo : 0,
  };
}

export function textoDeParametros(parametros: ParametrosModelo): string {
  return JSON.stringify(parametros);
}

const numeros = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0) : [];

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s !== "") : [];

const selloDe = (proveedor: string, modelo: string, unidad: string, version: number) =>
  `${proveedor}:${modelo}:${unidad}@v${version}`;

export interface CatalogoCargado {
  modelos: ModeloVista[];
  proveedores: FilaProveedorModelo[];
}

/**
 * Caché corta del catálogo en el proceso. Existe porque una sola carga de «Crear» lo consulta muchas veces
 * (dos estimaciones, dos listas de modelos elegibles y sus precios), y el catálogo solo cambia cuando lo
 * edita quien administra: cada cambio llama a `olvidarCatalogo()`. Vive en `globalThis` para que las
 * recargas en caliente del servidor de desarrollo no dejen dos cachés distintas.
 */
const VIGENCIA_CATALOGO_MS = 5_000;
const memoria = globalThis as { __escenaraCatalogo?: { valor: CatalogoCargado; hasta: number } };

/** Olvida el catálogo cacheado: se llama tras cada cambio del admin y al sembrarlo. */
export function olvidarCatalogo(): void {
  memoria.__escenaraCatalogo = undefined;
}

/** Catálogo completo: modelos con su proveedor, sus capacidades y su precio vigente. */
export async function cargarCatalogo(): Promise<CatalogoCargado> {
  const guardado = memoria.__escenaraCatalogo;
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  const valor = await leerCatalogo();
  memoria.__escenaraCatalogo = { valor, hasta: Date.now() + VIGENCIA_CATALOGO_MS };
  return valor;
}

async function leerCatalogo(): Promise<CatalogoCargado> {
  const [filas, proveedores, capacidades, precios] = await Promise.all([
    db().select().from(models),
    db().select().from(modelProviders),
    db().select().from(modelCapabilities),
    db().select().from(modelPrices),
  ]);
  const porProveedor = new Map(proveedores.map((p) => [p.id, p]));
  const porModelo = new Map<string, Capacidad[]>();
  for (const c of capacidades) {
    porModelo.set(c.modelId, [...(porModelo.get(c.modelId) ?? []), c.capability]);
  }
  const listado = filas.flatMap((fila) => {
    const proveedor = porProveedor.get(fila.providerId);
    if (!proveedor) return [];
    const suyos = precios.filter((p) => p.provider === proveedor.slug && p.model === fila.modelId);
    const precio = suyos.find((p) => p.unit === fila.unit);
    return [vistaDeModelo(fila, proveedor, porModelo.get(fila.id) ?? [], precio ?? null, suyos)];
  });
  listado.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { modelos: listado, proveedores };
}

type FilaPrecioCatalogo = typeof modelPrices.$inferSelect;

function vistaDeModelo(
  fila: FilaModelo,
  proveedor: FilaProveedorModelo,
  capacidades: Capacidad[],
  precio: FilaPrecioCatalogo | null,
  /** Todas las tarifas registradas de este modelo, sea cual sea su unidad (0.23.0). */
  suyas: FilaPrecioCatalogo[] = [],
): ModeloVista {
  const comprobado = precio ? precio.checkedAt.toISOString().slice(0, 10) : "";
  const tarifas: TarifaVista[] = suyas
    .map((p) => ({
      unidad: p.unit,
      creditos: p.credits,
      enUso: p.unit === fila.unit,
      comprobado: p.checkedAt.toISOString().slice(0, 10),
      publicado: p.published,
      fuente: p.source,
      sello: selloDe(proveedor.slug, fila.modelId, p.unit, p.version),
    }))
    .sort((a, b) => a.creditos - b.creditos);
  return {
    id: fila.id,
    proveedor: proveedor.slug,
    nombreProveedor: proveedor.name,
    modelo: fila.modelId,
    nombre: fila.name,
    capacidades: [...capacidades].sort(),
    estado: fila.state,
    conVoz: fila.hasVoice,
    unidad: fila.unit,
    parametros: parametrosDeTexto(fila.parameters),
    notas: fila.notes,
    evidencia: fila.evidence,
    version: fila.version,
    predeterminado: fila.isDefault,
    precio: precio
      ? {
          unidad: precio.unit,
          creditos: precio.credits,
          fuente: precio.source,
          publicado: precio.published,
          comprobado,
          sello: selloDe(proveedor.slug, fila.modelId, precio.unit, precio.version),
          caducado: precioCaducado(comprobado),
        }
      : null,
    tarifas,
    actualizado: fila.updatedAt.toISOString(),
  };
}

/** Catálogo filtrado por capacidad, proveedor y estado (los tres opcionales). */
export async function listarModelos(filtro: FiltroCatalogo = {}): Promise<ModeloVista[]> {
  const { modelos } = await cargarCatalogo();
  return modelos.filter(
    (m) =>
      (!filtro.capacidad || m.capacidades.includes(filtro.capacidad)) &&
      (!filtro.proveedor || m.proveedor === filtro.proveedor) &&
      (!filtro.estado || m.estado === filtro.estado),
  );
}

/**
 * Modelos que se pueden elegir para una capacidad: solo `compatible` o `validado`, y solo con precio
 * registrado (sin precio no se estima ni se gasta). El predeterminado va primero.
 */
export async function modelosElegibles(capacidad: Capacidad): Promise<ModeloVista[]> {
  const modelos = await listarModelos({ capacidad });
  return modelos
    .filter((m) => esSeleccionable(m.estado) && m.precio !== null)
    .sort((a, b) => Number(b.predeterminado) - Number(a.predeterminado) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Los modelos elegibles de una capacidad, recortados a lo que puede ver quien genera (sin datos internos). */
export async function modelosParaCrear(capacidad: Capacidad): Promise<ModeloElegible[]> {
  return (await modelosElegibles(capacidad)).map(recortarModelo);
}

/**
 * Modelo con el que se va a trabajar. Sin `modelo` se usa el predeterminado de la capacidad; con uno
 * concreto se comprueba que existe, que tiene esa capacidad y que su estado permite usarlo. Un modelo
 * retirado o sin la capacidad pedida no se puede seleccionar ni enviar.
 */
export async function elegirModelo(capacidad: Capacidad, modelo?: string | null): Promise<ModeloVista> {
  const elegibles = await modelosElegibles(capacidad);
  if (!modelo) {
    const predeterminado = elegibles[0];
    if (!predeterminado) {
      throw new ErrorCatalogo(503, "No hay ningún modelo disponible para esto en el catálogo de esta instalación.");
    }
    return predeterminado;
  }
  const elegido = elegibles.find((m) => m.modelo === modelo);
  if (elegido) return elegido;
  // Se distingue «no existe» de «existe pero no se puede usar»: el aviso al usuario no es el mismo.
  const todos = await listarModelos();
  const existente = todos.find((m) => m.modelo === modelo);
  if (!existente) throw new ErrorCatalogo(400, "Ese modelo no está en el catálogo.");
  if (!existente.capacidades.includes(capacidad)) {
    throw new ErrorCatalogo(400, `El modelo ${existente.nombre} no sirve para esto.`);
  }
  if (existente.estado === "retirado") {
    throw new ErrorCatalogo(409, `El modelo ${existente.nombre} está retirado y ya no se puede usar.`);
  }
  if (!esSeleccionable(existente.estado)) {
    // El motivo concreto lo escribe quien lo dio de alta (la semilla o la sincronización de precios): puede ser
    // que no se haya probado nunca o que esta instalación no sepa con qué parámetros pedírselo.
    const motivo = existente.notas === "" ? "" : ` ${existente.notas}`;
    throw new ErrorCatalogo(409, `El modelo ${existente.nombre} no se puede elegir en esta instalación.${motivo}`);
  }
  throw new ErrorCatalogo(503, `No hay precio registrado para ${existente.nombre}: sin precio no se genera.`);
}

/**
 * Precio vigente de un modelo. Sin precio registrado no se estima ni se gasta.
 *
 * `unidad` pide **una tarifa concreta** de ese modelo (una duración, una resolución o una calidad). Es lo que
 * permite que la duración que el usuario elige sea la que se estima, la que confirma y la que se paga: el sello
 * lleva la unidad dentro, así que una confirmación no puede acabar pidiendo otra cosa. Una unidad que no está
 * registrada no se aproxima con otra: se dice que no tiene precio.
 */
export async function precioDeModelo(proveedor: string, modelo: string, unidad?: string): Promise<PrecioModelo> {
  const { modelos } = await cargarCatalogo();
  const fila = modelos.find((m) => m.proveedor === proveedor && m.modelo === modelo);

  if (!fila?.precio) {
    throw new ErrorCatalogo(
      503,
      `No hay precio registrado para ${modelo}. Sin precio no se puede estimar el coste, así que no se genera.`,
    );
  }
  if (unidad !== undefined && unidad !== fila.precio.unidad) {
    const otra = fila.tarifas.find((t) => t.unidad === unidad);
    if (!otra) {
      throw new ErrorCatalogo(
        503,
        `No hay precio registrado para ${modelo} por «${unidad}». Sin precio no se puede estimar el coste, así que no se genera.`,
      );
    }
    return {
      proveedor,
      modelo,
      unidad: otra.unidad,
      creditos: otra.creditos,
      fuente: otra.fuente,
      comprobado: otra.comprobado,
      sello: otra.sello,
    };
  }
  return {
    proveedor,
    modelo,
    unidad: fila.precio.unidad,
    creditos: fila.precio.creditos,
    fuente: fila.precio.fuente,
    comprobado: fila.precio.comprobado,
    sello: fila.precio.sello,
  };
}

/** Modelo del catálogo por su identificador de fila (lo que usan las acciones del admin). */
export async function modeloPorId(id: string): Promise<ModeloVista> {
  const { modelos } = await cargarCatalogo();
  const modelo = modelos.find((m) => m.id === id);
  if (!modelo) throw new ErrorCatalogo(404, "Ese modelo no está en el catálogo.");
  return modelo;
}

/**
 * Duración en segundos del resultado de un modelo de vídeo, según sus parámetros comprobados. Se usa al
 * guardar el clip en la biblioteca; `null` si el modelo no declara ninguna.
 */
export async function duracionDeModelo(proveedor: string, modelo: string): Promise<number | null> {
  const { modelos } = await cargarCatalogo();
  const fila = modelos.find((m) => m.proveedor === proveedor && m.modelo === modelo);
  return fila?.parametros.duraciones[0] ?? null;
}

/** Fila del modelo en la base de datos, por proveedor y modelo. */
export async function filaDeModelo(proveedor: string, modelo: string): Promise<FilaModelo | null> {
  const [fila] = await db()
    .select({ modelo: models })
    .from(models)
    .innerJoin(modelProviders, eq(models.providerId, modelProviders.id))
    .where(and(eq(modelProviders.slug, proveedor), eq(models.modelId, modelo)))
    .limit(1);
  return fila?.modelo ?? null;
}

/** Historial de cambios del catálogo, de lo más reciente a lo más antiguo. */
export async function historialCatalogo(limite = 40): Promise<CambioCatalogo[]> {
  const filas = await db()
    .select({ cambio: modelCatalogChanges, modelo: models.modelId, autor: users.email })
    .from(modelCatalogChanges)
    .innerJoin(models, eq(modelCatalogChanges.modelId, models.id))
    .leftJoin(users, eq(modelCatalogChanges.changedBy, users.id))
    .orderBy(desc(modelCatalogChanges.createdAt))
    .limit(limite);
  return filas.map(({ cambio, modelo, autor }) => ({
    id: cambio.id,
    modeloId: cambio.modelId,
    modelo,
    campo: cambio.field as CambioCatalogo["campo"],
    desde: cambio.fromValue,
    hasta: cambio.toValue,
    evidencia: cambio.evidence,
    autor,
    fecha: cambio.createdAt.toISOString(),
  }));
}
