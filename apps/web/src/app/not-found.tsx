import type { Metadata } from "next";
import { claseBoton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página no encontrada" };

/**
 * 404 propia, con `main#contenido` (así «Saltar al contenido» lleva a algún sitio) y una salida clara. Es también lo
 * que ve quien no tiene permiso para una página del admin, que se responde como si no existiera.
 *
 * Sin componentes de cliente a propósito (enlaces `<a>` normales, sin logotipo): Next incluye esta página en la carga
 * de **todas** las rutas, y con un componente de cliente cada una descargaría su JavaScript.
 */
export default function PaginaNoEncontrada() {
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-5 py-10 md:px-8"
    >
      <h1 className="text-4xl font-bold text-texto">Esta página no existe</h1>
      <p className="text-texto-suave">
        Puede que el enlace esté mal escrito, que la página se haya borrado o que no tengas acceso a ella.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href="/" className={claseBoton("primario")}>
          Ir a la portada
        </a>
        <a href="/proyectos" className={claseBoton("secundario")}>
          Tus proyectos
        </a>
      </div>
    </main>
  );
}
