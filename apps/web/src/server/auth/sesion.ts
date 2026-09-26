import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
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

/** Exige sesión (verificada); si no la hay, lleva a «Entrar» y vuelve después a `volver`. */
export async function exigirSesion(volver: string): Promise<Sesion> {
  const sesion = await obtenerSesionVerificada();
  if (!sesion) redirect(`/entrar?volver=${encodeURIComponent(volver)}`);
  return sesion;
}

export const esAdmin = (sesion: Sesion | null) => sesion?.user.role === "admin";

/** El admin solo existe para administradores: al resto se le responde como si no existiera. */
export async function exigirAdmin(volver: string): Promise<Sesion> {
  const sesion = await exigirSesion(volver);
  if (!esAdmin(sesion)) notFound();
  return sesion;
}

/** Sesión verificada a partir de una petición (rutas de API). */
export async function sesionDePeticion(peticion: Request): Promise<Sesion | null> {
  return (await auth()).api.getSession({ headers: peticion.headers, query: { disableCookieCache: true } });
}
