import { and, eq } from "drizzle-orm";
import { esProveedor } from "@/lib/boveda";
import { type Capacidad, esCapacidad, esEstadoModelo, PARAMETROS_VACIOS } from "@/lib/catalogo";
import { db } from "../db/cliente";
import { modelCapabilities, modelCatalogChanges, modelPrices, modelProviders, models } from "../db/esquema";
import { olvidarCatalogo, parametrosDeTexto, textoDeParametros } from "./catalogo";
import semillaJson from "./catalogo.json";

/**
 * Siembra el catálogo desde `catalogo.json`, que es el fichero versionado del que sale el registro de esta
 * instalación. Se ejecuta al migrar (`bun run db:migrate`) y en los tests, y es idempotente:
 *
 * - crea lo que falta (proveedor, modelo, capacidades y precio);
 * - **no pisa** lo que ya exista: los precios, los estados y las notas los cambia quien administra desde
 *   `/admin/modelos`, y una semilla no puede deshacer esa decisión.
 *
 * El alta de cada modelo queda en el historial del catálogo sin autor: la hizo la semilla.
 */

interface ModeloSemilla {
  proveedor: string;
  modelo: string;
  nombre: string;
  capacidades: string[];
  estado: string;
  predeterminado: boolean;
  conVoz: boolean;
  unidad: string;
  parametros: unknown;
  precio: { creditos: number; fuente: string; comprobado: string } | null;
  evidencia: string;
  notas: string;
}

interface Semilla {
  proveedores: { slug: string; nombre: string; docs: string; notas: string }[];
  modelos: ModeloSemilla[];
}

const SEMILLA = semillaJson as unknown as Semilla;

export interface ResultadoSemilla {
  proveedoresCreados: number;
  modelosCreados: number;
  preciosCreados: number;
}

export async function sembrarCatalogo(): Promise<ResultadoSemilla> {
  const resultado: ResultadoSemilla = { proveedoresCreados: 0, modelosCreados: 0, preciosCreados: 0 };
  const idPorSlug = new Map<string, string>();

  for (const proveedor of SEMILLA.proveedores) {
    const [existente] = await db()
      .select({ id: modelProviders.id })
      .from(modelProviders)
      .where(eq(modelProviders.slug, proveedor.slug))
      .limit(1);
    if (existente) {
      idPorSlug.set(proveedor.slug, existente.id);
      continue;
    }
    const [fila] = await db()
      .insert(modelProviders)
      .values({
        slug: proveedor.slug,
        name: proveedor.nombre,
        docsUrl: proveedor.docs,
        notes: proveedor.notas,
      })
      .onConflictDoNothing({ target: modelProviders.slug })
      .returning({ id: modelProviders.id });
    if (!fila) throw new Error(`No se ha podido sembrar el proveedor ${proveedor.slug}.`);
    idPorSlug.set(proveedor.slug, fila.id);
    resultado.proveedoresCreados++;
  }

  for (const modelo of SEMILLA.modelos) {
    const proveedorId = idPorSlug.get(modelo.proveedor);
    if (!proveedorId) throw new Error(`La semilla usa el proveedor ${modelo.proveedor}, que no declara.`);
    if (await sembrarModelo(modelo, proveedorId)) resultado.modelosCreados++;
    if (await sembrarPrecio(modelo)) resultado.preciosCreados++;
  }

  olvidarCatalogo();
  return resultado;
}

async function sembrarModelo(modelo: ModeloSemilla, proveedorId: string): Promise<boolean> {
  const [existente] = await db()
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.providerId, proveedorId), eq(models.modelId, modelo.modelo)))
    .limit(1);
  if (existente) return false;

  const capacidades = modelo.capacidades.filter((c): c is Capacidad => esCapacidad(c));
  if (capacidades.length === 0) throw new Error(`El modelo ${modelo.modelo} de la semilla no declara capacidades.`);
  if (!esEstadoModelo(modelo.estado)) throw new Error(`El modelo ${modelo.modelo} tiene un estado desconocido.`);
  // Se guarda ya comprobado: dentro de la transacción el tipo del campo del objeto vuelve a ser `string`.
  const estado = modelo.estado;
  // Los parámetros pasan por el mismo validador que la lectura: la semilla no puede colar basura.
  const parametros = modelo.parametros ? parametrosDeTexto(JSON.stringify(modelo.parametros)) : PARAMETROS_VACIOS;

  // El modelo, sus capacidades y su alta en el historial van juntos: nunca queda un modelo a medias.
  await db().transaction(async (tx) => {
    const [fila] = await tx
      .insert(models)
      .values({
        providerId: proveedorId,
        modelId: modelo.modelo,
        name: modelo.nombre,
        state: estado,
        unit: modelo.unidad,
        hasVoice: modelo.conVoz,
        parameters: textoDeParametros(parametros),
        notes: modelo.notas,
        evidence: modelo.evidencia,
        isDefault: modelo.predeterminado,
      })
      .onConflictDoNothing({ target: [models.providerId, models.modelId] })
      .returning({ id: models.id });
    // Si otra siembra simultánea lo creó primero, esta no añade nada: la fila ya está completa.
    if (!fila) return;
    await tx
      .insert(modelCapabilities)
      .values(capacidades.map((capability) => ({ modelId: fila.id, capability })))
      .onConflictDoNothing();
    await tx.insert(modelCatalogChanges).values({
      modelId: fila.id,
      field: "alta",
      toValue: estado,
      evidence: modelo.evidencia || "Semilla versionada del catálogo (catalogo.json).",
    });
  });
  return true;
}

async function sembrarPrecio(modelo: ModeloSemilla): Promise<boolean> {
  // Los servicios compatibles también llevan precio (0: se pagan por cuota del plan). Sin su fila, un modelo
  // compatible validado seguiría «sin precio» y no se podría elegir nunca.
  if (!modelo.precio || !(esProveedor(modelo.proveedor) || modelo.proveedor === "compatible")) return false;
  const [existente] = await db()
    .select({ id: modelPrices.id })
    .from(modelPrices)
    .where(
      and(
        eq(modelPrices.provider, modelo.proveedor),
        eq(modelPrices.model, modelo.modelo),
        eq(modelPrices.unit, modelo.unidad),
      ),
    )
    .limit(1);
  if (existente) return false;
  await db()
    .insert(modelPrices)
    .values({
      provider: modelo.proveedor,
      model: modelo.modelo,
      unit: modelo.unidad,
      credits: modelo.precio.creditos,
      source: modelo.precio.fuente,
      checkedAt: new Date(`${modelo.precio.comprobado}T00:00:00Z`),
    })
    .onConflictDoNothing({ target: [modelPrices.provider, modelPrices.model, modelPrices.unit] });
  return true;
}
