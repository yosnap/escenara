"use server";

import { type EntradaMapa, entradasValidas, esTipoDeMapa } from "@/lib/mapa-modelos";
import { exigirAdmin } from "@/server/auth/sesion";
import { guardarRecomendadas, recomendadasDe } from "@/server/mapa/mapa";

/**
 * Recomendación de la plataforma para el mapa de modelos (0.21.1): con qué recomienda esta instalación generar
 * cada cosa y en qué orden. Es lo que se usa **mientras el usuario no haya tocado su mapa**, filtrado siempre
 * por las credenciales que tenga: recomendar no es decidir por él.
 *
 * Solo la escribe quien administra, y el rol se comprueba aquí, no en la pantalla.
 */
const RUTA = "/admin/modelos";

export type RespuestaRecomendadas = { ok: true; entradas: EntradaMapa[] } | { ok: false; error: string };

export async function guardarRecomendadasAccion(tipo: string, entradas: unknown): Promise<RespuestaRecomendadas> {
  await exigirAdmin(RUTA);
  if (!esTipoDeMapa(tipo)) return { ok: false, error: "Ese tipo de generación no existe." };
  // Una recomendación vacía es legítima: significa «deduce el orden del catálogo», que es el de fábrica.
  if (Array.isArray(entradas) && entradas.length === 0) {
    await guardarRecomendadas(tipo, []);
    return { ok: true, entradas: await recomendadasDe(tipo) };
  }
  const limpias = entradasValidas(entradas);
  if (!limpias) return { ok: false, error: "Comprueba que todas las opciones tienen proveedor y modelo." };
  await guardarRecomendadas(tipo, limpias);
  return { ok: true, entradas: await recomendadasDe(tipo) };
}
