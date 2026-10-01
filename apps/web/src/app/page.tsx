import type { Metadata } from "next";
import { obtenerSesion } from "@/server/auth/sesion";
import { obtenerEstrellasRepositorio } from "@/server/repositorio";
import paquete from "../../package.json";
import { BarraPortada, CabeceraPortada } from "./_portada/cabecera";
import { ComoFunciona } from "./_portada/como-funciona";
import { Confianza } from "./_portada/confianza";
import { Escaparate } from "./_portada/escaparate";
import { Pie } from "./_portada/pie";

// Sin `title`: la portada usa el título por defecto del layout, que es el de la marca publicada (o el de Escenara).
export const metadata: Metadata = {
  description:
    "Estudio abierto de personajes y vídeo: crea personajes persistentes desde fotos autorizadas y produce reels escena a escena, con tu propia clave y el gasto bajo control.",
};

export default async function Portada() {
  const [sesion, estrellas] = await Promise.all([obtenerSesion(), obtenerEstrellasRepositorio()]);
  const conSesion = sesion !== null;
  return (
    <>
      {/* «Saltar al contenido» lo pone el layout raíz, igual que en el resto de páginas. */}
      <BarraPortada conSesion={conSesion} estrellas={estrellas} />
      <main id="contenido" tabIndex={-1}>
        <CabeceraPortada />
        <Escaparate />
        <ComoFunciona />
        <Confianza />
      </main>
      <Pie version={paquete.version} />
    </>
  );
}
