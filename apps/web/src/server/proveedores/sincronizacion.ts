import { and, desc, eq } from "drizzle-orm";
import { esProveedor } from "@/lib/boveda";
import type { Capacidad } from "@/lib/catalogo";
import { db } from "../db/cliente";
import {
  modelCapabilities,
  modelCatalogChanges,
  modelPriceSyncs,
  modelPrices,
  modelProviders,
  models,
} from "../db/esquema";
import { olvidarCatalogo, textoDeParametros } from "./catalogo";
import type { Buscador } from "./codigos";
import type { ModeloPublicado, TarifaPublicada } from "./contrato";
import { adaptadores } from "./registro";

/**
 * **Sincronización del catálogo con los precios que publica el proveedor** (0.23.0).
 *
 * Nace de una petición del propietario: poder elegir cualquier modelo que ofrezca su proveedor viendo lo que
 * cuesta, sin tener que medirlo antes uno a uno. KIE publica su tarifa en una API sin clave y sin coste, así
 * que esto no gasta la credencial de nadie ni un solo crédito.
 *
 * Reglas, todas de dinero:
 *
 * - **no toca un precio medido**. Solo crea o actualiza filas marcadas como `published`: lo que alguien midió
 *   con su dinero no lo pisa una tabla publicada;
 * - **no cambia el estado, las capacidades ni la unidad de un modelo que ya existe**. Eso lo decide quien
 *   administra, y una sincronización diaria no puede deshacer su decisión;
 * - **no toca ningún trabajo ya creado**. Un precio que cambia sube la versión de su fila y con ella el sello,
 *   así que las estimaciones anteriores quedan caducadas y hay que volver a confirmarlas antes de gastar. Los
 *   créditos ya consumidos son un hecho histórico y se quedan como están;
 * - un modelo nuevo entra como `precio_publicado` **solo si esta instalación sabe montar su entrada**; si no,
 *   entra como `descubierto` con el motivo escrito, se ve y no se puede elegir.
 */

/** Cada cuánto se sincroniza sola. Diaria: las tarifas de un proveedor no cambian cada hora. */
export const MS_ENTRE_SINCRONIZACIONES = 24 * 60 * 60 * 1000;

export interface ResultadoSincronizacion {
  proveedor: string;
  ok: boolean;
  /** Modelos que publicaba el proveedor y que esta instalación supo traducir. */
  publicados: number;
  /** De esos, los que además sabe pedir (los que pueden acabar siendo elegibles). */
  montables: number;
  modelosCreados: number;
  preciosCreados: number;
  preciosActualizados: number;
  /** Motivo cuando `ok` es falso; vacío cuando fue bien. */
  motivo: string;
}

const vacio = (proveedor: string): ResultadoSincronizacion => ({
  proveedor,
  ok: true,
  publicados: 0,
  montables: 0,
  modelosCreados: 0,
  preciosCreados: 0,
  preciosActualizados: 0,
  motivo: "",
});

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Texto que queda como fuente del precio. Dice de dónde sale y cuándo se leyó: nunca se confunde con medirlo. */
function fuenteDe(proveedor: string, referencia: string, hoy: Date): string {
  const fecha = hoy.toISOString().slice(0, 10);
  const donde = referencia === "" ? "" : ` (${referencia})`;
  return `Tarifa publicada por ${proveedor}${donde}, leída el ${fecha}. Precio publicado, no medido en esta instalación.`;
}

/** Identificador de la fila del proveedor en el catálogo; `null` si esta instalación no lo tiene dado de alta. */
async function proveedorId(slug: string): Promise<string | null> {
  const [fila] = await db()
    .select({ id: modelProviders.id })
    .from(modelProviders)
    .where(eq(modelProviders.slug, slug))
    .limit(1);
  return fila?.id ?? null;
}

/** Da de alta un modelo publicado que esta instalación no tenía. Devuelve `true` si lo ha creado. */
async function crearModelo(
  publicado: ModeloPublicado,
  proveedorSlug: string,
  filaProveedorId: string,
  hoy: Date,
): Promise<boolean> {
  const principal = publicado.tarifas[0];
  // Sin ninguna tarifa utilizable no hay nada que enseñar: un modelo sin precio no aporta, solo estorba.
  if (!principal) return false;
  const capacidades = publicado.capacidades;
  const estado = publicado.montable && capacidades.length > 0 ? "precio_publicado" : "descubierto";
  await db().transaction(async (tx) => {
    const [fila] = await tx
      .insert(models)
      .values({
        providerId: filaProveedorId,
        modelId: publicado.modelo,
        name: publicado.nombre,
        state: estado,
        unit: principal.unidad,
        hasVoice: publicado.conVoz,
        parameters: textoDeParametros(publicado.parametros),
        notes: publicado.notas,
        evidence: "",
        isDefault: false,
      })
      .onConflictDoNothing({ target: [models.providerId, models.modelId] })
      .returning({ id: models.id });
    // Si otra sincronización simultánea lo creó primero, esta no añade nada: la fila ya está completa.
    if (!fila) return;
    if (capacidades.length > 0) {
      await tx
        .insert(modelCapabilities)
        .values(capacidades.map((capability: Capacidad) => ({ modelId: fila.id, capability })))
        .onConflictDoNothing();
    }
    await tx.insert(modelCatalogChanges).values({
      modelId: fila.id,
      field: "alta",
      toValue: estado,
      evidence: fuenteDe(proveedorSlug, publicado.referencia, hoy),
    });
  });
  return true;
}

/**
 * Registra una tarifa publicada. Crea la fila si no existe y la actualiza **solo si la que hay también es
 * publicada**: una tarifa que alguien midió con su dinero no la pisa la tabla del proveedor.
 *
 * Al cambiar el precio sube la versión, y con ella el sello: las estimaciones que alguien tuviera en pantalla
 * quedan caducadas y hay que volver a confirmarlas. Lo ya consumido no se toca.
 */
async function registrarTarifa(
  proveedorSlug: string,
  modelo: string,
  modeloId: string,
  tarifa: TarifaPublicada,
  hoy: Date,
): Promise<"creada" | "actualizada" | "sin cambios"> {
  if (!esProveedor(proveedorSlug)) return "sin cambios";
  const proveedor = proveedorSlug;
  const fuente = fuenteDe(proveedorSlug, tarifa.referencia, hoy);
  return db().transaction(async (tx) => {
    const [fila] = await tx
      .select()
      .from(modelPrices)
      .where(
        and(eq(modelPrices.provider, proveedor), eq(modelPrices.model, modelo), eq(modelPrices.unit, tarifa.unidad)),
      )
      .limit(1);
    if (!fila) {
      await tx
        .insert(modelPrices)
        .values({
          provider: proveedor,
          model: modelo,
          unit: tarifa.unidad,
          credits: tarifa.creditos,
          source: fuente,
          published: true,
          checkedAt: hoy,
        })
        .onConflictDoNothing({ target: [modelPrices.provider, modelPrices.model, modelPrices.unit] });
      return "creada";
    }
    // Un precio medido manda sobre uno publicado: lo que se pagó de verdad no lo corrige una tabla.
    if (!fila.published) return "sin cambios";
    if (fila.credits === tarifa.creditos) {
      // Mismo precio: solo se refresca la fecha, para que la ficha no avise de caducado sin motivo.
      await tx.update(modelPrices).set({ checkedAt: hoy, source: fuente }).where(eq(modelPrices.id, fila.id));
      return "sin cambios";
    }
    await tx
      .update(modelPrices)
      .set({
        credits: tarifa.creditos,
        source: fuente,
        checkedAt: hoy,
        version: fila.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(modelPrices.id, fila.id));
    await tx.insert(modelCatalogChanges).values({
      modelId: modeloId,
      field: "precio",
      fromValue: `${fila.credits} créditos por ${fila.unit}`,
      toValue: `${tarifa.creditos} créditos por ${tarifa.unidad}`,
      evidence: fuente,
    });
    return "actualizada";
  });
}

/** Sincroniza el catálogo de un proveedor con lo que publica. Nunca lanza: un fallo se registra y se informa. */
export async function sincronizarProveedor(
  proveedorSlug: string,
  opciones: { buscar?: Buscador; autorId?: string | null; hoy?: Date } = {},
): Promise<ResultadoSincronizacion> {
  const resultado = vacio(proveedorSlug);
  const hoy = opciones.hoy ?? new Date();
  const adaptador = adaptadores().find((a) => a.proveedor === proveedorSlug);
  if (!adaptador?.modelosPublicados) {
    return { ...resultado, ok: false, motivo: `${proveedorSlug} no publica su tabla de precios.` };
  }
  const filaProveedorId = await proveedorId(proveedorSlug);
  if (filaProveedorId === null) {
    return { ...resultado, ok: false, motivo: `${proveedorSlug} no está dado de alta en el catálogo.` };
  }

  let publicados: ModeloPublicado[];
  try {
    publicados = await adaptador.modelosPublicados(opciones.buscar ?? fetch);
  } catch (error) {
    const fallo = { ...resultado, ok: false, motivo: `No se ha podido leer la tabla de precios: ${detalle(error)}` };
    await apuntarSincronizacion(fallo, opciones.autorId ?? null);
    return fallo;
  }

  resultado.publicados = publicados.length;
  resultado.montables = publicados.filter((p) => p.montable).length;

  for (const publicado of publicados) {
    const [existente] = await db()
      .select({ id: models.id })
      .from(models)
      .where(and(eq(models.providerId, filaProveedorId), eq(models.modelId, publicado.modelo)))
      .limit(1);
    if (!existente) {
      if (await crearModelo(publicado, proveedorSlug, filaProveedorId, hoy)) resultado.modelosCreados++;
    }
    const [fila] = await db()
      .select({ id: models.id })
      .from(models)
      .where(and(eq(models.providerId, filaProveedorId), eq(models.modelId, publicado.modelo)))
      .limit(1);
    if (!fila) continue;
    for (const tarifa of publicado.tarifas) {
      const efecto = await registrarTarifa(proveedorSlug, publicado.modelo, fila.id, tarifa, hoy);
      if (efecto === "creada") resultado.preciosCreados++;
      if (efecto === "actualizada") resultado.preciosActualizados++;
    }
  }

  olvidarCatalogo();
  await apuntarSincronizacion(resultado, opciones.autorId ?? null);
  return resultado;
}

/** Deja constancia de la pasada, haya ido bien o mal: unos precios que envejecen en silencio no se notan. */
async function apuntarSincronizacion(resultado: ResultadoSincronizacion, autorId: string | null): Promise<void> {
  await db().insert(modelPriceSyncs).values({
    provider: resultado.proveedor,
    ok: resultado.ok,
    published: resultado.publicados,
    understood: resultado.montables,
    modelsCreated: resultado.modelosCreados,
    pricesCreated: resultado.preciosCreados,
    pricesUpdated: resultado.preciosActualizados,
    note: resultado.motivo,
    startedBy: autorId,
  });
}

/** Proveedores que publican su tabla de precios y que esta instalación sabe sincronizar. */
export const proveedoresConPreciosPublicos = (): string[] =>
  adaptadores()
    .filter((a) => a.modelosPublicados !== undefined)
    .map((a) => a.proveedor);

export interface UltimaSincronizacion {
  proveedor: string;
  fecha: string;
  ok: boolean;
  publicados: number;
  montables: number;
  motivo: string;
}

/** La última pasada de cada proveedor, para poder decir en el admin cuándo se leyó su tarifa. */
export async function ultimasSincronizaciones(): Promise<UltimaSincronizacion[]> {
  const salida: UltimaSincronizacion[] = [];
  for (const proveedor of proveedoresConPreciosPublicos()) {
    const [fila] = await db()
      .select()
      .from(modelPriceSyncs)
      .where(eq(modelPriceSyncs.provider, proveedor))
      .orderBy(desc(modelPriceSyncs.createdAt))
      .limit(1);
    if (!fila) continue;
    salida.push({
      proveedor,
      fecha: fila.createdAt.toISOString(),
      ok: fila.ok,
      publicados: fila.published,
      montables: fila.understood,
      motivo: fila.note,
    });
  }
  return salida;
}

/**
 * Sincroniza los proveedores cuya última pasada sea más vieja que {@link MS_ENTRE_SINCRONIZACIONES}. Es lo que
 * llama el worker en su pasada: barato de comprobar y, casi siempre, no hace nada.
 */
export async function sincronizarLoQueTocaHoy(buscar: Buscador = fetch): Promise<ResultadoSincronizacion[]> {
  const ultimas = new Map((await ultimasSincronizaciones()).map((u) => [u.proveedor, u]));
  const hechas: ResultadoSincronizacion[] = [];
  for (const proveedor of proveedoresConPreciosPublicos()) {
    const ultima = ultimas.get(proveedor);
    if (ultima && Date.now() - new Date(ultima.fecha).getTime() < MS_ENTRE_SINCRONIZACIONES) continue;
    hechas.push(await sincronizarProveedor(proveedor, { buscar }));
  }
  return hechas;
}
