import { and, eq, isNull, max } from "drizzle-orm";
import { type Capacidad, esCapacidad, esIdentificadorDeModelo } from "@/lib/catalogo";
import { PASO_ORDEN_DE_GRUPO, renumerarGrupo } from "@/lib/orden-de-grupo";
import { variablesUsadas } from "@/lib/plantillas-prompt";
import {
  esCategoriaPreset,
  esNombreDeVariable,
  esTipoVariable,
  MAXIMO_VARIABLES,
  PLANTILLA_MAXIMA,
  type PlantillaVista,
  PRESET_DESCRIPCION_MAXIMA,
  PRESET_NOMBRE_MAXIMO,
  type RestriccionesPlantilla,
  TIPOS_VARIABLE,
  type VariablePlantilla,
} from "@/lib/presets";
import {
  CATEGORIAS_DECIDIBLES,
  type CategoriaDecidible,
  categoriasDecididasDe,
  DURACION_MAXIMA,
  DURACION_MINIMA,
  duracionesDe,
  esCategoriaDecidible,
  etiquetaDecidible,
  MAXIMO_DURACIONES_ADMITIDAS,
} from "@/lib/trends";
import { db } from "../db/cliente";
import { type FilaPlantilla, promptTemplates, promptTemplateVersions } from "../db/esquema";
import {
  listarPlantillas,
  plantillaDeLaInstalacion,
  restriccionesDeTexto,
  textoDeRestricciones,
  textoDeVariables,
  variablesDeTexto,
  versionVigente,
} from "./consulta";
import { exigirMedioParaDemo } from "./demos";
import { ErrorPreset } from "./errores";

/**
 * Alta, edición y activación de las plantillas **de la instalación**. Solo quien administra llega aquí: cada
 * función exige que la fila no tenga dueño, así que una plantilla de un usuario responde 404 aunque quien pida
 * el cambio sea administrador.
 *
 * Toda edición del texto, de las variables o de las restricciones **crea una versión nueva** con su motivo.
 * Las anteriores se conservan intactas y los trabajos que las citaron siguen citándolas: editar una plantilla
 * **no cambia lo que ya se generó**. Lo que no versiona es el nombre, la descripción, el orden ni el estado:
 * no cambian nada de lo que se le envía al proveedor. **Tampoco el ejemplo** (imagen o clip que enseña el resultado):
 * se pone y se quita aparte, sin crear versión.
 */

const CLAVE = /^[a-z0-9][a-z0-9-]{1,48}$/;

export interface DatosPlantilla {
  clave: string;
  nombre: string;
  descripcion: string;
  capacidad: Capacidad;
  plantilla: string;
  variables: VariablePlantilla[];
  restricciones: RestriccionesPlantilla;
  /** Opcional: al crear va al final de su capacidad, y al editar se conserva. Se cambia arrastrando en la lista. */
  orden?: number;
  activa: boolean;
  kind?: "base" | "trend";
  trendStatus?: "vigente" | "revision" | "caducada" | null;
  trendPlatform?: string;
  /**
   * Duración con la que se diseñó el trend: **dato histórico** que ya no limita nada. Se acepta para no romper a quien
   * lo siga enviando, se valida y, al editar sin enviarlo, se conserva el que había.
   */
  targetSeconds?: number | null;
  /** Segundos que admite el trend. Vacía = cualquiera. Al editar sin enviarla, se conserva la que había. */
  duracionesAdmitidas?: unknown;
  /** Categorías de la dirección que dicta el trend. Al editar sin enviarla, se conserva la que había. */
  direccionDecidida?: unknown;
  referenceUrl?: string;
  trendAllowsSpeech?: boolean;
  /** Motivo del cambio; obligatorio cuando el cambio crea versión. */
  motivo?: string;
}

/**
 * Duraciones admitidas tal como llegan del formulario: una lista de enteros entre 1 y 600. Se rechaza con la causa en
 * lugar de descartar en silencio, porque una duración mal escrita que desaparece deja un trend más abierto de lo que
 * quien administra quería.
 */
function exigirDuracionesAdmitidas(valor: unknown): number[] {
  if (!Array.isArray(valor))
    throw new ErrorPreset(400, "Las duraciones admitidas tienen que ser una lista de segundos.");
  if (valor.length > MAXIMO_DURACIONES_ADMITIDAS)
    throw new ErrorPreset(400, `Un trend no puede admitir más de ${MAXIMO_DURACIONES_ADMITIDAS} duraciones distintas.`);
  for (const segundos of valor) {
    if (
      typeof segundos !== "number" ||
      !Number.isInteger(segundos) ||
      segundos < DURACION_MINIMA ||
      segundos > DURACION_MAXIMA
    )
      throw new ErrorPreset(
        400,
        `«${String(segundos)}» no es una duración válida: cada una tiene que ser un número entero de segundos entre ${DURACION_MINIMA} y ${DURACION_MAXIMA}.`,
      );
  }
  return duracionesDe(valor);
}

/** Categorías que decide el trend: solo las de la dirección del clip que un trend puede dictar. */
function exigirDireccionDecidida(valor: unknown): CategoriaDecidible[] {
  if (!Array.isArray(valor)) throw new ErrorPreset(400, "«La dirección decide» tiene que ser una lista de categorías.");
  for (const categoria of valor) {
    if (!esCategoriaDecidible(categoria))
      throw new ErrorPreset(
        400,
        `«${String(categoria)}» no es algo que un trend pueda decidir: elige entre ${CATEGORIAS_DECIDIBLES.map(etiquetaDecidible).join(", ").toLowerCase()}.`,
      );
  }
  return categoriasDecididasDe(valor);
}

/** Lo que había antes, para conservarlo cuando el formulario no lo envía. `null` al crear. */
type AnteriorTrend = Pick<FilaPlantilla, "targetSeconds" | "allowedSeconds" | "decidedDirection"> | null;

function metadatosTrend(datos: DatosPlantilla, anterior: AnteriorTrend = null) {
  if (datos.kind !== "trend")
    return {
      kind: "base" as const,
      trendStatus: null,
      trendSince: null,
      trendPlatform: "",
      targetSeconds: null,
      allowedSeconds: "[]",
      decidedDirection: "[]",
      referenceUrl: "",
      trendAllowsSpeech: false,
    };
  if (datos.capacidad !== "image_to_video") throw new ErrorPreset(400, "Un trend necesita una plantilla de animación.");
  if (!["vigente", "revision", "caducada"].includes(datos.trendStatus ?? "revision"))
    throw new ErrorPreset(400, "Elige la vigencia del trend.");
  // La duración de diseño ya no limita: solo se comprueba que, si llega, sea un dato con sentido.
  const targetSeconds = datos.targetSeconds === undefined ? (anterior?.targetSeconds ?? null) : datos.targetSeconds;
  if (
    targetSeconds !== null &&
    (!Number.isInteger(targetSeconds) || targetSeconds < DURACION_MINIMA || targetSeconds > DURACION_MAXIMA)
  )
    throw new ErrorPreset(400, "La duración de diseño debe estar entre 1 y 600 segundos.");
  const duraciones =
    datos.duracionesAdmitidas === undefined
      ? duracionesDe(anterior?.allowedSeconds ?? "[]")
      : exigirDuracionesAdmitidas(datos.duracionesAdmitidas);
  const decididas =
    datos.direccionDecidida === undefined
      ? categoriasDecididasDe(anterior?.decidedDirection ?? "[]")
      : exigirDireccionDecidida(datos.direccionDecidida);
  const referenceUrl = (datos.referenceUrl ?? "").trim();
  if (referenceUrl) {
    let url: URL;
    try {
      url = new URL(referenceUrl);
    } catch {
      throw new ErrorPreset(400, "La referencia debe ser una URL HTTPS válida.");
    }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || referenceUrl.length > 500)
      throw new ErrorPreset(400, "La referencia debe ser una URL HTTPS sin credenciales y de hasta 500 caracteres.");
  }
  if (datos.trendAllowsSpeech !== undefined && typeof datos.trendAllowsSpeech !== "boolean")
    throw new ErrorPreset(400, "Indica si el trend permite habla.");
  return {
    kind: "trend" as const,
    trendStatus: datos.trendStatus ?? "revision",
    trendSince: null,
    trendPlatform: exigirTexto(datos.trendPlatform, "La plataforma", 80, 0),
    targetSeconds,
    allowedSeconds: JSON.stringify(duraciones),
    decidedDirection: JSON.stringify(decididas),
    referenceUrl,
    trendAllowsSpeech: datos.trendAllowsSpeech === true,
  };
}

function exigirTexto(valor: unknown, campo: string, maximo: number, minimo = 1): string {
  const texto = typeof valor === "string" ? valor.trim().replace(/[ \t]+/g, " ") : "";
  if (texto.length < minimo) throw new ErrorPreset(400, `${campo} no puede quedar vacío.`);
  if (texto.length > maximo) throw new ErrorPreset(400, `${campo} no puede pasar de ${maximo} caracteres.`);
  return texto;
}

function exigirOrden(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > 10_000) {
    throw new ErrorPreset(400, "El orden tiene que ser un número entero entre 0 y 10.000.");
  }
  return valor;
}

/**
 * Llaves que **parecen** una variable pero no lo son: `{{Escena}}` (con mayúsculas), `{{ mi-variable }}` (con
 * guion) o una llave suelta. Al renderizar no se sustituirían y se quedarían escritas dentro del prompt, o
 * peor, se borrarían sin que nadie lo notase. Se avisa al guardar, que es cuando se puede arreglar.
 */
const LLAVE_SOSPECHOSA = /\{\{[^}]*\}\}|\{\{|\}\}|\{[^{}]*\}/g;
const MARCA_VALIDA = /^\{\{\s*[a-z][a-z0-9_]{0,29}\s*\}\}$/;

function exigirLlavesBienEscritas(texto: string): void {
  for (const trozo of texto.match(LLAVE_SOSPECHOSA) ?? []) {
    if (MARCA_VALIDA.test(trozo)) continue;
    throw new ErrorPreset(
      400,
      `«${trozo}» no es una variable válida: se escriben como {{nombre}}, en minúsculas y con guion bajo.`,
    );
  }
}

/**
 * Cada variable, una a una, diciendo **cuál** falla. La validación silenciosa de `variablesDeTexto` descarta lo
 * que no entiende, y comparar solo el número de variables diría «alguna está mal» sin decir cuál.
 */
function exigirVariablesBienDeclaradas(crudas: unknown): void {
  if (!Array.isArray(crudas)) throw new ErrorPreset(400, "Las variables tienen que ser una lista.");
  // El tope se comprueba **antes** de iterar: una lista enorme no tiene que recorrerse para rechazarse.
  if (crudas.length > MAXIMO_VARIABLES) {
    throw new ErrorPreset(400, `Una plantilla no puede declarar más de ${MAXIMO_VARIABLES} variables.`);
  }
  const vistos = new Set<string>();
  for (const [i, cruda] of crudas.entries()) {
    const donde = `la variable ${i + 1}`;
    if (!cruda || typeof cruda !== "object") throw new ErrorPreset(400, `${donde} no es un objeto.`);
    const o = cruda as Record<string, unknown>;
    if (!esNombreDeVariable(o.nombre)) {
      throw new ErrorPreset(
        400,
        `El nombre de ${donde} no vale: minúsculas, números y guion bajo, empezando por letra.`,
      );
    }
    if (vistos.has(o.nombre)) throw new ErrorPreset(400, `La variable «${o.nombre}» está declarada dos veces.`);
    vistos.add(o.nombre);
    if (!esTipoVariable(o.tipo)) {
      throw new ErrorPreset(400, `El tipo de «${o.nombre}» no existe: usa ${TIPOS_VARIABLE.join(", ")}.`);
    }
    if ((o.tipo === "enumerado" || o.tipo === "numero") && !esCategoriaPreset(o.categoria)) {
      throw new ErrorPreset(400, `«${o.nombre}» es de tipo ${o.tipo} y tiene que declarar de qué categoría sale.`);
    }
    if (typeof o.etiqueta !== "string" || o.etiqueta.trim() === "") {
      throw new ErrorPreset(400, `«${o.nombre}» necesita una etiqueta en español: es lo que se le muestra al usuario.`);
    }
  }
}

/**
 * El texto y sus variables tienen que encajar: una variable declarada que la plantilla no usa no hace nada, y
 * una usada sin declarar **se borraría al renderizar** sin que nadie se enterase. Las dos se dicen.
 */
function exigirPlantillaCoherente(texto: string, variables: VariablePlantilla[]): void {
  if (variables.length === 0) throw new ErrorPreset(400, "Declara al menos una variable.");
  exigirLlavesBienEscritas(texto);
  const usadas = new Set(variablesUsadas(texto));
  const declaradas = new Set(variables.map((v) => v.nombre));
  const sinDeclarar = [...usadas].filter((n) => !declaradas.has(n));
  if (sinDeclarar.length > 0) {
    throw new ErrorPreset(400, `La plantilla usa variables que no declara: ${sinDeclarar.join(", ")}.`);
  }
  const sinUsar = [...declaradas].filter((n) => !usadas.has(n));
  if (sinUsar.length > 0) {
    throw new ErrorPreset(400, `Estas variables se declaran pero no se usan en el texto: ${sinUsar.join(", ")}.`);
  }
}

function exigirRestricciones(restricciones: RestriccionesPlantilla): RestriccionesPlantilla {
  if (!restricciones || typeof restricciones !== "object" || Array.isArray(restricciones))
    throw new ErrorPreset(400, "Indica las restricciones de la plantilla.");
  const modelos = (Array.isArray(restricciones.modelos) ? restricciones.modelos : []).map((m) => String(m).trim());
  for (const modelo of modelos) {
    if (!esIdentificadorDeModelo(modelo)) throw new ErrorPreset(400, `«${modelo}» no es un identificador de modelo.`);
  }
  const minimo = restricciones.minimoReferencias;
  if (typeof minimo !== "number" || !Number.isInteger(minimo) || minimo < 0 || minimo > 20) {
    throw new ErrorPreset(400, "El mínimo de referencias tiene que ser un entero entre 0 y 20.");
  }
  return { modelos: [...new Set(modelos)].slice(0, 20), minimoReferencias: minimo };
}

/** Texto y variables ya validados a partir de lo que llegó del formulario. */
function normalizarContenido(datos: DatosPlantilla) {
  // El texto conserva sus saltos de línea: son la estructura de la plantilla, que la escribe quien administra.
  const texto = exigirTexto(datos.plantilla, "El texto de la plantilla", PLANTILLA_MAXIMA, 10);
  // Primero se valida una a una, diciendo cuál falla, y después se leen con el **mismo** validador que las lee al
  // renderizar: así lo que se guarda es exactamente lo que se escribió, y un error dice qué arreglar.
  exigirVariablesBienDeclaradas(datos.variables ?? []);
  const variables = variablesDeTexto(JSON.stringify(datos.variables ?? []));
  if (variables.length !== (datos.variables?.length ?? 0)) {
    throw new ErrorPreset(400, "Alguna variable está mal declarada: revisa el nombre, el tipo y la categoría.");
  }
  exigirPlantillaCoherente(texto, variables);
  return { texto, variables, restricciones: exigirRestricciones(datos.restricciones) };
}

function exigirCapacidad(valor: unknown): Capacidad {
  if (!esCapacidad(valor)) throw new ErrorPreset(400, "Esa capacidad no existe.");
  return valor;
}

/** Crea una plantilla de la instalación con su versión 1. */
export async function crearPlantillaDeLaInstalacion(datos: DatosPlantilla, autorId: string): Promise<PlantillaVista> {
  const clave = typeof datos.clave === "string" ? datos.clave.trim().toLowerCase() : "";
  if (!CLAVE.test(clave)) {
    throw new ErrorPreset(400, "La clave solo admite minúsculas, números y guiones, y tiene que tener 2 o más.");
  }
  const { texto, variables, restricciones } = normalizarContenido(datos);
  const capacidad = exigirCapacidad(datos.capacidad);
  const trend = metadatosTrend(datos);
  const comun = {
    name: exigirTexto(datos.nombre, "El nombre", PRESET_NOMBRE_MAXIMO),
    description: exigirTexto(datos.descripcion, "La descripción", PRESET_DESCRIPCION_MAXIMA),
    template: texto,
    variables: textoDeVariables(variables),
    modelRestrictions: textoDeRestricciones(restricciones),
    active: datos.activa === true,
  };

  let creadaId = "";
  await db().transaction(async (tx) => {
    // Sin orden pedido, la nueva va detrás de la última de su capacidad.
    const [{ ultimo } = { ultimo: null }] = await tx
      .select({ ultimo: max(promptTemplates.sortOrder) })
      .from(promptTemplates)
      .where(and(eq(promptTemplates.capability, capacidad), isNull(promptTemplates.ownerId)));
    const sortOrder = datos.orden === undefined ? (ultimo ?? 0) + PASO_ORDEN_DE_GRUPO : exigirOrden(datos.orden);
    const [fila] = await tx
      .insert(promptTemplates)
      .values({
        slug: clave,
        capability: capacidad,
        sortOrder,
        ...comun,
        ...trend,
        trendSince: trend.kind === "trend" ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: promptTemplates.id });
    if (!fila) return;
    await tx.insert(promptTemplateVersions).values({
      templateId: fila.id,
      number: 1,
      template: texto,
      variables: comun.variables,
      modelRestrictions: comun.modelRestrictions,
      trendAllowsSpeech: trend.trendAllowsSpeech,
      allowedSeconds: trend.allowedSeconds,
      decidedDirection: trend.decidedDirection,
      changeReason: exigirTexto(datos.motivo ?? "Alta de la plantilla.", "El motivo", 300),
      createdBy: autorId,
    });
    creadaId = fila.id;
  });
  if (creadaId === "") throw new ErrorPreset(409, `Ya hay una plantilla de la instalación con la clave «${clave}».`);
  return await vistaPorId(creadaId);
}

/**
 * Edita una plantilla de la instalación. Si cambia el texto, las variables o las restricciones, crea una
 * versión nueva con su motivo (obligatorio) y sube el número. Si solo cambia el nombre, la descripción, el
 * orden o el estado, **no** crea versión: no cambia nada de lo que se le envía al proveedor.
 */
export async function editarPlantillaDeLaInstalacion(
  id: string,
  datos: DatosPlantilla,
  autorId: string,
): Promise<PlantillaVista> {
  const anterior = await plantillaDeLaInstalacion(id);
  if ((datos.kind ?? "base") !== anterior.kind)
    throw new ErrorPreset(400, "No se puede cambiar el tipo de una plantilla existente.");
  if (anterior.kind === "trend" && anterior.trendStatus === "caducada")
    throw new ErrorPreset(409, "Un trend caducado solo se puede duplicar.");
  const trend = metadatosTrend(datos, anterior);
  const { texto, variables, restricciones } = normalizarContenido(datos);
  const vigente = await versionVigente(anterior.id);
  const variablesTexto = textoDeVariables(variables);
  const restriccionesTexto = textoDeRestricciones(restricciones);
  const cambiaContenido =
    vigente.template !== texto ||
    textoDeVariables(variablesDeTexto(vigente.variables)) !== variablesTexto ||
    textoDeRestricciones(restriccionesDeTexto(vigente.modelRestrictions)) !== restriccionesTexto;
  /**
   * Lo que dicta el trend también versiona: el permiso de habla, las duraciones admitidas y lo que decide de la
   * dirección cambian lo que se genera, así que cada cambio deja una versión nueva con su motivo.
   */
  const cambiaTrend =
    vigente.trendAllowsSpeech !== trend.trendAllowsSpeech ||
    JSON.stringify(duracionesDe(vigente.allowedSeconds)) !== trend.allowedSeconds ||
    JSON.stringify(categoriasDecididasDe(vigente.decidedDirection)) !== trend.decidedDirection;
  const versiona = cambiaContenido || cambiaTrend;
  const motivo = versiona ? exigirTexto(datos.motivo, "El motivo del cambio", 300, 4) : "";

  await db().transaction(async (tx) => {
    await tx
      .update(promptTemplates)
      .set({
        name: exigirTexto(datos.nombre, "El nombre", PRESET_NOMBRE_MAXIMO),
        description: exigirTexto(datos.descripcion, "La descripción", PRESET_DESCRIPCION_MAXIMA),
        template: texto,
        variables: variablesTexto,
        modelRestrictions: restriccionesTexto,
        ...trend,
        trendSince: anterior.trendSince,
        // Solo se escribe el orden si se pide: releerlo aquí pisaría una reordenación concurrente del grupo.
        ...(datos.orden === undefined ? {} : { sortOrder: exigirOrden(datos.orden) }),
        active: datos.activa === true,
        version: versiona ? vigente.number + 1 : anterior.version,
        updatedAt: new Date(),
      })
      .where(and(eq(promptTemplates.id, anterior.id), isNull(promptTemplates.ownerId)));
    if (!versiona) return;
    await tx.insert(promptTemplateVersions).values({
      templateId: anterior.id,
      number: vigente.number + 1,
      template: texto,
      variables: variablesTexto,
      modelRestrictions: restriccionesTexto,
      trendAllowsSpeech: trend.trendAllowsSpeech,
      allowedSeconds: trend.allowedSeconds,
      decidedDirection: trend.decidedDirection,
      changeReason: motivo,
      createdBy: autorId,
    });
  });
  return await vistaPorId(anterior.id);
}

/** Activa o desactiva una plantilla de la instalación. Una desactivada no compone ningún prompt. */
export async function activarPlantillaDeLaInstalacion(id: string, activa: boolean): Promise<PlantillaVista> {
  const anterior = await plantillaDeLaInstalacion(id);
  if (anterior.kind === "trend" && anterior.trendStatus === "caducada")
    throw new ErrorPreset(409, "Un trend caducado solo se puede duplicar.");
  await db()
    .update(promptTemplates)
    .set({ active: activa === true, updatedAt: new Date() })
    .where(and(eq(promptTemplates.id, anterior.id), isNull(promptTemplates.ownerId)));
  return await vistaPorId(anterior.id);
}

/**
 * Pone (con el identificador de un medio de la biblioteca) o quita (con `null`) el ejemplo de una plantilla de la
 * instalación. No crea versión, no toca el texto y no llama a ningún proveedor: solo enlaza un medio que ya existe **y
 * que es del propio administrador** (`autorId`), sin personajes reales.
 * Vale también para un trend caducado o desactivado, porque es una etiqueta informativa, no algo que se genere.
 */
export async function fijarDemoDePlantilla(id: string, medioId: unknown, autorId: string): Promise<PlantillaVista> {
  const anterior = await plantillaDeLaInstalacion(id);
  if (medioId !== null && typeof medioId !== "string") throw new ErrorPreset(400, "Elige un medio de la biblioteca.");
  const nuevo = medioId === null ? null : await exigirMedioParaDemo(medioId, autorId);
  await db()
    .update(promptTemplates)
    .set({ demoMediaId: nuevo, demoSetBy: nuevo === null ? null : autorId, updatedAt: new Date() })
    .where(and(eq(promptTemplates.id, anterior.id), isNull(promptTemplates.ownerId)));
  return await vistaPorId(anterior.id);
}

export async function caducarTrend(id: string): Promise<PlantillaVista> {
  const anterior = await plantillaDeLaInstalacion(id);
  if (anterior.kind !== "trend") throw new ErrorPreset(400, "Esta plantilla no es un trend.");
  await db()
    .update(promptTemplates)
    .set({ trendStatus: "caducada", updatedAt: new Date() })
    .where(eq(promptTemplates.id, id));
  return vistaPorId(id);
}

export async function duplicarTrend(id: string, clave: string, autorId: string): Promise<PlantillaVista> {
  const anterior = await plantillaDeLaInstalacion(id);
  if (anterior.kind !== "trend") throw new ErrorPreset(400, "Esta plantilla no es un trend.");
  const copia = await crearPlantillaDeLaInstalacion(
    {
      clave,
      nombre: anterior.name,
      descripcion: anterior.description,
      capacidad: anterior.capability,
      plantilla: anterior.template,
      variables: variablesDeTexto(anterior.variables),
      restricciones: restriccionesDeTexto(anterior.modelRestrictions),
      activa: anterior.active,
      kind: "trend",
      trendStatus: "revision",
      trendPlatform: anterior.trendPlatform,
      targetSeconds: anterior.targetSeconds,
      // La copia hereda las duraciones tal cual. Un caducado de antes de la 0.34.0 aún exige la que tenía: su copia
      // nace limitada igual y quien administra la libera al revisarla (no se distingue de un límite puesto a propósito).
      duracionesAdmitidas: duracionesDe(anterior.allowedSeconds),
      direccionDecidida: categoriasDecididasDe(anterior.decidedDirection),
      referenceUrl: anterior.referenceUrl,
      trendAllowsSpeech: anterior.trendAllowsSpeech,
      motivo: `Duplicado de ${anterior.slug}.`,
    },
    autorId,
  );
  // La copia hereda el ejemplo solo si sigue valiendo con las reglas de ahora y es de quien duplica; si no, nace sin él.
  const demoMediaId = anterior.demoMediaId
    ? await exigirMedioParaDemo(anterior.demoMediaId, autorId).catch((error) => {
        if (error instanceof ErrorPreset) return null;
        throw error;
      })
    : null;
  await db()
    .update(promptTemplates)
    .set({ duplicatedFrom: id, demoMediaId, demoSetBy: demoMediaId === null ? null : autorId })
    .where(eq(promptTemplates.id, copia.id));
  return vistaPorId(copia.id);
}

/**
 * Deja las plantillas de una capacidad en el orden recibido. `ids` tiene que ser **exactamente** el grupo (las
 * plantillas de la instalación de esa capacidad): se renumeran de 10 en 10 en una sola transacción, sin empates,
 * y con el grupo bloqueado para que dos reordenaciones a la vez no se pisen.
 */
export async function ordenarGrupoDePlantillas(capacidad: Capacidad, ids: unknown): Promise<void> {
  const cap = exigirCapacidad(capacidad);
  await db().transaction(async (tx) => {
    const grupo = await tx
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(and(eq(promptTemplates.capability, cap), isNull(promptTemplates.ownerId)))
      .for("update");
    let nuevo: ReturnType<typeof renumerarGrupo>;
    try {
      nuevo = renumerarGrupo(
        grupo.map((f) => f.id),
        ids,
      );
    } catch (error) {
      throw new ErrorPreset(400, (error as Error).message);
    }
    const ahora = new Date();
    for (const { id, orden } of nuevo) {
      await tx.update(promptTemplates).set({ sortOrder: orden, updatedAt: ahora }).where(eq(promptTemplates.id, id));
    }
  });
}

/** Vista de una plantilla por identificador, con su versión vigente ya resuelta. */
async function vistaPorId(id: string): Promise<PlantillaVista> {
  const plantilla = (await listarPlantillas()).find((p) => p.id === id);
  if (!plantilla) throw new ErrorPreset(404, "Esa plantilla no existe.");
  return plantilla;
}
