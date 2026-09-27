import type { PersonajeVista, ResumenBorradoPersonaje } from "@/lib/personajes";

/** Cliente de la API de personajes para el navegador. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    if (respuesta.status === 204) return { ok: true, datos: undefined as T };
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

export interface DatosNuevoPersonaje {
  nombre: string;
  tipo: string;
  especie?: string;
  descripcion?: string;
}

export const listarPersonajes = () => pedir<PersonajeVista[]>("/api/personajes");

export const crearPersonaje = (datos: DatosNuevoPersonaje) =>
  pedir<PersonajeVista>("/api/personajes", json("POST", datos));

export const obtenerPersonaje = (id: string) => pedir<PersonajeVista>(`/api/personajes/${id}`);

export const editarPersonaje = (id: string, cambios: Partial<DatosNuevoPersonaje>) =>
  pedir<PersonajeVista>(`/api/personajes/${id}`, json("PATCH", cambios));

/** Qué se borraría: referencias, trabajos y medios derivados. Se enumera antes de confirmar. */
export const consultarBorrado = (id: string) => pedir<ResumenBorradoPersonaje>(`/api/personajes/${id}?borrado=1`);

export const borrarPersonaje = (id: string) =>
  pedir<{ personaje: string; clavesBorradas: string[] }>(`/api/personajes/${id}`, { method: "DELETE" });

export const anadirReferencias = (id: string, medioIds: string[]) =>
  pedir<PersonajeVista>(
    `/api/personajes/${id}/referencias`,
    json("POST", { referencias: medioIds.map((medioId) => ({ medioId })) }),
  );

export const quitarReferencias = (id: string, ids: string[]) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/referencias`, json("DELETE", { ids }));

export const ordenarReferencias = (id: string, ids: string[]) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/referencias`, json("PATCH", { ids }));

export interface DatosConsentimientoEnvio {
  titular: string;
  mayoriaDeEdad: boolean;
  alcance: string;
  documentoId?: string;
}

export const registrarConsentimiento = (id: string, datos: DatosConsentimientoEnvio) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/consentimiento`, json("POST", datos));

export const revocarConsentimiento = (id: string, motivo: string) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/consentimiento`, json("DELETE", { motivo }));

/** Revisión del documento de un tercero. Solo funciona para quien administra la instalación. */
export const revisarConsentimiento = (id: string, aceptado: boolean, nota: string) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/revision`, json("POST", { aceptado, nota }));
