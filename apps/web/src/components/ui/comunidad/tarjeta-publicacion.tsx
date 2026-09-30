import { Sparkles, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  type EstadoPublicacion,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  fechaCorta,
  type MedioPublicado,
  type PublicacionVista,
} from "@/lib/comunidad";
import { cn } from "../cn";

/**
 * Tarjeta de una publicación de la comunidad. Solo pinta lo que viene en la vista (lista blanca de campos del servidor).
 * El clip no arranca solo: `preload="none"`, silenciado y con controles. Siempre dice que es contenido sintético.
 */

const TONO_ESTADO: Record<EstadoPublicacion, string> = {
  pendiente: "border-aviso/60 bg-aviso/10 text-texto",
  aprobada: "border-correcto/60 bg-correcto/10 text-texto",
  rechazada: "border-error/60 bg-error/10 text-texto",
};

export function EtiquetaEstado({ estado }: { estado: EstadoPublicacion }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", TONO_ESTADO[estado])}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export function VistaMedioPublicado({ medio, titulo }: { medio: MedioPublicado; titulo: string }) {
  const proporcion = medio.ancho && medio.alto ? `${medio.ancho} / ${medio.alto}` : "9 / 16";
  return medio.tipo === "video" ? (
    <video
      src={medio.url}
      controls
      muted
      playsInline
      preload="none"
      aria-label={medio.alt || titulo}
      className="max-h-96 w-full rounded-control bg-elevada object-contain"
      style={{ aspectRatio: proporcion }}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: la copia se sirve por una ruta propia con permisos, fuera del optimizador
    <img
      src={medio.url}
      alt={medio.alt || titulo}
      loading="lazy"
      className="max-h-96 w-full rounded-control bg-elevada object-contain"
      style={{ aspectRatio: proporcion }}
    />
  );
}

export function TarjetaPublicacion({
  publicacion,
  estado,
  pie,
  todasLasImagenes = false,
}: {
  publicacion: PublicacionVista;
  /** Solo para el autor y quien modera: el estado de moderación. */
  estado?: EstadoPublicacion;
  pie?: ReactNode;
  todasLasImagenes?: boolean;
}) {
  const medios = todasLasImagenes ? publicacion.medios : publicacion.medios.slice(0, 1);
  return (
    <article className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-elevada px-2.5 py-0.5 text-xs font-semibold text-texto">
          {ETIQUETA_TIPO[publicacion.tipo]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-elevada px-2.5 py-0.5 text-xs font-semibold text-texto">
          <Sparkles className="size-3.5 text-chispa" aria-hidden /> Contenido sintético
        </span>
        {estado && <EtiquetaEstado estado={estado} />}
      </div>
      <div className={cn("grid gap-2", medios.length > 1 && "grid-cols-2")}>
        {medios.map((m) => (
          <VistaMedioPublicado key={m.url} medio={m} titulo={publicacion.titulo} />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-texto">{publicacion.titulo}</h3>
        <p className="text-sm text-texto-suave">
          Por <span className="font-semibold text-texto">{publicacion.firma}</span>
          {publicacion.publicadaEl && <> · {fechaCorta(publicacion.publicadaEl)}</>}
        </p>
        {publicacion.descripcion && <p className="whitespace-pre-line text-texto">{publicacion.descripcion}</p>}
      </div>
      {(publicacion.plantilla || publicacion.reto || publicacion.usos > 0) && (
        <ul className="flex flex-wrap gap-3 text-sm text-texto-suave">
          {publicacion.plantilla && (
            <li>
              {publicacion.tipo === "trend" ? "Trend" : "Plantilla"}:{" "}
              <span className="font-semibold text-texto">{publicacion.plantilla.nombre}</span>
            </li>
          )}
          {publicacion.reto && (
            <li className="inline-flex items-center gap-1">
              <Trophy className="size-4" aria-hidden /> {publicacion.reto.titulo}
            </li>
          )}
          {publicacion.usos > 0 && (
            <li className="inline-flex items-center gap-1">
              <Users className="size-4" aria-hidden /> {publicacion.usos}{" "}
              {publicacion.usos === 1 ? "persona la ha usado" : "personas la han usado"}
            </li>
          )}
        </ul>
      )}
      {pie}
    </article>
  );
}
