import type { HechosModelo, HechosProducto } from "./contrato";

const fotos = (n: number) => (n === 1 ? "1 foto" : `${n} fotos`);
const verbo = (n: number) => (n === 1 ? "se queda" : "se quedan");

/**
 * Motivo del aviso «las referencias no caben», **con las cifras**: cuántas referencias admite el modelo, cuántas
 * fotos viajan de cada uno y cuántas se quedan fuera. Saber que «algunas se quedan fuera» no permite decidir si
 * compensa; saber que se pierden dos del producto, sí.
 *
 * Las cifras salen del mismo reparto que usa el envío (`repartirReferencias`), así que lo que se dice es lo que
 * se manda.
 */
export function motivoReferenciasNoCaben(modelo: HechosModelo | undefined, producto: HechosProducto): string {
  const nombre = modelo?.nombre ?? "Este modelo";
  const r = producto.referencias;
  const admite = r?.cupo ?? modelo?.maximoReferencias ?? 1;
  const cabecera = `${nombre} admite ${admite} ${admite === 1 ? "referencia" : "referencias"}`;
  if (!r) return `${cabecera}, y entre el personaje y «${producto.nombre}» hay más: algunas se quedan fuera.`;
  const sobranDelProducto = Math.max(0, r.fotosProducto - r.producto);
  const sobranDelPersonaje = Math.max(0, r.fotosPersonaje - r.personaje);
  const delPersonaje = r.personaje === 1 ? "1 foto del personaje" : `${r.personaje} del personaje`;
  const queSeEnvia = `${r.personaje === 1 ? "se envía" : "se envían"} ${delPersonaje} y ${r.producto} de «${producto.nombre}»`;
  const fuera =
    sobranDelProducto > 0 && sobranDelPersonaje > 0
      ? `${fotos(sobranDelProducto)} del producto y ${sobranDelPersonaje} del personaje se quedan fuera`
      : sobranDelProducto > 0
        ? `${fotos(sobranDelProducto)} del producto ${verbo(sobranDelProducto)} fuera`
        : sobranDelPersonaje > 0
          ? `${fotos(sobranDelPersonaje)} del personaje ${verbo(sobranDelPersonaje)} fuera`
          : "";
  return `${cabecera}: ${queSeEnvia}${fuera === "" ? "" : `; ${fuera}`}. Lo que sobra puede salir distinto.`;
}
