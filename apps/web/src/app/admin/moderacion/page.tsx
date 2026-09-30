import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Alerta } from "@/components/ui/alerta";
import { GestionRetos } from "@/components/ui/comunidad/formulario-reto";
import { Moderar } from "@/components/ui/comunidad/moderar";
import { TarjetaPublicacion } from "@/components/ui/comunidad/tarjeta-publicacion";
import { EstadoVacio } from "@/components/ui/feedback";
import { leerAjustes } from "@/server/ajustes";
import { exigirAdmin } from "@/server/auth/sesion";
import { colaDeModeracion } from "@/server/comunidad/consulta";
import { listarRetos } from "@/server/comunidad/retos";
import { db } from "@/server/db/cliente";
import { promptTemplates } from "@/server/db/esquema";

export const metadata: Metadata = { title: "Moderación · Admin" };
export const dynamic = "force-dynamic";

/**
 * Moderación previa de la comunidad: la cola de pendientes con su vista previa y su elegibilidad comprobada otra vez,
 * aprobar o rechazar con motivo, retirar lo aprobado y gestionar los retos. Nadie modera lo suyo.
 */
export default async function PaginaModeracion() {
  const sesion = await exigirAdmin("/admin/moderacion");
  const actor = { id: sesion.user.id, esAdmin: true };
  const [{ pendientes, aprobadas }, retos, ajustes, plantillas] = await Promise.all([
    colaDeModeracion(actor),
    listarRetos({ todos: true }),
    leerAjustes(),
    db()
      .select({ id: promptTemplates.id, nombre: promptTemplates.name })
      .from(promptTemplates)
      .where(and(isNull(promptTemplates.ownerId), eq(promptTemplates.active, true)))
      .orderBy(promptTemplates.sortOrder),
  ]);
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Moderación</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Nada de la comunidad se ve sin tu aprobación. Aprobar vuelve a comprobar que el original sigue siendo
          sintético; rechazar o retirar pide un motivo que leerá el autor. No puedes moderar tus propias publicaciones.
        </p>
      </div>
      {!ajustes.comunidadActiva && (
        <Alerta tipo="info" anuncio="ninguno" titulo="La comunidad está apagada">
          Nadie puede publicar ni ver la galería. Se enciende en Admin › Ajustes › Comunidad.
        </Alerta>
      )}

      <section aria-labelledby="pendientes" className="flex flex-col gap-4">
        <h2 id="pendientes" className="text-2xl font-bold text-texto">
          Pendientes ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <EstadoVacio titulo="No hay nada pendiente" texto="Cuando alguien publique algo, aparecerá aquí." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pendientes.map((p) => (
              <TarjetaPublicacion
                key={p.id}
                publicacion={p}
                estado={p.estado}
                todasLasImagenes
                pie={<Moderar publicacion={p} />}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="aprobadas" className="flex flex-col gap-4">
        <h2 id="aprobadas" className="text-2xl font-bold text-texto">
          Publicadas ({aprobadas.length})
        </h2>
        {aprobadas.length === 0 ? (
          <p className="text-texto-suave">Todavía no se ha aprobado nada.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {aprobadas.map((p) => (
              <TarjetaPublicacion key={p.id} publicacion={p} estado={p.estado} pie={<Moderar publicacion={p} />} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="retos" className="flex flex-col gap-4">
        <h2 id="retos" className="text-2xl font-bold text-texto">
          Retos
        </h2>
        <GestionRetos retos={retos} plantillas={plantillas} />
      </section>
    </main>
  );
}
