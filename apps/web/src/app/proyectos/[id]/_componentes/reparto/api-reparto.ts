import type { LadoReparto, MiradaReparto, PapelReparto, RepartoVista } from "@/lib/reparto";
import type { RepartoDePantalla } from "@/server/reparto/pantalla";
import type { Resultado } from "../../../_componentes/api-proyectos";

/**
 * Cliente del **reparto de una escena** (0.28.0) para el navegador: leer quién sale, elegir formato, poner y
 * quitar el segundo personaje y repartir el diálogo por turnos.
 *
 * Nada de lógica: quien decide cuántos personajes caben, qué lado le toca a cada uno y si el formato está
 * encendido es el servidor. Aquí solo se traduce la respuesta, y el error que se enseña es **el del servidor**,
 * con su causa concreta.
 *
 * Ninguna de estas llamadas gasta un crédito: montar el reparto y ver lo que costaría es gratis.
 */

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return {
        ok: false,
        error: cuerpo?.error ?? `El servidor ha respondido ${respuesta.status} sin decir por qué. Vuelve a probar.`,
      };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const parchear = (escenaId: string, cuerpo: Record<string, unknown>) =>
  pedir<RepartoVista>(`/api/escenas/${escenaId}/reparto`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

/** Todo lo que la pantalla necesita del reparto, de una vez y sin gastar nada. */
export const leerRepartoDePantalla = (escenaId: string) =>
  pedir<RepartoDePantalla>(`/api/escenas/${escenaId}/reparto/pantalla`);

/** Elige el formato: un personaje, podcast (dos clips) o dualcast (los dos en el plano). */
export const elegirFormato = (escenaId: string, formato: string) => parchear(escenaId, { formato });

/** Añade el segundo personaje. Los valores por defecto (lado opuesto, mirada cruzada) los pone el servidor. */
export const anadirPersonaje = (escenaId: string, personajeId: string) =>
  parchear(escenaId, { accion: "anadir", personajeId });

/** Cambia el papel, el lado o la mirada de alguien del reparto. */
export const cambiarPersonaje = (
  escenaId: string,
  miembroId: string,
  cambios: { papel?: PapelReparto; lado?: LadoReparto; mirada?: MiradaReparto },
) => parchear(escenaId, { accion: "cambiar", miembroId, ...cambios });

/** Quita a alguien del reparto. Se lleva también sus turnos de diálogo. */
export const quitarPersonaje = (escenaId: string, miembroId: string) =>
  parchear(escenaId, { accion: "quitar", miembroId });

/** Un turno tal como se manda: el texto va **literal**, sin traducir, y en el orden de la lista. */
export interface TurnoPedido {
  personajeId: string;
  texto: string;
  direccion: string;
}

/** Reparte el diálogo: la lista entera sustituye a la anterior, en ese orden. */
export const repartirDialogo = (escenaId: string, turnos: readonly TurnoPedido[]) =>
  parchear(escenaId, { accion: "dialogo", turnos });
