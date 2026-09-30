import { Download, Send, Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui/alerta";
import { claseBoton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { AccionesPublicacion } from "@/components/ui/comunidad/acciones-publicacion";
import { BotonUsar } from "@/components/ui/comunidad/boton-usar";
import { Celebracion } from "@/components/ui/comunidad/celebracion";
import { ListaLogros } from "@/components/ui/comunidad/logros";
import { TarjetaPublicacion } from "@/components/ui/comunidad/tarjeta-publicacion";
import { EstadoVacio } from "@/components/ui/feedback";
import { ETIQUETA_TIPO, esTipoPublicacion, fechaCorta, TIPOS_PUBLICACION } from "@/lib/comunidad";
import { leerAjustes } from "@/server/ajustes";
import { exigirSesion } from "@/server/auth/sesion";
import { galeria, misPublicaciones } from "@/server/comunidad/consulta";
import { logrosDe, reconocerLogros } from "@/server/comunidad/logros";
import { listarRetos } from "@/server/comunidad/retos";
import { CabeceraApp } from "../_app/cabecera-app";

export const metadata: Metadata = { title: "Comunidad" };
export const dynamic = "force-dynamic";

/**
 * Comunidad: galería de contenido **sintético** aprobado por moderación, retos y logros por hitos reales. Los filtros
 * van por enlaces (sin JavaScript). Con la comunidad apagada solo quedan tus logros y tus publicaciones (para retirarlas).
 */
export default async function PaginaComunidad({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; reto?: string }>;
}) {
  const sesion = await exigirSesion("/comunidad");
  const actor = { id: sesion.user.id, esAdmin: sesion.user.role === "admin" };
  const { tipo: tipoPedido, reto: retoPedido } = await searchParams;
  const tipo = esTipoPublicacion(tipoPedido) ? tipoPedido : null;
  await reconocerLogros(actor.id);
  const ajustes = await leerAjustes();
  const activa = ajustes.comunidadActiva;
  const [retos, publicaciones, mias, logros] = await Promise.all([
    activa ? listarRetos() : Promise.resolve([]),
    galeria({ tipo, reto: retoDeLaUrl(retoPedido) }),
    misPublicaciones(actor),
    logrosDe(actor.id),
  ]);
  const porCelebrar = logros.filter((l) => l.porCelebrar).map((l) => ({ clave: l.clave, titulo: l.titulo }));
  const enlace = (t: string | null) => `/comunidad${t ? `?tipo=${t}` : ""}`;

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <Celebracion porCelebrar={porCelebrar} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Comunidad</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Personajes inventados, clips y ejemplos de trends y plantillas que otras personas de esta instalación han
              querido compartir. Solo contenido sintético, y nada se ve sin pasar antes por moderación.
            </p>
          </div>
          {activa && (
            <Link href="/comunidad/publicar" className={claseBoton("chispa", "sm")}>
              <Send className="size-4" aria-hidden /> Publicar algo
            </Link>
          )}
        </div>

        {!activa && (
          <Alerta tipo="info" anuncio="ninguno" titulo="La comunidad está apagada en esta instalación">
            Quien administra decide si se enciende. Mientras tanto no se ve ni se publica nada; tus logros siguen aquí y
            puedes retirar lo que ya hubieras publicado.
          </Alerta>
        )}

        {activa && (
          <section aria-labelledby="galeria" className="flex flex-col gap-4">
            <h2 id="galeria" className="text-2xl font-bold text-texto">
              Galería
            </h2>
            <nav aria-label="Filtrar la galería">
              <ul className="flex flex-wrap gap-2">
                {[null, ...TIPOS_PUBLICACION].map((t) => (
                  <li key={t ?? "todo"}>
                    <Link
                      href={enlace(t)}
                      aria-current={tipo === t ? "page" : undefined}
                      className={cn(claseBoton(tipo === t ? "primario" : "secundario", "sm"))}
                    >
                      {t ? ETIQUETA_TIPO[t] : "Todo"}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {publicaciones.length === 0 ? (
              <EstadoVacio
                titulo="Todavía no hay nada aquí"
                texto="Cuando alguien publique algo y se apruebe, aparecerá en la galería."
                icono={<Sparkles />}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicaciones.map((p) => (
                  <TarjetaPublicacion
                    key={p.id}
                    publicacion={p}
                    pie={
                      (p.tipo === "trend" || p.tipo === "plantilla") && p.plantilla ? (
                        <BotonUsar id={p.id} tipo={p.tipo} />
                      ) : p.tipo === "personaje" ? (
                        <Link
                          href={`/personajes/nuevo/inventado?inspiracion=${p.id}`}
                          className={claseBoton("secundario", "sm", "self-start")}
                        >
                          Inspirarte en él
                        </Link>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activa && (
          <section aria-labelledby="retos" className="flex flex-col gap-4">
            <h2 id="retos" className="text-2xl font-bold text-texto">
              Retos
            </h2>
            {retos.length === 0 ? (
              <p className="text-texto-suave">No hay ningún reto abierto ahora.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {retos.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-texto">
                      <Trophy className="size-4 text-chispa" aria-hidden /> {r.titulo}
                    </span>
                    {r.descripcion && <p className="text-texto">{r.descripcion}</p>}
                    <p className="text-sm text-texto-suave">
                      Hasta el {fechaCorta(r.hasta)} · {r.participaciones} participación(es) publicadas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/comunidad?reto=${r.id}`} className={claseBoton("secundario", "sm")}>
                        Ver participaciones
                      </Link>
                      {r.plantilla && (
                        <Link href={`/crear?plantilla=${r.plantilla.id}`} className={claseBoton("cobalto", "sm")}>
                          Crear con «{r.plantilla.nombre}»
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="logros" className="flex flex-col gap-4">
          <h2 id="logros" className="text-2xl font-bold text-texto">
            Tus logros
          </h2>
          <ListaLogros logros={logros} />
        </section>

        <section id="tus-publicaciones" aria-labelledby="mias" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="mias" className="text-2xl font-bold text-texto">
              Tus publicaciones
            </h2>
            <a href="/api/comunidad/exportacion" className={claseBoton("fantasma", "sm")}>
              <Download className="size-4" aria-hidden /> Descargar (JSON)
            </a>
          </div>
          {mias.length === 0 ? (
            <p className="text-texto-suave">
              No has publicado nada. Lo que uses para tu marketing sigue siendo privado.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mias.map((p) => (
                <TarjetaPublicacion
                  key={p.id}
                  publicacion={p}
                  estado={p.estado}
                  oculta={p.oculta}
                  pie={
                    <div className="flex flex-col gap-2">
                      {p.estado === "rechazada" && p.motivoRechazo && (
                        <Alerta tipo="aviso" anuncio="ninguno" compacta titulo="Motivo del rechazo">
                          {p.motivoRechazo}
                        </Alerta>
                      )}
                      {p.huerfana && !p.oculta && (
                        <Alerta tipo="info" anuncio="ninguno" compacta>
                          Has borrado el original: esta publicación ya no se ve y se borrará en unos minutos.
                        </Alerta>
                      )}
                      <AccionesPublicacion publicacion={p} />
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const retoDeLaUrl = (v: string | undefined) => (v && UUID.test(v) ? v : null);
