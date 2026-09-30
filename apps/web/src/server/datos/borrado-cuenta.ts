import { and, count, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { FRASE_BORRADO_CUENTA as FRASE_CONFIRMACION, MINUTOS_SESION_RECIENTE } from "@/lib/tus-datos";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import {
  accountDeletions,
  characters,
  type FilaBorradoCuenta,
  generationJobs,
  media,
  openaiProviders,
  passkeys,
  places,
  products,
  projects,
  providerCredentials,
  sessions,
  users,
} from "../db/esquema";
import { comprometidoDe } from "../presupuesto/deposito";
import { ErrorDatos } from "./errores";
import { cerrarTrabajosAntesDeBorrar } from "./trabajos-al-borrar";

/**
 * Borrado de la cuenta (RGPD, derecho de supresión), desde la web: pedirlo, ver en qué punto está y cancelarlo.
 * **Lo borra el worker** pasado el periodo de gracia (`borrado-cuenta-worker.ts`).
 *
 * Salvaguardas, porque no se puede deshacer:
 *
 * - **sesión reciente**: haber entrado hace menos de {@link MINUTOS_SESION_RECIENTE} minutos, con contraseña o passkey;
 * - **frase escrita** a mano ({@link FRASE_CONFIRMACION});
 * - **periodo de gracia** (Admin › Ajustes, 7 días de fábrica): la cuenta queda **desactivada** —solo se puede entrar
 *   para cancelar— y las demás sesiones se cierran;
 * - quien es el **único administrador** no puede borrarse: la instalación se quedaría sin nadie que la gestione.
 */

const ABIERTOS = ["programado", "borrando_objetos"] as const;

export interface ResumenBorradoCuenta {
  proyectos: { id: string; titulo: string }[];
  personajes: number;
  productos: number;
  lugares: number;
  medios: number;
  bytes: number;
  credenciales: number;
  passkeys: number;
  sesiones: number;
  /** Créditos consumidos: el apunte desaparece; queda sumado, sin tu cuenta, en el gasto de la instalación. */
  creditosConsumidos: number;
  diasGracia: number;
  unicoAdministrador: boolean;
}

export interface EstadoBorradoCuenta {
  estado: FilaBorradoCuenta["state"];
  pedidoEn: string;
  borraEn: string;
  cancelable: boolean;
}

/** Borrado abierto (programado o a medias) de una cuenta, si lo hay. */
export async function borradoAbiertoDe(usuarioId: string): Promise<FilaBorradoCuenta | null> {
  const [fila] = await db()
    .select()
    .from(accountDeletions)
    .where(and(eq(accountDeletions.userId, usuarioId), inArray(accountDeletions.state, [...ABIERTOS])))
    .limit(1);
  return fila ?? null;
}

export const vistaBorrado = (fila: FilaBorradoCuenta): EstadoBorradoCuenta => ({
  estado: fila.state,
  pedidoEn: fila.requestedAt.toISOString(),
  borraEn: fila.scheduledFor.toISOString(),
  cancelable: fila.state === "programado",
});

async function esUnicoAdministrador(usuarioId: string): Promise<boolean> {
  const [yo] = await db().select({ rol: users.role }).from(users).where(eq(users.id, usuarioId)).limit(1);
  if (yo?.rol !== "admin") return false;
  const [{ otros } = { otros: 0 }] = await db()
    .select({ otros: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, usuarioId)));
  return otros === 0;
}

const total = (filas: { total: number }[]) => filas[0]?.total ?? 0;

export async function resumenBorradoCuenta(usuarioId: string): Promise<ResumenBorradoCuenta> {
  const [
    proyectos,
    personajes,
    productos,
    lugares,
    medios,
    credenciales,
    compatibles,
    llaves,
    abiertas,
    gasto,
    ajustes,
    unico,
  ] = await Promise.all([
    db()
      .select({ id: projects.id, titulo: projects.title })
      .from(projects)
      .where(eq(projects.userId, usuarioId))
      .orderBy(projects.createdAt),
    db().select({ total: count() }).from(characters).where(eq(characters.ownerId, usuarioId)),
    db().select({ total: count() }).from(products).where(eq(products.ownerId, usuarioId)),
    db().select({ total: count() }).from(places).where(eq(places.ownerId, usuarioId)),
    db()
      .select({ total: count(), bytes: sql<number>`coalesce(sum(${media.sizeBytes}), 0)::float8` })
      .from(media)
      .where(eq(media.ownerId, usuarioId)),
    db().select({ total: count() }).from(providerCredentials).where(eq(providerCredentials.userId, usuarioId)),
    db().select({ total: count() }).from(openaiProviders).where(eq(openaiProviders.userId, usuarioId)),
    db().select({ total: count() }).from(passkeys).where(eq(passkeys.userId, usuarioId)),
    db().select({ total: count() }).from(sessions).where(eq(sessions.userId, usuarioId)),
    comprometidoDe(usuarioId),
    leerAjustes(),
    esUnicoAdministrador(usuarioId),
  ]);
  return {
    proyectos: proyectos.map((p) => ({ id: p.id, titulo: p.titulo })),
    personajes: total(personajes),
    productos: total(productos),
    lugares: total(lugares),
    medios: medios[0]?.total ?? 0,
    bytes: Number(medios[0]?.bytes ?? 0),
    credenciales: total(credenciales) + total(compatibles),
    passkeys: total(llaves),
    sesiones: total(abiertas),
    creditosConsumidos: gasto.consumido,
    diasGracia: ajustes.borradoCuentaDiasGracia,
    unicoAdministrador: unico,
  };
}

export interface SesionParaBorrar {
  usuarioId: string;
  sesionId: string;
  /** Cuándo se abrió la sesión: es lo que dice si se acaba de entrar con contraseña o passkey. */
  creadaEn: Date;
}

/** `true` si la sesión se abrió hace menos de {@link MINUTOS_SESION_RECIENTE} minutos. */
export const esSesionReciente = (creadaEn: Date, ahora = new Date()) =>
  ahora.getTime() - creadaEn.getTime() <= MINUTOS_SESION_RECIENTE * 60_000;

export async function pedirBorradoCuenta(sesion: SesionParaBorrar, frase: unknown): Promise<EstadoBorradoCuenta> {
  if (typeof frase !== "string" || frase.trim().toLowerCase() !== FRASE_CONFIRMACION) {
    throw new ErrorDatos(400, `Escribe «${FRASE_CONFIRMACION}» para confirmar. No se ha programado nada.`);
  }
  if (!esSesionReciente(sesion.creadaEn)) {
    throw new ErrorDatos(
      403,
      `Para borrar la cuenta tienes que haber entrado hace menos de ${MINUTOS_SESION_RECIENTE} minutos. Sal, vuelve a entrar con tu contraseña o tu passkey y repite el borrado. No se ha programado nada.`,
    );
  }
  if (await esUnicoAdministrador(sesion.usuarioId)) {
    throw new ErrorDatos(
      409,
      "Eres el único administrador de esta instalación: si borras tu cuenta, nadie podrá gestionarla. Antes tiene que haber otra cuenta con el rol de administrador (hoy se asigna en la base de datos: lo explica la guía «Tus datos»). No se ha programado nada.",
    );
  }
  const ya = await borradoAbiertoDe(sesion.usuarioId);
  if (ya) return vistaBorrado(ya);

  const { borradoCuentaDiasGracia: dias } = await leerAjustes();
  const cuando = new Date(Date.now() + dias * 24 * 3600_000);
  const fila = await db().transaction(async (tx) => {
    const [nueva] = await tx
      .insert(accountDeletions)
      .values({ userId: sesion.usuarioId, scheduledFor: cuando, availableAt: cuando })
      .onConflictDoNothing()
      .returning();
    // La cuenta queda desactivada: fuera las demás sesiones. La actual se queda para poder cancelar.
    await tx.delete(sessions).where(and(eq(sessions.userId, sesion.usuarioId), ne(sessions.id, sesion.sesionId)));
    return nueva;
  });
  // Lo que estaba esperando turno no sale durante la gracia: se cancela liberando su reserva.
  const encolados = await db()
    .select()
    .from(generationJobs)
    .where(
      and(eq(generationJobs.userId, sesion.usuarioId), inArray(generationJobs.state, ["en_cola", "esperando_limite"])),
    );
  await cerrarTrabajosAntesDeBorrar(encolados, "al pedir el borrado de la cuenta").catch((error: unknown) =>
    // El worker lo vuelve a intentar al borrar; aquí solo se registra.
    console.error(`[datos] no se han podido cancelar los trabajos en cola al pedir un borrado: ${String(error)}`),
  );
  const abierta = fila ?? (await borradoAbiertoDe(sesion.usuarioId));
  if (!abierta) throw new Error("El borrado programado no se ha guardado.");
  console.info(`[datos] borrado de cuenta programado · ${abierta.id} para ${abierta.scheduledFor.toISOString()}`);
  return vistaBorrado(abierta);
}

export async function cancelarBorradoCuenta(usuarioId: string): Promise<void> {
  const hecho = await db()
    .update(accountDeletions)
    .set({ state: "cancelado", cancelledAt: new Date(), lockedBy: null, lockedUntil: null })
    .where(
      and(
        eq(accountDeletions.userId, usuarioId),
        eq(accountDeletions.state, "programado"),
        // Mientras el worker lo está ejecutando no se cancela: podría estar ya cancelando trabajos o borrando filas. Al
        // soltarlo (aplazado o fallido) vuelve a poder cancelarse.
        or(isNull(accountDeletions.lockedUntil), lt(accountDeletions.lockedUntil, new Date())),
      ),
    )
    .returning({ id: accountDeletions.id });
  if (hecho.length > 0) {
    console.info(`[datos] borrado de cuenta cancelado · ${hecho[0]?.id}`);
    return;
  }
  const abierto = await borradoAbiertoDe(usuarioId);
  if (abierto?.state === "programado") {
    throw new ErrorDatos(
      409,
      "El borrado está empezando justo ahora y no se puede cancelar en este momento. Vuelve a intentarlo en un par de minutos: si el borrado ha tenido que esperar, todavía podrás cancelarlo.",
    );
  }
  if (abierto) {
    throw new ErrorDatos(
      409,
      "El borrado ya ha empezado y no se puede cancelar: tus datos se están borrando ahora mismo.",
    );
  }
  throw new ErrorDatos(404, "No hay ningún borrado de cuenta programado.");
}
