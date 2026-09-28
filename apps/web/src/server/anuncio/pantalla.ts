import type { AnguloVista, BriefVista, OfertaVista } from "@/lib/anuncio";
import { HOOKS_PEDIDOS } from "@/lib/anuncio-guion";
import type { DecisionVista, ModoCoherencia } from "@/lib/coherencia";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { anguloFielGuardadoDe } from "../coherencia/anuncio";
import type { EstimacionDeTexto } from "../mapa/texto";
import type { Actor } from "../media/servicio";
import { listarProductos } from "../productos/consulta";
import { obtenerBrief } from "./brief";
import { listarAngulos } from "./catalogo";
import { estimacionDeHooksYGuion } from "./guion";
import { listarOfertas } from "./ofertas";
import { type PuertaDelGuion, puedePedirGuion } from "./puerta-guion";

/**
 * Todo lo que la **pantalla del brief** necesita para pintarse de una vez (0.27.0), leído en el servidor al abrir
 * el proyecto.
 *
 * Se resuelve aquí y no con llamadas del navegador al montar por una razón concreta: la pantalla no tiene ningún
 * `useEffect` que dispare peticiones, así que lo que se ve en el primer pintado ya es lo real —el brief, el
 * catálogo, la puerta y el precio— y no un esqueleto que parpadea.
 *
 * Es **solo lectura**: no crea el brief, no llama a ningún proveedor, no reserva nada y no gasta ni un token. Lo
 * que sí hace es traer el precio de la entrada principal del mapa del usuario para poder enseñarlo antes de
 * confirmar, que es la regla de la casa con cualquier botón que gaste.
 *
 * Lo que **no** viene de aquí: las variantes y el veredicto nuevo del ángulo. Las variantes exigen el ajuste
 * encendido y un brief completo, y el veredicto cuesta tope diario de Jev, así que los dos se piden a mano desde
 * su botón. De Jev sí viene el **último veredicto ya guardado**, que no comprueba nada nuevo.
 */
export interface DatosDelAnuncio {
  /** `false` cuando quien administra ha apagado el brief: la pantalla lo dice y no ofrece nada. */
  activo: boolean;
  variantesActivas: boolean;
  /** `null` = proyecto sin brief, que es el camino de antes de esta versión y no un error. */
  brief: BriefVista | null;
  angulos: AnguloVista[];
  ofertas: OfertaVista[];
  /** Los productos propios, para atar el brief y las ofertas a uno. Solo nombre: la ficha vive en «Productos». */
  productos: { id: string; nombre: string }[];
  puerta: PuertaDelGuion;
  estimacion: EstimacionDeTexto;
  hooksPedidos: number;
  /** El último veredicto del ángulo, si ya se pidió alguna vez. `null` = todavía no se ha comprobado. */
  anguloFiel: DecisionVista | null;
  /** Modo de `angulo_fiel` en esta instalación: en sombra se dice que no decide nada. */
  modoAnguloFiel: ModoCoherencia;
}

export async function datosDelAnuncio(actor: Actor, proyectoId: string): Promise<DatosDelAnuncio> {
  const [ajustes, brief, angulos, ofertas, productos, puerta, estimacion, anguloFiel] = await Promise.all([
    leerAjustes(),
    obtenerBrief(actor, proyectoId),
    listarAngulos(),
    listarOfertas(actor),
    listarProductos(actor),
    puedePedirGuion(proyectoId),
    estimacionDeHooksYGuion(actor.id),
    anguloFielGuardadoDe(actor, proyectoId),
  ]);
  return {
    activo: ajustes.anuncioBriefActivo,
    // Variar exige un brief del que variar, así que con el brief apagado esto no ofrece nada aunque esté encendido.
    variantesActivas: ajustes.anuncioBriefActivo && ajustes.anuncioVariantesActivas,
    brief,
    angulos,
    ofertas,
    productos: productos.map((p) => ({ id: p.id, nombre: p.nombre })),
    puerta,
    estimacion,
    hooksPedidos: HOOKS_PEDIDOS,
    anguloFiel,
    modoAnguloFiel: coherenciaDe(ajustes, "angulo_fiel").modo,
  };
}
