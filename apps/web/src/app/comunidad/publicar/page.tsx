import { ArrowLeft, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui/alerta";
import { claseBoton } from "@/components/ui/button";
import { FormularioPublicar } from "@/components/ui/comunidad/formulario-publicar";
import { EtiquetaEstado } from "@/components/ui/comunidad/tarjeta-publicacion";
import { EstadoVacio } from "@/components/ui/feedback";
import type { CandidatoAPublicar } from "@/lib/comunidad";
import { leerAjustes } from "@/server/ajustes";
import { exigirSesion } from "@/server/auth/sesion";
import { candidato, candidatos } from "@/server/comunidad/consulta";
import { ErrorComunidad } from "@/server/comunidad/errores";
import { listarRetos } from "@/server/comunidad/retos";
import { CabeceraApp } from "../../_app/cabecera-app";

export const metadata: Metadata = { title: "Publicar en la comunidad" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Publicar: con `?personaje=` o `?medio=`, el formulario de ese original (o por qué no se puede); sin nada, tus
 * personajes y tus últimos resultados con su elegibilidad. Nada se publica solo: **tú eliges cada elemento**.
 */
export default async function PaginaPublicar({
  searchParams,
}: {
  searchParams: Promise<{ personaje?: string; medio?: string }>;
}) {
  const sesion = await exigirSesion("/comunidad/publicar");
  const actor = { id: sesion.user.id, esAdmin: sesion.user.role === "admin" };
  const { personaje, medio } = await searchParams;
  const ajustes = await leerAjustes();
  const origen =
    personaje && UUID.test(personaje)
      ? ({ tipo: "personaje", id: personaje } as const)
      : medio && UUID.test(medio)
        ? ({ tipo: "medio", id: medio } as const)
        : null;
  let elegido: CandidatoAPublicar | null = null;
  let noEncontrado = false;
  if (origen) {
    elegido = await candidato(actor, origen).catch((error: unknown) => {
      if (error instanceof ErrorComunidad && error.estado === 404) {
        noEncontrado = true;
        return null;
      }
      throw error;
    });
  }
  const lista = !origen && ajustes.comunidadActiva ? await candidatos(actor) : [];
  const retos = ajustes.comunidadActiva ? (await listarRetos()).map((r) => ({ id: r.id, titulo: r.titulo })) : [];

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <Link href="/comunidad" className={claseBoton("fantasma", "sm", "self-start")}>
          <ArrowLeft className="size-4" aria-hidden /> Comunidad
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-texto">Publicar en la comunidad</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            Solo se publica contenido sintético: un personaje inventado o algo generado con él, sin fotos, voces ni
            lugares reales. Lo decides tú, elemento a elemento; lo que uses para tu marketing sigue privado.
          </p>
        </div>

        {!ajustes.comunidadActiva ? (
          <Alerta tipo="info" anuncio="ninguno" titulo="La comunidad está apagada en esta instalación">
            No se puede publicar mientras quien administra no la encienda.
          </Alerta>
        ) : (
          <>
            <section
              aria-labelledby="normas"
              className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4"
            >
              <h2 id="normas" className="text-lg font-bold text-texto">
                Normas de publicación
              </h2>
              <ul className="list-disc pl-5 text-texto">
                {ajustes.comunidadNormas
                  .split("\n")
                  .map((n) => n.trim())
                  .filter(Boolean)
                  .map((norma) => (
                    // Las normas de la instalación: una lista de contenido, no un aviso.
                    <li key={`norma-${norma}`}>{norma}</li>
                  ))}
              </ul>
            </section>

            {noEncontrado && (
              <Alerta tipo="error" titulo="No lo encontramos">
                Ese original no existe o no es tuyo. Elige uno de la lista.
              </Alerta>
            )}

            {elegido && (
              <section aria-labelledby="elegido" className="flex flex-col gap-4">
                <h2 id="elegido" className="text-2xl font-bold text-texto">
                  {elegido.nombre}
                </h2>
                {elegido.publicacion ? (
                  <Alerta tipo="info" anuncio="ninguno" titulo="Ya lo has publicado">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      Estado: <EtiquetaEstado estado={elegido.publicacion.estado} />
                      <Link href="/comunidad#tus-publicaciones" className="font-semibold underline">
                        Ver en tus publicaciones
                      </Link>
                    </span>
                  </Alerta>
                ) : elegido.elegibilidad.publicable ? (
                  <FormularioPublicar candidato={elegido} retos={retos} firmaSugerida={sesion.user.name ?? ""} />
                ) : (
                  <Alerta tipo="bloqueo" anuncio="ninguno" titulo="No se puede publicar">
                    {elegido.elegibilidad.motivos.join(" ")}
                  </Alerta>
                )}
              </section>
            )}

            {!origen && (
              <section aria-labelledby="candidatos" className="flex flex-col gap-4">
                <h2 id="candidatos" className="text-2xl font-bold text-texto">
                  Qué puedes publicar
                </h2>
                {lista.length === 0 ? (
                  <EstadoVacio
                    titulo="Nada que publicar todavía"
                    texto="Crea un personaje inventado y genera algo con él: aparecerá aquí."
                    icono={<Send />}
                  />
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {lista.map((c) => (
                      <li
                        key={`${c.origen.tipo}-${c.origen.id}`}
                        className="flex gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
                      >
                        {c.miniatura &&
                          (c.miniatura.tipo === "video" ? (
                            <span className="flex size-16 shrink-0 items-center justify-center rounded-control bg-elevada text-xs text-texto-suave">
                              Clip
                            </span>
                          ) : (
                            // biome-ignore lint/performance/noImgElement: miniatura propia servida por la ruta de la biblioteca
                            <img
                              src={c.miniatura.url}
                              alt=""
                              className="size-16 shrink-0 rounded-control bg-elevada object-cover"
                            />
                          ))}
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-semibold text-texto">
                            {c.origen.tipo === "personaje" ? "Personaje" : "Archivo"}: {c.nombre}
                          </span>
                          {c.publicacion ? (
                            <EtiquetaEstado estado={c.publicacion.estado} />
                          ) : c.elegibilidad.publicable ? (
                            <Link
                              href={`/comunidad/publicar?${c.origen.tipo}=${c.origen.id}`}
                              className={claseBoton("chispa", "sm", "self-start")}
                            >
                              Publicar
                            </Link>
                          ) : (
                            <p className="text-sm text-texto-suave">No publicable: {c.elegibilidad.motivos[0]}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
