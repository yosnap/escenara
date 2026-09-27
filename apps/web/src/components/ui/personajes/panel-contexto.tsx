import { FileText, Images } from "lucide-react";
import { ETIQUETA_VISTA } from "@/lib/captura-personaje";
import type { ContextoAplicado } from "@/lib/personajes";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { DistintivoOrigen } from "./distintivo-origen";

/**
 * **Zona de claridad** de lo que se le va a enviar al proveedor: **qué fotos** y de qué versión de la ficha.
 * Superficie neutra, sin degradados y sin animación.
 *
 * Desde la 0.17.0 **no muestra el bloque de contexto** (ADR-0022): el prompt compuesto es material del panel de
 * administración y no sale hacia el navegador. Lo que sí se dice es si la ficha está vacía, porque eso sí lo
 * puede arreglar quien mira la pantalla.
 */
export function PanelContextoPersonaje({ contexto, cargando }: { contexto: ContextoAplicado; cargando?: boolean }) {
  return (
    <section
      aria-label="Contexto que se enviará al modelo"
      aria-busy={cargando}
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-texto">
          <span aria-hidden>
            <FileText className="size-4" />
          </span>
          <span>Esto es lo que se enviará al modelo</span>
        </h3>
        <p className="text-sm text-texto-suave">
          Ficha de «{contexto.nombre}», versión {contexto.versionNumero}
        </p>
      </header>

      <p className="text-sm text-texto-suave">
        {contexto.conContexto
          ? "Se enviarán estas fotos y la descripción de esta versión de su ficha (rasgos, estilo, vestuario y personalidad), que es lo que mantiene la identidad entre escenas."
          : "La ficha de este personaje está vacía, así que solo se envían sus fotos. Rellena la ficha en su pestaña «Ficha» para que la identidad se mantenga entre escenas."}
      </p>

      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <span aria-hidden>
            <Images className="size-4" />
          </span>
          <span>
            {contexto.referencias.length} de las {contexto.maximoDelModelo} fotos que admite este modelo, elegidas por
            cobertura de vistas
          </span>
        </h4>
        <ul className="flex flex-wrap gap-3">
          {contexto.referencias.map((referencia) => (
            <li key={referencia.medioId} className="flex w-24 flex-col gap-1">
              <span className="relative block size-24 overflow-hidden rounded-control border border-borde bg-elevada">
                {referencia.medio && <MiniaturaMedio medio={referencia.medio} />}
                <DistintivoOrigen origen={referencia.origen} sobreImagen className="absolute bottom-1 left-1" />
              </span>
              <span className="text-xs text-texto-suave">
                {referencia.vista ? ETIQUETA_VISTA[referencia.vista] : "Sin clasificar"}
              </span>
            </li>
          ))}
        </ul>
        {contexto.referencias.length === 0 && (
          <p className="text-sm text-texto-suave">Este personaje no tiene ninguna foto utilizable ahora mismo.</p>
        )}
      </div>
    </section>
  );
}
