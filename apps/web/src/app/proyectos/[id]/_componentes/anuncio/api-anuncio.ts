import type { BriefVista, OfertaVista } from "@/lib/anuncio";
import type { HookPropuesto } from "@/lib/anuncio-guion";
import type { DecisionVista } from "@/lib/coherencia";
import type { PropuestaDeHooks } from "@/server/anuncio/guion";
import type { HookAplicado } from "@/server/anuncio/hook";
import type { PuertaDelGuion } from "@/server/anuncio/puerta-guion";
import type { EstimacionDeVariantes, VariantesCreadas } from "@/server/anuncio/variantes";
import type { EstimacionDeTexto } from "@/server/mapa/texto";
import type { Resultado } from "../../../_componentes/api-proyectos";

/**
 * Cliente de la **estrategia del anuncio** (0.27.0) para el navegador: brief, oferta, declaración, hooks,
 * variantes y el veredicto del ángulo.
 *
 * Nada de lógica: quien decide qué se puede y qué cuesta es el servidor. Aquí solo se traduce una respuesta a un
 * `Resultado`, y el error que se enseña es **el del servidor**, con su causa: nunca un «no se ha podido» genérico.
 *
 * `red: true` marca los fallos en los que no se sabe si la petición llegó, que importa en las dos llamadas que
 * gastan —hooks y variantes—: pueden haberse cobrado ya, y repetirlas con la misma clave de idempotencia es lo
 * que evita el segundo cobro.
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

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

const ruta = (proyectoId: string) => `/api/proyectos/${proyectoId}`;

// ── El brief ────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que devuelve guardar el brief: el brief y el estado de la puerta, que es lo que cambia al guardarlo. */
export interface BriefGuardado {
  brief: BriefVista;
  puerta: PuertaDelGuion;
}

/** Guarda solo lo que se le pasa: lo que no viaja se queda como estaba, así que se puede guardar campo a campo. */
export const guardarBrief = (proyectoId: string, cambios: Record<string, unknown>) =>
  pedir<BriefGuardado>(`${ruta(proyectoId)}/brief`, json("PUT", cambios));

export const borrarBrief = (proyectoId: string) =>
  pedir<{ borrado: boolean }>(`${ruta(proyectoId)}/brief`, { method: "DELETE" });

/** Registra la declaración de veracidad del ángulo. `aceptado` va expreso: no se deduce de que se llamara. */
export const declararVeracidad = (proyectoId: string, angulo: string) =>
  pedir<{ declaracion: { angulo: string; textoAceptado: string; aceptado: string }; puerta: PuertaDelGuion }>(
    `${ruta(proyectoId)}/brief/declaracion`,
    json("POST", { angulo, aceptado: true }),
  );

// ── Las ofertas ─────────────────────────────────────────────────────────────────────────────────────────

export const crearOferta = (datos: Record<string, unknown>) => pedir<OfertaVista>("/api/ofertas", json("POST", datos));

export const editarOferta = (id: string, cambios: Record<string, unknown>) =>
  pedir<OfertaVista>(`/api/ofertas/${id}`, json("PATCH", cambios));

/** Duplica la oferta a otro producto propio. La original no se toca: su anuncio sigue vivo. */
export const duplicarOferta = (id: string, productoId: string) =>
  pedir<OfertaVista>(`/api/ofertas/${id}/duplicar`, json("POST", { productoId }));

// ── Hooks y guion ───────────────────────────────────────────────────────────────────────────────────────

export interface EstadoDeHooks {
  estimacion: EstimacionDeTexto;
  puerta: PuertaDelGuion;
  hooksPedidos: number;
}

export const consultarHooks = (proyectoId: string) => pedir<EstadoDeHooks>(`${ruta(proyectoId)}/anuncio/guion`);

/** **Gasta**: lleva la estimación confirmada, su sello y la clave de idempotencia que generó el navegador. */
export const pedirHooks = (
  proyectoId: string,
  datos: { claveIdempotencia: string; creditosConfirmados: number; selloEstimacion: string; escenas?: number },
) => pedir<PropuestaDeHooks>(`${ruta(proyectoId)}/anuncio/guion`, json("POST", datos));

/** Elegir el hook no cuesta nada: los cinco ya se pagaron al proponerlos y esto es una edición del guion. */
export const aplicarHook = (proyectoId: string, hook: HookPropuesto) =>
  pedir<HookAplicado>(`${ruta(proyectoId)}/anuncio/hook`, json("POST", hook));

// ── Variantes por ángulo ────────────────────────────────────────────────────────────────────────────────

/** Lo que la pantalla necesita para pintar la tanda: ángulos elegibles, coste de una y hermanos que ya hay. */
export interface EstadoDeVariantes extends EstimacionDeVariantes {
  maximo: number;
  hermanos: { id: string; titulo: string; angulo: string }[];
}

export const consultarVariantes = (proyectoId: string) =>
  pedir<EstadoDeVariantes>(`${ruta(proyectoId)}/anuncio/variantes`);

/** **Gasta**, con una sola confirmación agregada para toda la tanda. */
export const crearVariantes = (
  proyectoId: string,
  datos: {
    angulos: string[];
    claveIdempotencia: string;
    creditosConfirmados: number;
    selloEstimacion: string;
    declaraVeracidad?: boolean;
  },
) => pedir<VariantesCreadas>(`${ruta(proyectoId)}/anuncio/variantes`, json("POST", datos));

// ── El veredicto del ángulo ─────────────────────────────────────────────────────────────────────────────

/** Lo que se ha podido comprobar del ángulo, con el motivo de lo que no. */
export interface VeredictoDelAngulo {
  decision: DecisionVista | null;
  motivo: string;
}

/** Se pide **a mano**: ni la pantalla ni el guardado lo disparan solos (0.24.0). */
export const comprobarAngulo = (proyectoId: string) =>
  pedir<VeredictoDelAngulo>(`${ruta(proyectoId)}/anuncio/angulo-fiel`, { method: "POST" });

/** Dice si el veredicto tiene razón o se equivoca: es la única etiqueta con la que se mide su acierto. */
export const corregirAngulo = (proyectoId: string, decisionId: string, correccion: "acierta" | "se_equivoca") =>
  pedir<VeredictoDelAngulo>(
    `${ruta(proyectoId)}/anuncio/angulo-fiel/correccion`,
    json("PATCH", { decisionId, correccion }),
  );
