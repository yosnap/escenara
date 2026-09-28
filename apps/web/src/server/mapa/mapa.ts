import { and, asc, eq, isNull } from "drizzle-orm";
import type { Proveedor } from "@/lib/boveda";
import { categoriaDeModelo } from "@/lib/compatible";
import {
  type EntradaMapa,
  type EntradaMapaVista,
  type MapaVista,
  nombreDeProveedor,
  type TipoDeMapa,
} from "@/lib/mapa-modelos";
import { type CompatibleUtilizable, usarCompatibles } from "../boveda/compatibles";
import { usarCredencialValida } from "../boveda/credenciales";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaMapa, modelMapEntries } from "../db/esquema";
import { modelosElegibles } from "../proveedores/catalogo";

/**
 * Lectura y escritura del **mapa de modelos** (0.21.1). Dos clases de fila en la misma tabla:
 *
 * - las del usuario, que edita en «Tu cuenta»;
 * - la **recomendación de la plataforma** (`user_id` nulo), que pone quien administra.
 *
 * Regla de sustitución, y solo esta: si el usuario no ha guardado ninguna entrada de ese tipo, se usa la
 * recomendación **filtrada por las credenciales que tenga**. En cuanto guarda su mapa, manda el suyo entero,
 * también si se queda con una sola entrada: elegir con qué se genera es suyo.
 */

const filas = async (usuarioId: string | null, tipo: TipoDeMapa, ejecutor: Ejecutor = db()): Promise<FilaMapa[]> =>
  ejecutor
    .select()
    .from(modelMapEntries)
    .where(
      and(
        usuarioId === null ? isNull(modelMapEntries.userId) : eq(modelMapEntries.userId, usuarioId),
        eq(modelMapEntries.kind, tipo),
      ),
    )
    .orderBy(asc(modelMapEntries.position));

const aEntrada = (fila: FilaMapa): EntradaMapa => ({
  proveedor: fila.provider,
  compatibleId: fila.compatibleId,
  modelo: fila.model,
});

/**
 * Capacidad del catálogo de la que salen las entradas recomendadas por defecto, mientras quien administra no
 * haya escrito las suyas. `transcripcion` no tiene: lo que se recomienda ahí es la propia máquina, que no cuesta.
 */
const CAPACIDAD_DE_TIPO: Record<TipoDeMapa, "text_generation" | "tts" | "image_edit" | "text_to_video" | null> = {
  texto: "text_generation",
  voz: "tts",
  transcripcion: null,
  imagen: "image_edit",
  video: "text_to_video",
};

/**
 * Recomendación de la plataforma para ese tipo, en su orden.
 *
 * Si quien administra no ha escrito ninguna, se deduce del **catálogo de la instalación**: los modelos elegibles
 * de esa capacidad, con el predeterminado primero. Así una instalación recién migrada se comporta exactamente
 * como antes de que existiera el mapa, sin que nadie tenga que configurar nada.
 */
export async function recomendadasDe(tipo: TipoDeMapa): Promise<EntradaMapa[]> {
  const escritas = await filas(null, tipo);
  if (escritas.length > 0) return escritas.map(aEntrada);
  if (tipo === "transcripcion") return [{ proveedor: "local", compatibleId: null, modelo: "" }];
  const capacidad = CAPACIDAD_DE_TIPO[tipo];
  if (!capacidad) return [];
  const elegibles = await modelosElegibles(capacidad);
  return elegibles.map((m) => ({ proveedor: m.proveedor as Proveedor, compatibleId: null, modelo: m.modelo }));
}

/**
 * Entradas que se van a recorrer para este usuario y este tipo, **sin filtrar todavía**: las suyas si tiene, y
 * si no la recomendación de la plataforma.
 */
export async function entradasDe(
  usuarioId: string,
  tipo: TipoDeMapa,
): Promise<{ entradas: EntradaMapa[]; propio: boolean }> {
  const propias = await filas(usuarioId, tipo);
  if (propias.length > 0) return { entradas: propias.map(aEntrada), propio: true };
  const recomendadas = await recomendadasDe(tipo);
  if (tipo !== "texto") return { entradas: recomendadas, propio: false };
  /**
   * En texto, los **servicios compatibles del propio usuario van delante** de la recomendación. Los ha añadido él
   * con su clave, suelen cobrar por cuota de plan y no por llamada (NaN builders con gemma4, glm5.3-flash,
   * qwen3.8-flash…) y son mucho más baratos que el modelo de texto de pago de la plataforma, que así queda como
   * reserva en vez de gastarse en cada traducción (decisión del propietario, 2026-09-28). Van en el orden en que
   * él los puso; si guarda su propio mapa, manda el suyo.
   */
  const compatibles = await usarCompatibles(usuarioId);
  const suyas: EntradaMapa[] = compatibles.flatMap((c) =>
    c.modelos
      .filter((modelo) => categoriaDeModelo(modelo) === "texto")
      .map((modelo) => ({ proveedor: "compatible" as Proveedor, compatibleId: c.id, modelo })),
  );
  return { entradas: [...suyas, ...recomendadas], propio: false };
}

/** Una entrada ya resuelta y lista para llamar: con su credencial en claro y su nombre visible. */
export interface EntradaResuelta extends EntradaMapa {
  nombreProveedor: string;
  /** Clave de API con la que se paga; vacía en `local`, que no necesita ninguna. */
  clave: string;
  /** Servicio compatible completo cuando `proveedor` es `compatible`. */
  compatible: CompatibleUtilizable | null;
}

/**
 * Entradas que **se pueden usar ahora mismo**: se descartan las de un proveedor sin credencial válida y las de
 * un servicio compatible que ya no existe o está marcado como no válido. Llamar con una credencial que se sabe
 * rechazada solo serviría para repetir el rechazo.
 */
export async function resolverMapa(usuarioId: string, tipo: TipoDeMapa): Promise<EntradaResuelta[]> {
  const { entradas } = await entradasDe(usuarioId, tipo);
  const compatibles = await usarCompatibles(usuarioId);
  const resueltas: EntradaResuelta[] = [];
  for (const entrada of entradas) {
    const resuelta = await resolverEntrada(usuarioId, entrada, compatibles);
    if (resuelta) resueltas.push(resuelta);
  }
  return resueltas;
}

async function resolverEntrada(
  usuarioId: string,
  entrada: EntradaMapa,
  compatibles: readonly CompatibleUtilizable[],
): Promise<EntradaResuelta | null> {
  if (entrada.proveedor === "local") {
    return { ...entrada, nombreProveedor: nombreDeProveedor("local"), clave: "", compatible: null };
  }
  if (entrada.proveedor === "compatible") {
    const servicio = compatibles.find((c) => c.id === entrada.compatibleId);
    if (!servicio) return null;
    return { ...entrada, nombreProveedor: servicio.nombre, clave: servicio.clave, compatible: servicio };
  }
  const credencial = await usarCredencialValida(usuarioId, entrada.proveedor);
  if (!credencial.ok) return null;
  return {
    ...entrada,
    nombreProveedor: nombreDeProveedor(entrada.proveedor),
    clave: credencial.clave,
    compatible: null,
  };
}

/** El mapa como se pinta en la pantalla: con las entradas, por qué no sirve cada una y lo que recomienda la plataforma. */
export async function mapaVista(usuarioId: string, tipo: TipoDeMapa): Promise<MapaVista> {
  const [{ entradas, propio }, recomendadas, compatibles] = await Promise.all([
    entradasDe(usuarioId, tipo),
    recomendadasDe(tipo),
    usarCompatibles(usuarioId),
  ]);
  const vista = (lista: EntradaMapa[]) => Promise.all(lista.map((e) => aVista(usuarioId, e, compatibles)));
  return { tipo, propio, entradas: await vista(entradas), recomendadas: await vista(recomendadas) };
}

async function aVista(
  usuarioId: string,
  entrada: EntradaMapa,
  compatibles: readonly CompatibleUtilizable[],
): Promise<EntradaMapaVista> {
  const resuelta = await resolverEntrada(usuarioId, entrada, compatibles);
  if (resuelta) {
    return { ...entrada, nombreProveedor: resuelta.nombreProveedor, utilizable: true, motivo: "" };
  }
  const nombre =
    entrada.proveedor === "compatible" ? "Un servicio tuyo que ya no está" : nombreDeProveedor(entrada.proveedor);
  return {
    ...entrada,
    nombreProveedor: nombre,
    utilizable: false,
    motivo:
      entrada.proveedor === "compatible"
        ? "Ese servicio compatible ya no está guardado o está marcado como no válido. Añádelo otra vez más abajo o quita la entrada."
        : `Necesita tu clave de ${nombre}, y no hay ninguna válida guardada. Añádela en «Credenciales de IA».`,
  };
}

/**
 * Guarda el mapa de este usuario para ese tipo. Sustituye el anterior entero dentro de una transacción: un mapa
 * a medias elegiría con quién se genera sin que nadie lo haya decidido.
 */
export async function guardarMapa(
  usuarioId: string,
  tipo: TipoDeMapa,
  entradas: readonly EntradaMapa[],
): Promise<void> {
  await escribir(usuarioId, tipo, entradas);
}

/** Igual, pero para la recomendación de la plataforma. Solo la escribe quien administra. */
export async function guardarRecomendadas(tipo: TipoDeMapa, entradas: readonly EntradaMapa[]): Promise<void> {
  await escribir(null, tipo, entradas);
}

async function escribir(usuarioId: string | null, tipo: TipoDeMapa, entradas: readonly EntradaMapa[]): Promise<void> {
  await db().transaction(async (tx) => {
    await tx
      .delete(modelMapEntries)
      .where(
        and(
          usuarioId === null ? isNull(modelMapEntries.userId) : eq(modelMapEntries.userId, usuarioId),
          eq(modelMapEntries.kind, tipo),
        ),
      );
    if (entradas.length === 0) return;
    await tx.insert(modelMapEntries).values(
      entradas.map((entrada, posicion) => ({
        userId: usuarioId,
        kind: tipo,
        position: posicion,
        provider: entrada.proveedor as Proveedor,
        compatibleId: entrada.compatibleId,
        model: entrada.modelo,
      })),
    );
  });
}

/** Borra el mapa propio de ese tipo: el usuario vuelve a la recomendación de la plataforma. */
export async function volverALoRecomendado(usuarioId: string, tipo: TipoDeMapa): Promise<void> {
  await escribir(usuarioId, tipo, []);
}

/**
 * Entradas que este usuario **podría** añadir a su mapa de ese tipo: los modelos del catálogo de la instalación
 * cuya credencial tiene, los modelos de cada uno de sus servicios compatibles y, en los subtítulos, la propia
 * máquina.
 *
 * No se ofrece lo que no se puede pagar: un modelo de un proveedor del que no hay clave válida no es una opción,
 * es una decepción con un clic de por medio.
 */
export async function opcionesDe(usuarioId: string, tipo: TipoDeMapa): Promise<EntradaMapaVista[]> {
  const opciones: EntradaMapaVista[] = [];
  if (tipo === "transcripcion") {
    opciones.push({
      proveedor: "local",
      compatibleId: null,
      modelo: "",
      nombreProveedor: nombreDeProveedor("local"),
      utilizable: true,
      motivo: "",
    });
  }
  const capacidad = CAPACIDAD_DE_TIPO[tipo];
  if (capacidad) {
    for (const modelo of await modelosElegibles(capacidad)) {
      const proveedor = modelo.proveedor as Proveedor;
      if (proveedor === "compatible" || proveedor === "local") continue;
      if (!(await usarCredencialValida(usuarioId, proveedor)).ok) continue;
      opciones.push({
        proveedor,
        compatibleId: null,
        modelo: modelo.modelo,
        nombreProveedor: nombreDeProveedor(proveedor),
        utilizable: true,
        motivo: "",
      });
    }
  }
  // Los servicios compatibles solo saben de texto, voz y subtítulos: no se ofrecen donde no sirven.
  if (tipo === "texto" || tipo === "voz" || tipo === "transcripcion") {
    for (const servicio of await usarCompatibles(usuarioId)) {
      // Cada tipo solo ofrece los modelos de su clase: whisper en subtítulos, kokoro en voz, los de chat en texto.
      for (const modelo of servicio.modelos.filter((m) => categoriaDeModelo(m) === tipo)) {
        opciones.push({
          proveedor: "compatible",
          compatibleId: servicio.id,
          modelo,
          nombreProveedor: servicio.nombre,
          utilizable: true,
          motivo: "",
        });
      }
    }
  }
  return opciones;
}

/**
 * Lo que quien administra puede recomendar para ese tipo: los modelos del catálogo de la capacidad que le
 * corresponde, más la propia máquina en los subtítulos.
 *
 * **No incluye servicios compatibles**: son de cada usuario y no existen a nivel de instalación, así que
 * recomendarlos sería recomendar algo que casi nadie tiene.
 */
export async function opcionesRecomendables(
  tipo: TipoDeMapa,
): Promise<{ proveedor: string; modelo: string; etiqueta: string }[]> {
  const opciones: { proveedor: string; modelo: string; etiqueta: string }[] = [];
  if (tipo === "transcripcion") {
    opciones.push({ proveedor: "local", modelo: "", etiqueta: `${nombreDeProveedor("local")} (sin coste)` });
  }
  const capacidad = CAPACIDAD_DE_TIPO[tipo];
  if (!capacidad) return opciones;
  for (const modelo of await modelosElegibles(capacidad)) {
    opciones.push({
      proveedor: modelo.proveedor,
      modelo: modelo.modelo,
      etiqueta: `${modelo.nombreProveedor} · ${modelo.nombre}`,
    });
  }
  return opciones;
}
