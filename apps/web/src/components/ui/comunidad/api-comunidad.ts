import type { MiPublicacionVista } from "@/lib/comunidad";

/** Cliente de la comunidad para el navegador. Cada fallo trae la causa del servidor y dice que no se ha cambiado nada. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; estado: number };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return {
        ok: false,
        estado: respuesta.status,
        error:
          cuerpo?.error ?? `El servidor ha respondido ${respuesta.status} sin decir por qué. No se ha cambiado nada.`,
      };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return {
      ok: false,
      estado: 0,
      error: "Sin conexión con el servidor. No se ha cambiado nada: vuelve a intentarlo.",
    };
  }
}

const json = (metodo: string, cuerpo?: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
});

export interface DatosAPublicar {
  origen: { tipo: "personaje" | "medio"; id: string };
  tipo: string;
  titulo: string;
  descripcion: string;
  firma: string;
  reto: string | null;
  declaracion: boolean;
}

export const publicar = (datos: DatosAPublicar) =>
  pedir<MiPublicacionVista>("/api/comunidad/publicaciones", json("POST", datos));

export const editarPublicacion = (
  id: string,
  datos: { titulo: string; descripcion: string; firma: string; reto: string | null },
) => pedir<MiPublicacionVista>(`/api/comunidad/publicaciones/${id}`, json("PATCH", datos));

export const retirarPublicacion = (id: string) =>
  pedir<{ retirada: true }>(`/api/comunidad/publicaciones/${id}`, json("DELETE"));

export const usarPublicacion = (id: string) =>
  pedir<{ destino: string }>(`/api/comunidad/publicaciones/${id}/usar`, json("POST"));

export const marcarLogrosCelebrados = (claves: string[]) =>
  pedir<{ ok: true }>("/api/comunidad/logros", json("POST", { claves }));

export const moderarPublicacion = (
  id: string,
  decision: { accion: "aprobar"; revision: number } | { accion: "rechazar"; revision: number; motivo: string },
) => pedir<{ estado: string }>(`/api/admin/moderacion/${id}`, json("POST", decision));

export interface DatosReto {
  titulo: string;
  descripcion: string;
  desde: string;
  hasta: string;
  plantilla: string | null;
}

export const crearReto = (datos: DatosReto) => pedir<{ id: string }>("/api/admin/retos", json("POST", datos));
export const borrarReto = (id: string) => pedir<{ ok: true }>(`/api/admin/retos/${id}`, json("DELETE"));
