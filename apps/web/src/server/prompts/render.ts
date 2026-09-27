import { CAPACIDAD_DE_TIPO, ETIQUETA_CAPACIDAD, type ModeloVista } from "@/lib/catalogo";
import type { TipoTrabajo } from "@/lib/generacion";
import type { TipoPersonaje } from "@/lib/personajes";
import { limpiarTextoEditado, renderizarPlantilla, textosDeEscena, valoresDeVariables } from "@/lib/plantillas-prompt";
import {
  type CategoriaPreset,
  esCategoriaMultiple,
  MAXIMO_VARIABLES,
  type PresetElegible,
  recortarPreset,
  type SeleccionPresets,
  type VariablePlantilla,
} from "@/lib/presets";
import { exigirCombinacionPosible } from "./compatibilidad";
import { plantillaUsable, presetsUsables, restriccionesDeTexto, variablesDeTexto, versionVigente } from "./consulta";
import { ErrorPreset } from "./errores";

/**
 * Composición del prompt desde una plantilla (RF04, 0.16.0). Es **el servidor** el que compone, siempre, a
 * partir de identificadores: el navegador manda qué plantilla y qué presets ha elegido, nunca el texto que
 * sale de ellos. Lo que sí puede mandar es el texto **editado a mano**, y entonces pasa por la misma
 * limpieza anti-inyección que todo lo demás y queda marcado como editado en el trabajo.
 *
 * Garantías:
 *
 * - **determinista**: los presets se ordenan por su `orden` y su clave, no por el orden en que lleguen del
 *   navegador, así que la misma elección da exactamente el mismo texto;
 * - **autorizado**: cada preset y cada plantilla se leen con el usuario de la sesión. Uno de otro usuario
 *   responde 404 (IDOR), y uno desactivado, 409;
 * - **acotado**: cada valor pasa por la limpieza de la ficha y el resultado por el tope de longitud;
 * - **sin parámetros del proveedor**: ni los valores ni el texto editado pueden cambiar modelo, duración o
 *   resolución. Lo que decide esas tres cosas es el catálogo, y la única vía de un preset para tocarlas es
 *   **declarar una restricción comprobable**, que se valida contra el catálogo antes de encolar;
 * - **auditable**: se devuelve la plantilla y la **fila de la versión** que se usó. Editar la plantilla crea
 *   otra versión y no cambia lo ya generado.
 */

export interface PeticionRender {
  usuarioId: string;
  plantillaId: string;
  /**
   * Versión de la plantilla que se le mostró al confirmar. Si la vigente es otra, el envío se rechaza con 409
   * (decisión del propietario, 2026-09-27): el texto que se enviaría no es el que el usuario revisó, igual que
   * con la ficha del personaje. Sin ella no se compara nada y se usa la vigente.
   */
  versionId?: string;
  /** Tipo de trabajo: decide qué capacidad tiene que declarar la plantilla. */
  tipo: TipoTrabajo;
  presets: SeleccionPresets;
  /**
   * Lo que escribió la persona. **Todas** las variables de tipo `texto` de la plantilla reciben este mismo
   * texto, igual que en la previsualización del navegador: en «Crear» solo hay un campo de escena, así que una
   * plantilla cuya variable no se llame «escena» tiene que funcionar igual.
   */
  escena: string;
  /** Tipo del personaje elegido, para las variables `personaje`. `null` si se genera sin personaje. */
  tipoPersonaje: TipoPersonaje | null;
  /** Modelo elegido en el catálogo: es contra él contra el que se valida la compatibilidad. */
  modelo: ModeloVista;
  /** Texto final editado a mano por el usuario. Si llega, manda sobre lo que compone la plantilla. */
  textoEditado?: string;
}

export interface PromptCompuesto {
  /** Texto final en inglés, el que se envía al proveedor (todavía sin el contexto del personaje). */
  texto: string;
  plantillaId: string;
  versionId: string;
  versionNumero: number;
  /** `true` si el texto es el que editó el usuario y no el que compuso la plantilla. */
  editado: boolean;
  /** Nombres de los presets elegidos, en el orden en que entran. Es lo que se le muestra al usuario. */
  presetsElegidos: { categoria: CategoriaPreset; nombre: string }[];
}

/** Tope de presets que se pueden mandar de una vez: la botonera nunca necesita más. */
const MAXIMO_ELEGIDOS = 12;

/** Identificadores de preset de una categoría, acotados y sin repetir. */
function idsPedidos(seleccion: SeleccionPresets, categoria: CategoriaPreset): string[] {
  const crudos = seleccion[categoria];
  if (!Array.isArray(crudos)) return [];
  const ids = [...new Set(crudos.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!esCategoriaMultiple(categoria) && ids.length > 1) {
    throw new ErrorPreset(400, "En esa categoría solo se puede elegir una opción.");
  }
  return ids;
}

/**
 * Presets elegidos, **autorizados** y recortados a lo que necesita el renderizador. Un preset de otro usuario no
 * aparece en la lectura y se rechaza con 404 (IDOR); uno desactivado, con 409.
 *
 * Una sola consulta para todos: se recogen los identificadores por categoría, se leen de golpe con el usuario de
 * la sesión y se comprueban después. Salen en el mismo orden que los envía `listarPresets` —categoría, orden y
 * nombre—, que es el orden con el que el navegador pintó la botonera: así el texto compuesto aquí es exactamente
 * el que se previsualizó.
 */
async function elegidosAutorizados(
  peticion: PeticionRender,
  variables: VariablePlantilla[],
): Promise<PresetElegible[]> {
  /** Categoría que pidió cada identificador, para poder decir qué preset no encaja y por qué. */
  const categoriaPedida = new Map<string, CategoriaPreset>();
  for (const variable of variables) {
    if (variable.tipo === "texto" || variable.tipo === "personaje" || !variable.categoria) continue;
    for (const id of idsPedidos(peticion.presets, variable.categoria)) categoriaPedida.set(id, variable.categoria);
    if (categoriaPedida.size > MAXIMO_ELEGIDOS) {
      throw new ErrorPreset(400, `No se pueden elegir más de ${MAXIMO_ELEGIDOS} opciones a la vez.`);
    }
  }
  if (categoriaPedida.size === 0) return [];

  const filas = await presetsUsables(peticion.usuarioId, [...categoriaPedida.keys()]);
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const [id, categoria] of categoriaPedida) {
    const fila = porId.get(id);
    // Lo que no aparece en la lectura del propio usuario no existe para él: ni suyo ni de la instalación.
    if (!fila) throw new ErrorPreset(404, "Ese preset no existe.");
    if (fila.categoria !== categoria) throw new ErrorPreset(400, `«${fila.nombre}» no es una opción de ${categoria}.`);
    if (!fila.activo) throw new ErrorPreset(409, `«${fila.nombre}» está desactivado: elige otra opción.`);
  }
  return filas.map(recortarPreset);
}

/** Compone el prompt final de una plantilla. Ninguna parte de esta función habla con ningún proveedor. */
export async function componerDesdePlantilla(peticion: PeticionRender): Promise<PromptCompuesto> {
  const plantilla = await plantillaUsable(peticion.usuarioId, peticion.plantillaId);
  if (!plantilla.active) throw new ErrorPreset(409, `La plantilla «${plantilla.name}» está desactivada.`);
  // La capacidad de la plantilla tiene que ser la del tipo de trabajo: la plantilla del fotograma habla de
  // encuadre y la del clip, de duración y movimiento. Cruzarlas compondría un prompt que no describe lo que se
  // va a generar, y se pagaría igual.
  const esperada = CAPACIDAD_DE_TIPO[peticion.tipo];
  if (plantilla.capability !== esperada) {
    throw new ErrorPreset(
      409,
      `La plantilla «${plantilla.name}» es de ${ETIQUETA_CAPACIDAD[plantilla.capability]} y este trabajo necesita una de ${ETIQUETA_CAPACIDAD[esperada]}.`,
    );
  }
  const version = await versionVigente(plantilla.id);
  // La versión citada tiene que ser la vigente. Si quien administra editó la plantilla entre la pantalla y el
  // botón, lo confirmado ya no es lo que se enviaría: se dice en lugar de gastar, igual que con la ficha.
  if (peticion.versionId !== undefined && peticion.versionId !== "" && peticion.versionId !== version.id) {
    throw new ErrorPreset(409, "La plantilla ha cambiado: revisa el texto y confirma otra vez.");
  }
  const variables = variablesDeTexto(version.variables);
  // El tope se comprueba **antes** de iterar: una plantilla con cien variables no puede convertir una
  // confirmación en trabajo para el servidor.
  if (variables.length > MAXIMO_VARIABLES) {
    throw new ErrorPreset(409, `La plantilla «${plantilla.name}» declara demasiadas variables: revísala.`);
  }
  const restricciones = restriccionesDeTexto(version.modelRestrictions);
  const elegidos = await elegidosAutorizados(peticion, variables);
  const valores = valoresDeVariables(variables, {
    ordenados: elegidos,
    seleccion: peticion.presets,
    // **Todas** las variables de texto reciben la escena, no solo la que se llame «escena»: es la misma regla
    // que aplica la previsualización del navegador, con la misma función.
    textos: textosDeEscena(variables, peticion.escena),
    tipoPersonaje: peticion.tipoPersonaje,
  });

  // La combinación se valida **antes** de renderizar: un formato que el modelo no admite se dice, no se cuela
  // dentro del prompt como si fuera una preferencia.
  exigirCombinacionPosible(
    elegidos.map((p) => ({
      nombre: p.nombre,
      valores: {
        prompt: p.prompt,
        ...(p.proporcion === null ? {} : { proporcion: p.proporcion }),
        ...(p.segundos === null ? {} : { segundos: p.segundos }),
      },
    })),
    restricciones,
    peticion.modelo,
  );

  const render = renderizarPlantilla(version.template, variables, valores);
  if (render.motivos.length > 0) throw new ErrorPreset(400, render.motivos.join(" "));
  const editado = limpiarTextoEditado(peticion.textoEditado);
  if (peticion.textoEditado !== undefined && peticion.textoEditado !== "" && editado === "") {
    throw new ErrorPreset(400, "El texto que has editado se queda vacío al limpiarlo: revísalo.");
  }
  const texto = editado === "" ? render.texto : editado;
  if (texto === "") throw new ErrorPreset(400, "La plantilla no compone ningún texto con lo que has elegido.");

  return {
    texto,
    plantillaId: plantilla.id,
    versionId: version.id,
    versionNumero: version.number,
    editado: editado !== "",
    presetsElegidos: elegidos.map((p) => ({ categoria: p.categoria, nombre: p.nombre })),
  };
}
