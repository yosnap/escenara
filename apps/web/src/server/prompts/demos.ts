import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  type DemoPlantilla,
  demoVisibleParaUsuarios,
  rutaDeDemo,
  textoAlternativoDeDemo,
  tipoDeDemo,
} from "@/lib/demo-plantilla";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { type FilaPlantilla, media, promptTemplates } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { condicionMedioNoReservado } from "../personajes/uso-de-medio";
import { ErrorPreset } from "./errores";

/**
 * Ejemplo (imagen o clip) de las plantillas y los trends. Es **lectura**: no genera nada ni llama a ningún
 * proveedor, solo enlaza un medio que ya existe en la biblioteca.
 *
 * Un medio solo vale como ejemplo mientras esté en la biblioteca (no en la papelera), sea imagen o vídeo y **no sea
 * material reservado** (documento de consentimiento, foto de un personaje o su hoja): el ejemplo lo ven todos los
 * usuarios, y eso no se puede abrir a través de la biblioteca de quien administra. Se vuelve a comprobar al leerlo,
 * no solo al elegirlo, porque un medio puede pasar a ser referencia de un personaje después.
 */

/** Filas del medio que sí pueden hacer de ejemplo, por identificador de medio. */
async function mediosValidos(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return await db()
    .select({
      id: media.id,
      kind: media.kind,
      mimeType: media.mimeType,
      storageKey: media.storageKey,
      width: media.width,
      height: media.height,
      altEs: media.altEs,
      title: media.title,
    })
    .from(media)
    .where(and(inArray(media.id, [...ids]), isNull(media.deletedAt), condicionMedioNoReservado()));
}

/**
 * Vista del ejemplo de cada plantilla que tenga uno, por identificador de plantilla. Una plantilla cuyo medio ya no
 * sirve (papelera, reservado, tipo no admitido) queda sin ejemplo en la vista.
 */
export async function demosDe(filas: readonly FilaPlantilla[]): Promise<Map<string, DemoPlantilla>> {
  const conDemo = filas.filter((f) => f.demoMediaId !== null);
  const salida = new Map<string, DemoPlantilla>();
  if (conDemo.length === 0) return salida;
  const validos = new Map(
    (await mediosValidos(conDemo.map((f) => f.demoMediaId as string))).map((m) => [m.id, m] as const),
  );
  for (const fila of conDemo) {
    const medio = validos.get(fila.demoMediaId as string);
    const tipo = medio ? tipoDeDemo(medio.kind, medio.mimeType) : null;
    if (!medio || !tipo) continue;
    salida.set(fila.id, {
      tipo,
      url: rutaDeDemo(fila.id, medio.id),
      alt: textoAlternativoDeDemo(medio, fila.name, tipo),
      ancho: medio.width,
      alto: medio.height,
    });
  }
  return salida;
}

/** Lo que hace falta para servir el archivo de un ejemplo. */
export interface ArchivoDeDemo {
  clave: string;
  mime: string;
}

/**
 * Archivo del ejemplo de una plantilla **para quien lo pide**. Quien administra ve el de cualquier plantilla de la
 * instalación; el resto, solo el de una plantilla que se le ofrece (activa y, si es un trend, vigente con los trends
 * visibles). Todo lo demás responde 404, sin distinguir «no existe» de «no es para ti».
 */
export async function archivoDeDemo(actor: Actor, plantillaId: string): Promise<ArchivoDeDemo> {
  const [fila] = await db()
    .select()
    .from(promptTemplates)
    .where(
      and(eq(promptTemplates.id, plantillaId), isNull(promptTemplates.ownerId), isNotNull(promptTemplates.demoMediaId)),
    )
    .limit(1);
  if (!fila?.demoMediaId) throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  if (!actor.esAdmin) {
    const visible = demoVisibleParaUsuarios(
      {
        deLaInstalacion: true,
        activa: fila.active,
        kind: fila.kind,
        trendStatus: fila.trendStatus,
      },
      (await leerAjustes()).trendsVisibles,
    );
    if (!visible) throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  }
  const [medio] = await mediosValidos([fila.demoMediaId]);
  if (!medio || !tipoDeDemo(medio.kind, medio.mimeType)) throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  // El tipo se sirve limpio (sin parámetros): ya se comprobó contra la lista de los que se admiten.
  return { clave: medio.storageKey, mime: medio.mimeType.split(";")[0]?.trim().toLowerCase() ?? "" };
}

/**
 * Comprueba que un medio puede hacer de ejemplo y devuelve su identificador. Solo lo que la biblioteca de quien
 * administra deja ver: uno inexistente, en la papelera o reservado responde 404, y uno de otro tipo, 400.
 */
export async function exigirMedioParaDemo(medioId: string): Promise<string> {
  const [medio] = await mediosValidos([medioId]);
  if (!medio) throw new ErrorPreset(404, "Ese medio no existe o no se puede usar como ejemplo.");
  if (!tipoDeDemo(medio.kind, medio.mimeType))
    throw new ErrorPreset(400, "Un ejemplo tiene que ser una imagen o un clip de vídeo.");
  return medio.id;
}
