"use server";

import { entradasValidas, esTipoDeMapa, type MapaVista } from "@/lib/mapa-modelos";
import { exigirSesion } from "@/server/auth/sesion";
import { guardarMapa, mapaVista, volverALoRecomendado } from "@/server/mapa/mapa";

/**
 * Acciones del mapa de modelos del usuario (0.21.1). La sesión se comprueba contra la base de datos en cada
 * acción y el identificador del usuario sale de ella, nunca del navegador: nadie puede tocar el mapa de otra
 * persona. Aquí no viaja ninguna credencial: una entrada dice **con qué clave** se paga, nunca la clave.
 */
export type RespuestaMapa = { ok: true; mapa: MapaVista } | { ok: false; error: string };

/** Guarda el mapa de ese tipo, en el orden que traiga. La primera entrada es la principal. */
export async function guardarMapaAccion(tipo: string, entradas: unknown): Promise<RespuestaMapa> {
  const sesion = await exigirSesion("/cuenta");
  if (!esTipoDeMapa(tipo)) return { ok: false, error: "Ese tipo de generación no existe." };
  const limpias = entradasValidas(entradas);
  if (!limpias) {
    return { ok: false, error: "Deja al menos una opción y comprueba que todas tienen proveedor y modelo." };
  }
  try {
    await guardarMapa(sesion.user.id, tipo, limpias);
    return { ok: true, mapa: await mapaVista(sesion.user.id, tipo) };
  } catch (error) {
    console.error("[mapa] no se ha podido guardar el mapa de un usuario:", (error as Error).message);
    return { ok: false, error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

/** Borra el mapa propio de ese tipo: se vuelve a lo que recomienda la plataforma. */
export async function volverALoRecomendadoAccion(tipo: string): Promise<RespuestaMapa> {
  const sesion = await exigirSesion("/cuenta");
  if (!esTipoDeMapa(tipo)) return { ok: false, error: "Ese tipo de generación no existe." };
  await volverALoRecomendado(sesion.user.id, tipo);
  return { ok: true, mapa: await mapaVista(sesion.user.id, tipo) };
}
