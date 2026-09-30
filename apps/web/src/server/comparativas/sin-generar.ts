import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { type Capacidad, duracionesConCoste, type ModeloVista } from "@/lib/catalogo";
import type { ComparativaSinGenerar, EjemploDeModelo, HistorialDeModelo, ModeloComparable } from "@/lib/comparativas";
import { demoVisibleParaUsuarios } from "@/lib/demo-plantilla";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { generationJobs, media, promptTemplates } from "../db/esquema";
import { type Actor, aDto } from "../media/dto";
import { demosDe } from "../prompts/demos";
import { listarModelos } from "../proveedores/catalogo";

/**
 * **Comparar sin generar** (`/comparar`). Junta tres cosas que ya existen:
 *
 * - el **precio del catálogo** de cada modelo (el registrado en esta instalación, con su fecha);
 * - **tus resultados** de antes con cada modelo (cuántos terminaron, cuántos fallaron, lo que informó el proveedor y
 *   tus últimos archivos). Solo los tuyos: cada consulta va acotada por tu cuenta;
 * - **ejemplos de la instalación**: los de las plantillas y los trends que puedes ver, hechos con ese modelo. Pasan por
 *   la misma lista blanca que al servirlos (ningún medio con una persona real, ninguno reservado).
 *
 * **Coste cero por diseño.** Este módulo no importa ningún adaptador de proveedor, ni la estimación (que lee saldos),
 * ni la cola: solo lee la base de datos y el almacenamiento propio. Un test recorre sus importaciones y falla si
 * alguna llega a un adaptador, y otro lo ejecuta con `fetch` bloqueado.
 */

/** Resultados recientes que se enseñan por modelo. */
const RECIENTES = 3;
/** Modelos que se miran como mucho por capacidad. */
const MAXIMO_MODELOS = 60;

/** Estados en los que un modelo tiene algo que comparar: se puede elegir o se sabe cuánto cuesta. */
const comparable = (m: ModeloVista) => m.estado !== "descubierto" && m.estado !== "retirado";

/** Tu historial con cada modelo: recuento, media informada y tus últimos archivos. */
async function historialDe(actor: Actor, modelos: readonly ModeloVista[]): Promise<Map<string, HistorialDeModelo>> {
  const salida = new Map<string, HistorialDeModelo>();
  if (modelos.length === 0) return salida;
  const nombres = [...new Set(modelos.map((m) => m.modelo))];
  const recuento = await db()
    .select({
      proveedor: generationJobs.provider,
      modelo: generationJobs.model,
      terminados: sql<number>`count(*) filter (where ${generationJobs.state} = 'listo')::int`,
      fallidos: sql<number>`count(*) filter (where ${generationJobs.state} = 'fallido')::int`,
      media: sql<
        number | null
      >`avg(${generationJobs.consumedCredits}) filter (where ${generationJobs.state} = 'listo' and ${generationJobs.consumedCredits} is not null)`,
    })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, actor.id), inArray(generationJobs.model, nombres)))
    .groupBy(generationJobs.provider, generationJobs.model);
  // Los últimos archivos de cada modelo, en una sola consulta: numerados por modelo y cortados en SQL.
  const recientes = (await db().execute(sql`
    select * from (
      select ${generationJobs.provider} as proveedor, ${generationJobs.model} as modelo, ${generationJobs.resultMediaId} as medio,
             row_number() over (partition by ${generationJobs.provider}, ${generationJobs.model} order by ${generationJobs.finishedAt} desc nulls last) as n
      from ${generationJobs}
      join ${media} on ${media.id} = ${generationJobs.resultMediaId} and ${media.ownerId} = ${actor.id} and ${media.deletedAt} is null
      where ${generationJobs.userId} = ${actor.id} and ${generationJobs.state} = 'listo'
        and ${inArray(generationJobs.model, nombres)}
    ) t where t.n <= ${RECIENTES}
  `)) as unknown as { proveedor: string; modelo: string; medio: string }[];
  const filasMedio = recientes.length
    ? await db()
        .select()
        .from(media)
        .where(
          and(
            inArray(
              media.id,
              recientes.map((r) => r.medio),
            ),
            eq(media.ownerId, actor.id),
            isNull(media.deletedAt),
          ),
        )
    : [];
  const medios = new Map(filasMedio.map((f) => [f.id, aDto(f, actor)]));
  for (const m of modelos) {
    const clave = `${m.proveedor}:${m.modelo}`;
    const r = recuento.find((x) => `${x.proveedor}:${x.modelo}` === clave);
    salida.set(clave, {
      terminados: Number(r?.terminados ?? 0),
      fallidos: Number(r?.fallidos ?? 0),
      creditosMedios: r?.media === null || r?.media === undefined ? null : Math.round(Number(r.media) * 10) / 10,
      recientes: recientes
        .filter((x) => `${x.proveedor}:${x.modelo}` === clave)
        .flatMap((x) => {
          const medio = medios.get(x.medio);
          return medio ? [medio] : [];
        }),
    });
  }
  return salida;
}

/**
 * Ejemplos de la instalación hechos con cada modelo: el ejemplo de una plantilla o de un trend **que puedes ver**, cuyo
 * archivo salió de un trabajo con ese modelo. Una subida directa no dice con qué modelo se hizo y no se atribuye a
 * ninguno.
 */
async function ejemplosDe(): Promise<Map<string, EjemploDeModelo[]>> {
  const salida = new Map<string, EjemploDeModelo[]>();
  const ajustes = await leerAjustes();
  const plantillas = (
    await db()
      .select()
      .from(promptTemplates)
      .where(and(isNull(promptTemplates.ownerId), isNotNull(promptTemplates.demoMediaId)))
  ).filter((p) =>
    demoVisibleParaUsuarios(
      { deLaInstalacion: true, activa: p.active, kind: p.kind, trendStatus: p.trendStatus },
      ajustes.trendsVisibles,
    ),
  );
  if (plantillas.length === 0) return salida;
  // `demosDe` aplica la lista blanca completa: lo que no pasa no sale.
  const demos = await demosDe(plantillas);
  const conDemo = plantillas.filter((p) => demos.has(p.id));
  if (conDemo.length === 0) return salida;
  const origenes = await db()
    .select({ medio: generationJobs.resultMediaId, proveedor: generationJobs.provider, modelo: generationJobs.model })
    .from(generationJobs)
    .where(
      and(
        inArray(
          generationJobs.resultMediaId,
          conDemo.map((p) => p.demoMediaId as string),
        ),
        eq(generationJobs.state, "listo"),
      ),
    );
  for (const p of conDemo) {
    const demo = demos.get(p.id);
    const origen = origenes.find((o) => o.medio === p.demoMediaId);
    if (!demo || !origen) continue;
    const clave = `${origen.proveedor}:${origen.modelo}`;
    salida.set(clave, [...(salida.get(clave) ?? []), { plantilla: p.name, demo }]);
  }
  return salida;
}

/** La comparativa sin generar de una capacidad. No gasta nada ni habla con ningún proveedor. */
export async function compararSinGenerar(actor: Actor, capacidad: Capacidad): Promise<ComparativaSinGenerar> {
  const [modelos, ajustes] = await Promise.all([listarModelos({ capacidad }), leerAjustes()]);
  const visibles = modelos.filter(comparable).slice(0, MAXIMO_MODELOS);
  const [historial, ejemplos] = await Promise.all([historialDe(actor, visibles), ejemplosDe()]);
  return {
    capacidad,
    modelos: visibles.map((m): ModeloComparable => {
      const clave = `${m.proveedor}:${m.modelo}`;
      return {
        id: m.id,
        nombre: m.nombre,
        nombreProveedor: m.nombreProveedor,
        capacidades: m.capacidades,
        estado: m.estado,
        conVoz: m.conVoz,
        creditos: m.precio?.creditos ?? null,
        euros: m.precio ? m.precio.creditos * eurosPorCreditoDe(ajustes, m.proveedor) : null,
        unidad: m.precio?.unidad ?? m.unidad,
        comprobado: m.precio?.comprobado ?? null,
        publicado: m.precio?.publicado ?? false,
        caducado: m.precio?.caducado ?? false,
        duraciones: duracionesConCoste(m).map((d) => ({ segundos: d.segundos, creditos: d.creditos })),
        proporciones: m.parametros.proporciones,
        resoluciones: m.parametros.resoluciones,
        maximoReferencias: m.parametros.maximoReferencias,
        historial: historial.get(clave) ?? { terminados: 0, fallidos: 0, creditosMedios: null, recientes: [] },
        ejemplos: ejemplos.get(clave) ?? [],
      };
    }),
  };
}
