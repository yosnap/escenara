import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db/cliente";
import { accountDeletions } from "../db/esquema";
import { auth } from "./auth";

export type Sesion = NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof auth>>["api"]["getSession"]>>>;

/**
 * Sesión de la petición actual desde la cookie firmada (hasta 5 min de antigüedad). Solo para lo que no
 * protege nada: tema, idioma y enlaces de la cabecera.
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  return (await auth()).api.getSession({ headers: await headers() });
});

/** Sesión comprobada en la base de datos: una sesión cerrada o un rol retirado dejan de valer al momento. */
const obtenerSesionVerificada = cache(async (): Promise<Sesion | null> => {
  return (await auth()).api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
});

/** Página donde una cuenta con el borrado programado ve el plazo y puede cancelarlo. */
export const RUTA_BORRADO_PROGRAMADO = "/cuenta/borrado";

/**
 * `true` si la cuenta tiene un borrado programado o a medias. Durante el periodo de gracia la cuenta está
 * **desactivada**: se puede entrar, pero solo para ver el plazo y cancelarlo.
 */
export async function tieneBorradoProgramado(usuarioId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ id: accountDeletions.id })
    .from(accountDeletions)
    .where(
      and(eq(accountDeletions.userId, usuarioId), inArray(accountDeletions.state, ["programado", "borrando_objetos"])),
    )
    .limit(1);
  return fila !== undefined;
}

const borradoProgramadoEnEstaPeticion = cache(tieneBorradoProgramado);

/**
 * Exige sesión (verificada); si no la hay, lleva a «Entrar» y vuelve después a `volver`. Una cuenta con el borrado
 * programado va a {@link RUTA_BORRADO_PROGRAMADO}, salvo en las pocas páginas de solo lectura que se le permiten
 * (`permitirBorradoProgramado`): esa misma, su historial y el de sus proyectos.
 */
export async function exigirSesion(
  volver: string,
  { permitirBorradoProgramado = false }: { permitirBorradoProgramado?: boolean } = {},
): Promise<Sesion> {
  const sesion = await obtenerSesionVerificada();
  if (!sesion) redirect(`/entrar?volver=${encodeURIComponent(volver)}`);
  if (
    !permitirBorradoProgramado &&
    volver !== RUTA_BORRADO_PROGRAMADO &&
    (await borradoProgramadoEnEstaPeticion(sesion.user.id))
  ) {
    redirect(RUTA_BORRADO_PROGRAMADO);
  }
  return sesion;
}

export const esAdmin = (sesion: Sesion | null) => sesion?.user.role === "admin";

/** El admin solo existe para administradores: al resto se le responde como si no existiera. */
export async function exigirAdmin(volver: string): Promise<Sesion> {
  const sesion = await exigirSesion(volver);
  if (!esAdmin(sesion)) notFound();
  return sesion;
}

/**
 * Sesión verificada a partir de una petición (rutas de API). Una cuenta con el borrado programado no tiene acceso a
 * nada (`null`, como sin sesión) salvo que la ruta lo permita expresamente: la que cancela el borrado.
 */
export async function sesionDePeticion(
  peticion: Request,
  { permitirBorradoProgramado = false }: { permitirBorradoProgramado?: boolean } = {},
): Promise<Sesion | null> {
  const sesion = await (await auth()).api.getSession({
    headers: peticion.headers,
    query: { disableCookieCache: true },
  });
  if (!sesion || permitirBorradoProgramado) return sesion;
  return (await tieneBorradoProgramado(sesion.user.id)) ? null : sesion;
}

/** Lo que se le dice a una cuenta en su periodo de gracia cuando intenta algo que no está en la lista de permitidos. */
export const MENSAJE_CUENTA_EN_BORRADO =
  "Tu cuenta tiene el borrado programado, así que está desactivada: no puedes generar, gastar, editar ni subir nada. Mientras tanto puedes cancelar el borrado, ver tu historial y pedir o descargar la exportación de tus proyectos desde «Tu cuenta se va a borrar» (/cuenta/borrado).";

/**
 * Respuesta cuando `sesionDePeticion` no devuelve sesión: 403 con el motivo si es una cuenta en su gracia (tiene
 * sesión, pero no puede hacer esto) y 401 si de verdad no hay sesión.
 */
export async function respuestaSinSesion(peticion: Request): Promise<Response> {
  const sesion = await sesionDePeticion(peticion, { permitirBorradoProgramado: true });
  if (sesion) return Response.json({ error: MENSAJE_CUENTA_EN_BORRADO, codigo: "CUENTA_EN_BORRADO" }, { status: 403 });
  return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
