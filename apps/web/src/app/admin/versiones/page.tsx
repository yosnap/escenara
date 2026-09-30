import { History } from "lucide-react";
import type { Metadata } from "next";
import { EstadoVacio } from "@/components/ui/feedback";
import { leerVersiones } from "@/server/changelog";
import { TarjetaVersion } from "./tarjeta-version";

export const metadata: Metadata = { title: "Versiones · Admin" };

/** Historial de versiones publicado en `docs/CHANGELOG.md`. */
export default async function PaginaVersiones() {
  const versiones = await leerVersiones();
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Historial de versiones</h1>
        <p className="mt-2 max-w-2xl text-texto-suave">
          Qué ha cambiado en cada versión de Escenara, de la más reciente a la más antigua. Se genera a partir del
          registro de cambios del proyecto.
        </p>
      </div>
      {versiones && versiones.length > 0 ? (
        <ol className="flex flex-col gap-5">
          {versiones.map((v, i) => (
            <li key={v.version}>
              <TarjetaVersion version={v} actual={i === versiones.findIndex((x) => x.fecha !== null)} />
            </li>
          ))}
        </ol>
      ) : (
        <EstadoVacio
          nivel={2}
          icono={<History />}
          titulo="Historial no disponible"
          texto="No se encuentra docs/CHANGELOG.md en este servidor."
        />
      )}
    </main>
  );
}
