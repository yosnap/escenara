import sharp from "sharp";
import type { LugarVista } from "@/lib/lugares";
import type { Actor } from "../media/servicio";
import { crearMedio } from "../media/servicio";
import { declararLugar } from "./declaracion";
import { anadirFotosAlLugar, crearLugar } from "./servicio";

/**
 * Lugares de prueba para los tests de integración: una foto generada en memoria (sin red ni proveedor), subida a
 * la biblioteca del usuario como cualquier otra, marcada como maestra y con su declaración. No se usa en producción.
 */

/** Una imagen PNG con ruido: pasa los controles de la biblioteca como una foto de verdad. */
export async function fotoDePrueba(ancho = 640, alto = 640): Promise<Uint8Array<ArrayBuffer>> {
  const datos = await sharp({
    create: {
      width: ancho,
      height: alto,
      channels: 3,
      background: "#7a6a5a",
      noise: { type: "gaussian", mean: 120, sigma: 30 },
    },
  })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

export async function subirFotoDePrueba(actor: Actor, nombre: string): Promise<string> {
  return (await crearMedio(actor, new File([await fotoDePrueba()], nombre, { type: "image/png" }))).id;
}

/** Un lugar real con su maestra y, salvo que se pida lo contrario, su declaración vigente. */
export async function lugarDeclaradoDePrueba(
  actor: Actor,
  nombre: string,
  opciones: { declarado?: boolean } = {},
): Promise<{ lugar: LugarVista; maestra: string }> {
  const creado = await crearLugar(actor, {
    nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
    descripcion: "Bar de barrio con azulejos, barra de zinc y un ventanal.",
  });
  const maestra = await subirFotoDePrueba(actor, `${nombre}-maestra.png`);
  let lugar = await anadirFotosAlLugar(actor, creado.id, [{ medioId: maestra, papel: "maestra" }]);
  if (opciones.declarado !== false) {
    lugar = await declararLugar(actor, lugar.id, {
      origenFotos: "propias",
      alcance: "personal",
      espacio: "exterior",
      personasVisibles: "ninguna",
      sinMenores: true,
    });
  }
  return { lugar, maestra };
}
