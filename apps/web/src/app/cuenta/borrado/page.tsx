import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { ExportarProyecto } from "@/components/ui/datos/exportar-proyecto";
import { Aviso } from "@/components/ui/feedback";
import { fechaLarga } from "@/lib/fechas";
import { exigirSesion, RUTA_BORRADO_PROGRAMADO } from "@/server/auth/sesion";
import { borradoAbiertoDe } from "@/server/datos/borrado-cuenta";
import { db } from "@/server/db/cliente";
import { projects } from "@/server/db/esquema";
import { CabeceraApp } from "../../_app/cabecera-app";
import { CerrarSesion } from "../../_app/cerrar-sesion";
import { CancelarBorrado } from "./cancelar-borrado";

export const metadata: Metadata = { title: "Borrado de la cuenta programado" };
export const dynamic = "force-dynamic";

/**
 * Lo único que ve una cuenta con el borrado programado: cuándo se borra y el botón para cancelarlo. Sin borrado
 * programado, esta página no tiene sentido y lleva a la cuenta.
 */
export default async function PaginaBorradoProgramado() {
  const sesion = await exigirSesion(RUTA_BORRADO_PROGRAMADO);
  const borrado = await borradoAbiertoDe(sesion.user.id);
  if (!borrado) redirect("/cuenta");
  const proyectos = await db()
    .select({ id: projects.id, titulo: projects.title })
    .from(projects)
    .where(eq(projects.userId, sesion.user.id))
    .orderBy(projects.createdAt);
  // Pasado el plazo y aún sin empezar: se dice por qué espera (sin datos de nadie; lo escribe el worker).
  const [{ sinRespuesta, estimados } = { sinRespuesta: 0, estimados: 0 }] = (await db().execute(sql`
    select count(*)::int as "sinRespuesta", coalesce(sum(estimated_credits), 0)::float8 as estimados
    from generation_jobs where user_id = ${sesion.user.id} and state = 'desconocido'
  `)) as unknown as { sinRespuesta: number; estimados: number }[];
  const aplazado = borrado.state === "programado" && borrado.scheduledFor < new Date() && borrado.lastError !== "";

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 md:px-8">
        <h1 className="text-4xl font-bold text-texto">Tu cuenta se va a borrar</h1>
        {borrado.state === "programado" ? (
          <>
            <Aviso tono="aviso">
              Pediste borrar tu cuenta el {fechaLarga(borrado.requestedAt)}. Se borrará todo a partir del{" "}
              {fechaLarga(borrado.scheduledFor)}. Hasta entonces está desactivada: no puedes usar Escenara, pero sí
              arrepentirte: cancélalo aquí o restablece tu contraseña (restablecerla también lo cancela).
            </Aviso>
            {aplazado && (
              <Aviso tono="aviso">
                El plazo ya ha pasado, pero el borrado está esperando: {borrado.lastError} Lo vuelve a intentar solo; si
                no avanza, díselo a quien administra.
              </Aviso>
            )}
            {sinRespuesta > 0 && (
              <Aviso tono="info">
                Tienes {sinRespuesta} {sinRespuesta === 1 ? "trabajo" : "trabajos"} sin respuesta del proveedor (
                {Number(estimados).toLocaleString("es-ES", { maximumFractionDigits: 1 })} créditos estimados). El
                proveedor no respondió; el coste es una estimación no confirmada. El borrado los espera unos días más;
                si siguen sin respuesta, ese coste estimado queda apuntado como no confirmado y el borrado sigue.
              </Aviso>
            )}
            <CancelarBorrado />
          </>
        ) : (
          <Aviso tono="info">
            El borrado ya ha empezado y no se puede cancelar: tus datos se están borrando ahora mismo.
          </Aviso>
        )}
        {proyectos.length > 0 && (
          <section aria-labelledby="llevate-tus-proyectos" className="flex flex-col gap-3">
            <h2 id="llevate-tus-proyectos" className="text-xl font-bold text-texto">
              Llévate tus proyectos
            </h2>
            <p className="text-texto-suave">
              Puedes pedir y descargar el ZIP de cada proyecto hasta que se borre la cuenta. Nada de esto cuesta
              créditos.
            </p>
            <ul className="flex flex-col gap-3">
              {proyectos.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
                  <span className="font-semibold text-texto">{p.titulo || "Sin título"}</span>
                  <ExportarProyecto proyectoId={p.id} compacto />
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/cuenta/historial" className={claseBoton("secundario", "sm")}>
            Ver tu historial
          </Link>
          <CerrarSesion />
        </div>
      </main>
    </div>
  );
}
