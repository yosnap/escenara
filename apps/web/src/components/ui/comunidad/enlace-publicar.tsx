import { Send } from "lucide-react";
import Link from "next/link";
import { type CandidatoAPublicar, ETIQUETA_ESTADO } from "@/lib/comunidad";
import { claseBoton } from "../button";

/**
 * «Publicar en la comunidad» junto a un original (personaje o archivo), con su elegibilidad explicada: el enlace si se
 * puede, el estado si ya está publicado, o el primer motivo por el que no. Sin JavaScript: lo decide el servidor.
 */
export function EnlacePublicar({ candidato }: { candidato: CandidatoAPublicar }) {
  const parametro = candidato.origen.tipo === "personaje" ? "personaje" : "medio";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-sm">
      <span className="font-semibold text-texto">Comunidad</span>
      {candidato.publicacion ? (
        <Link href="/comunidad#tus-publicaciones" className="text-texto underline">
          {ETIQUETA_ESTADO[candidato.publicacion.estado]}
        </Link>
      ) : candidato.elegibilidad.publicable ? (
        <Link href={`/comunidad/publicar?${parametro}=${candidato.origen.id}`} className={claseBoton("chispa", "sm")}>
          <Send className="size-4" aria-hidden /> Publicar en la comunidad
        </Link>
      ) : (
        <span className="text-texto-suave">No se puede publicar: {candidato.elegibilidad.motivos[0]}</span>
      )}
    </div>
  );
}
