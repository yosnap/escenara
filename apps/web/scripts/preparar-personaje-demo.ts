/**
 * Copia un personaje **inventado** a una cuenta dedicada (la de tutoriales o la de demos), para grabar siempre
 * desde una cuenta limpia. Copia la ficha entera (personaje, versiones, declaración, retratos y vistas, registro para escenas
 * habladas y su proyecto Omni) y los medios a claves de almacenamiento nuevas de la cuenta de destino.
 *
 * Idempotente: si la copia ya está completa la deja igual; si está a medias la reemplaza con el mismo
 * identificador. No toca la cuenta original y no llama a ningún proveedor. Nunca imprime correos ni claves.
 *
 * Uso, desde la raíz del repositorio:
 *
 *   bun run --cwd apps/web scripts/preparar-personaje-demo.ts --destino ID|CORREO [--personaje ID|NOMBRE] [--reemplazar]
 *
 * La cuenta de destino es obligatoria: copiar a la cuenta equivocada es justo lo que hay que evitar. El personaje
 * es «Elisa» si no se indica otro.
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  decidirAccion,
  type EstadoCopia,
  idsDeMedios,
  leerArgumentos,
  type OrigenPersonaje,
  planificarCopia,
  recuentoDe,
  tituloProyectoDemo,
} from "./personaje-demo";

const raiz = path.resolve(import.meta.dirname, "../../..");
loadEnvConfig(raiz, false, { info: () => {}, error: console.error }, true);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { personaje: personajePedido, destino: destinoPedido, forzar } = leerArgumentos(process.argv.slice(2));

const { and, desc, eq, inArray, ne, or, sql } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const esquema = await import("../src/server/db/esquema");
const { borrarObjeto, copiarObjeto } = await import("../src/server/almacenamiento");
const {
  characterApprovals,
  characterOmniRegistrations,
  characterReferences,
  characters,
  characterVersions,
  communityPosts,
  consentRecords,
  generationJobs,
  media,
  projects,
  sceneCharacters,
  sceneDialogueTurns,
  users,
} = esquema;
type Ejecutor = Pick<ReturnType<typeof db>, "select">;

/** Filas hijas de un personaje, tal como las necesita la copia. */
async function filasDe(ex: Ejecutor, personajeId: string) {
  const [consentimientos, referencias, versiones, registros, aprobaciones] = await Promise.all([
    ex.select().from(consentRecords).where(eq(consentRecords.characterId, personajeId)),
    ex.select().from(characterReferences).where(eq(characterReferences.characterId, personajeId)),
    ex.select().from(characterVersions).where(eq(characterVersions.characterId, personajeId)),
    ex
      .select()
      .from(characterOmniRegistrations)
      .where(eq(characterOmniRegistrations.characterId, personajeId))
      .orderBy(desc(characterOmniRegistrations.registeredAt)),
    ex.select().from(characterApprovals).where(eq(characterApprovals.characterId, personajeId)),
  ]);
  return { consentimientos, referencias, versiones, registros, aprobaciones };
}

/** Los medios citados y las hojas marcadas con el personaje, sin repetir. */
async function mediosDe(ex: Ejecutor, personajeId: string, ids: string[]) {
  const hojas = eq(media.characterSheetOf, personajeId);
  return ex
    .select()
    .from(media)
    .where(ids.length > 0 ? or(inArray(media.id, ids), hojas) : hojas);
}

async function cuentaDestino(): Promise<string> {
  const filtro = UUID.test(destinoPedido) ? eq(users.id, destinoPedido) : eq(users.email, destinoPedido.toLowerCase());
  const [usuario] = await db().select({ id: users.id }).from(users).where(filtro).limit(1);
  if (!usuario) throw new Error("La cuenta de destino no existe.");
  return usuario.id;
}

async function personajeDeOrigen(destinoId: string) {
  const filtro = UUID.test(personajePedido)
    ? eq(characters.id, personajePedido)
    : and(eq(characters.name, personajePedido), ne(characters.ownerId, destinoId));
  const filas = await db().select().from(characters).where(filtro).limit(2);
  if (filas.length === 0)
    throw new Error(`No hay ningún personaje «${personajePedido}» fuera de la cuenta de destino.`);
  if (filas.length > 1) throw new Error(`Hay varios personajes «${personajePedido}»: indica su identificador.`);
  return filas[0] as (typeof filas)[number];
}

async function leerOrigen(destinoId: string): Promise<OrigenPersonaje> {
  const personaje = await personajeDeOrigen(destinoId);
  const hijas = await filasDe(db(), personaje.id);
  const medios = await mediosDe(db(), personaje.id, idsDeMedios({ personaje, ...hijas }));
  // La voz con la que se registró: el proyecto Omni del dueño original que tiene esa voz.
  const registro = hijas.registros.find((r) => r.supersededAt === null) ?? hijas.registros[0];
  const [proyectoOmni] = registro
    ? await db()
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, personaje.ownerId),
            eq(projects.voiceMode, "omni"),
            eq(projects.omniAudioId, registro.audioId),
          ),
        )
        .orderBy(desc(projects.updatedAt))
        .limit(1)
    : [];
  return { personaje, ...hijas, medios, proyectoOmni: proyectoOmni ?? null };
}

async function contar(consulta: Promise<{ n: number }[]>): Promise<number> {
  const [fila] = await consulta;
  return Number(fila?.n ?? 0);
}

/** Estado de la copia anterior, si existe, y los medios suyos que habría que borrar al reemplazarla. */
async function leerCopia(destinoId: string, nombre: string) {
  const [copia] = await db()
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, destinoId), eq(characters.name, nombre)))
    .limit(1);
  if (!copia) return null;
  const hijas = await filasDe(db(), copia.id);
  const citados = idsDeMedios({ personaje: copia, ...hijas });
  const medios = await mediosDe(db(), copia.id, citados);
  const propios = medios.filter((m) => m.ownerId === destinoId);
  const ids = new Set(propios.map((m) => m.id));
  const n = sql<number>`count(*)::int`.as("n");
  const usos =
    (await contar(db().select({ n }).from(generationJobs).where(eq(generationJobs.characterId, copia.id)))) +
    (await contar(db().select({ n }).from(sceneCharacters).where(eq(sceneCharacters.characterId, copia.id)))) +
    (await contar(db().select({ n }).from(sceneDialogueTurns).where(eq(sceneDialogueTurns.characterId, copia.id)))) +
    (await contar(
      db()
        .select({ n })
        .from(communityPosts)
        .where(or(eq(communityPosts.originCharacterId, copia.id), eq(communityPosts.sourceCharacterId, copia.id))),
    )) +
    (await contar(
      db()
        .select({ n })
        .from(projects)
        .where(and(eq(projects.mainCharacterId, copia.id), ne(projects.title, tituloProyectoDemo(nombre)))),
    ));
  const estado: EstadoCopia = {
    id: copia.id,
    inventado: copia.virtual,
    recuento: {
      referencias: hijas.referencias.length,
      versiones: hijas.versiones.length,
      registros: hijas.registros.length,
      consentimientos: hijas.consentimientos.length,
      medios: propios.length,
    },
    // Lo que la ficha necesita y no es de la cuenta de destino (o no existe) invalida la copia.
    mediosAjenos: citados.filter((id) => !ids.has(id)).length + (medios.length - propios.length),
    usos,
  };
  return { estado, medios: propios };
}

async function proyectoDemoExistente(destinoId: string, nombre: string): Promise<string | null> {
  const [fila] = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, destinoId), eq(projects.title, tituloProyectoDemo(nombre))))
    .limit(1);
  return fila?.id ?? null;
}

const nuevasClaves: string[] = [];
try {
  const destinoId = await cuentaDestino();
  const origen = await leerOrigen(destinoId);
  const anterior = await leerCopia(destinoId, origen.personaje.name);
  const accion = decidirAccion(recuentoDe(origen), anterior?.estado ?? null, forzar);
  const proyectoExistente = await proyectoDemoExistente(destinoId, origen.personaje.name);
  const plan = planificarCopia(origen, {
    destinoId,
    personajeId: accion.tipo === "crear" ? crypto.randomUUID() : accion.id,
    proyectoId: proyectoExistente ?? crypto.randomUUID(),
    ahora: new Date(),
    nuevoId: () => crypto.randomUUID(),
  });

  if (accion.tipo !== "dejar") {
    // Primero los objetos: si falla uno no se ha escrito nada en la base y se borran los ya copiados.
    for (const m of plan.medios) {
      await copiarObjeto(m.claveOrigen, m.fila.storageKey, m.fila.mimeType);
      nuevasClaves.push(m.fila.storageKey);
    }
  }

  await db().transaction(async (tx) => {
    if (accion.tipo === "reemplazar" && anterior) {
      // La cascada se lleva versiones, referencias, declaración y registros; los medios de la copia van después.
      await tx.delete(characters).where(eq(characters.id, accion.id));
      const viejos = anterior.medios.map((m) => m.id);
      if (viejos.length > 0) await tx.delete(media).where(and(inArray(media.id, viejos), eq(media.ownerId, destinoId)));
    }
    if (accion.tipo !== "dejar") {
      if (plan.medios.length > 0) await tx.insert(media).values(plan.medios.map((m) => m.fila));
      await tx.insert(characters).values(plan.personaje);
      if (plan.consentimientos.length > 0) await tx.insert(consentRecords).values(plan.consentimientos);
      if (plan.versiones.length > 0) await tx.insert(characterVersions).values(plan.versiones);
      if (plan.referencias.length > 0) await tx.insert(characterReferences).values(plan.referencias);
      if (plan.registros.length > 0) await tx.insert(characterOmniRegistrations).values(plan.registros);
      if (plan.aprobaciones.length > 0) await tx.insert(characterApprovals).values(plan.aprobaciones);
    }
    if (plan.proyecto && proyectoExistente) {
      // Reemplazar la copia deja su proyecto sin personaje principal (`set null`): se vuelve a poner aquí.
      const { id: _id, userId: _usuario, ...campos } = plan.proyecto;
      await tx
        .update(projects)
        .set({ ...campos, updatedAt: new Date() })
        .where(and(eq(projects.id, proyectoExistente), eq(projects.userId, destinoId)));
    } else if (plan.proyecto) {
      await tx.insert(projects).values(plan.proyecto);
    }
  });
  nuevasClaves.length = 0;

  let sinBorrar = 0;
  if (accion.tipo === "reemplazar" && anterior) {
    for (const m of anterior.medios) await borrarObjeto(m.storageKey).catch(() => sinBorrar++);
  }
  console.log(
    JSON.stringify({
      accion: accion.tipo,
      personajeId: plan.personaje.id,
      nombre: plan.personaje.name,
      medios: plan.medios.length,
      proyectoId: plan.proyecto?.id ?? null,
      ...(sinBorrar > 0 ? { objetosAnterioresSinBorrar: sinBorrar } : {}),
    }),
  );
} catch (error) {
  // Sin la fila en la base, un objeto copiado no lo encuentra nadie: se borra para no dejar huérfanos.
  for (const clave of nuevasClaves) await borrarObjeto(clave).catch(() => undefined);
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await olvidarConexion();
}
