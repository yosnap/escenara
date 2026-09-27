import { FileText, Images } from "lucide-react";
import { ETIQUETA_VISTA } from "@/lib/captura-personaje";
import type { ContextoAplicado } from "@/lib/personajes";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { DistintivoOrigen } from "./distintivo-origen";

/**
 * **Zona de claridad** de lo que se le va a enviar al proveedor: el bloque de contexto que sale de la ficha y
 * las fotos elegidas, con su vista. Superficie neutra, sin degradados y sin animación: aquí no se decora nada,
 * se lee lo que se envía antes de confirmarlo (petición del propietario, 2026-09-27).
 *
 * El contenido lo compone **el servidor** a partir de la versión citada; esto solo lo muestra tal cual.
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

      {contexto.contexto === "" ? (
        <p className="text-sm text-texto-suave">
          La ficha de este personaje está vacía, así que al prompt no se le añade ningún contexto: solo se envían sus
          fotos. Rellena la ficha en su pestaña «Ficha» para que la identidad se mantenga entre escenas.
        </p>
      ) : (
        <p className="rounded-control border border-borde bg-fondo p-3 font-mono text-sm whitespace-pre-line text-texto">
          {contexto.contexto}
        </p>
      )}

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
