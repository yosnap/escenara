import Link from "next/link";
import type { Parametros } from "@/server/admin/filtros";
import { resumenAdmin } from "@/server/admin/resumen";
import { exigirAdmin } from "@/server/auth/sesion";
import { ErrorAdmin, estiloCampoAdmin, PaginaAdmin } from "./ui-admin";

export const metadata = { title: "Resumen · Administración" };
export default async function Resumen({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirAdmin("/admin");
  const p = await searchParams;
  let datos: Awaited<ReturnType<typeof resumenAdmin>>;
  try {
    datos = await resumenAdmin(sesion.user.id, p);
  } catch {
    return (
      <PaginaAdmin titulo="Resumen">
        <ErrorAdmin>Intervalo inválido o resumen no disponible. Recarga con un intervalo de 1 a 366 días.</ErrorAdmin>
      </PaginaAdmin>
    );
  }
  const [usuarios, trabajos, comunidad, consumo, incidencias] = datos.bloques;
  const fechas = `desde=${datos.inicio.toISOString().slice(0, 10)}&hasta=${datos.fin.toISOString().slice(0, 10)}`;
  return (
    <PaginaAdmin titulo="Resumen operativo">
      <form action="/admin" className="flex flex-wrap gap-3">
        <label>
          Desde (UTC){" "}
          <input
            type="date"
            name="desde"
            defaultValue={datos.inicio.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <label>
          Hasta (exclusivo){" "}
          <input
            type="date"
            name="hasta"
            defaultValue={datos.fin.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <button type="submit" className={estiloCampoAdmin}>
          Consultar
        </button>
      </form>
      <section className="rounded-control border border-borde p-4">
        <h2 className="text-xl font-bold">Incidencias actuales (fuera del intervalo)</h2>
        {incidencias.status === "fulfilled" ? (
          <>
            <p>
              {incidencias.value[0]?.trabajos} trabajos desconocidos · {incidencias.value[0]?.textos} llamadas de texto
              reservadas · {incidencias.value[0]?.revisiones} revisiones reservadas
            </p>
            <p>
              {incidencias.value[0]?.workers
                ? `${incidencias.value[0]?.workers} workers con latido reciente`
                : "No se observa un worker con latido reciente. La cola puede estar detenida."}
            </p>
            <Link href="/admin/trabajos" className="text-acento">
              Revisar trabajos y reservas retenidas →
            </Link>
          </>
        ) : (
          <ErrorAdmin>No se han podido consultar las incidencias.</ErrorAdmin>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded-control border border-borde p-4">
          <h2 className="text-xl font-bold">Usuarios</h2>
          {usuarios.status === "fulfilled" ? (
            <>
              <Link href="/admin/usuarios?papelera=todos" className="block text-acento">
                {usuarios.value[0]?.total} usuarios totales
              </Link>
              <Link href={`/admin/usuarios?${fechas}&papelera=todos`} className="block text-acento">
                {usuarios.value[0]?.nuevos} altas en el intervalo
              </Link>
              <Link href="/admin/usuarios?verificado=no&papelera=todos" className="block text-acento">
                {usuarios.value[0]?.pendientes} pendientes
              </Link>
              <Link href="/admin/usuarios?bloqueado=si&papelera=todos" className="block text-acento">
                {usuarios.value[0]?.bloqueados} bloqueados
              </Link>
            </>
          ) : (
            <ErrorAdmin>No se han podido consultar los usuarios.</ErrorAdmin>
          )}
        </section>
        <section className="space-y-3 rounded-control border border-borde p-4">
          <h2 className="text-xl font-bold">Generaciones</h2>
          {trabajos.status === "fulfilled" ? (
            <>
              {trabajos.value.map((t) => (
                <Link
                  key={t.estado}
                  href={`/admin/consumo?${fechas}&tipo=generacion&estado=${t.estado}`}
                  className="block text-acento"
                >
                  {t.estado}: {t.n}
                </Link>
              ))}
              {!trabajos.value.length && <p>Sin generaciones en el intervalo.</p>}
            </>
          ) : (
            <ErrorAdmin>No se han podido consultar los trabajos.</ErrorAdmin>
          )}
        </section>
        <section className="space-y-3 rounded-control border border-borde p-4">
          <h2 className="text-xl font-bold">Comunidad</h2>
          {comunidad.status === "fulfilled" ? (
            <>
              {comunidad.value.map((c) => (
                <Link
                  key={c.estado}
                  href={`/admin/comunidad?${fechas}&estado=${c.estado}`}
                  className="block text-acento"
                >
                  {c.estado}: {c.n} publicaciones · {c.autores} autores
                </Link>
              ))}
              {!comunidad.value.length && <p>Sin publicaciones en el intervalo.</p>}
              <Link href="/admin/moderacion" className="text-acento">
                Abrir moderación →
              </Link>
            </>
          ) : (
            <ErrorAdmin>No se ha podido consultar comunidad.</ErrorAdmin>
          )}
        </section>
        <section className="space-y-3 rounded-control border border-borde p-4">
          <h2 className="text-xl font-bold">Consumo por proveedor</h2>
          {consumo.status === "fulfilled" ? (
            <>
              {consumo.value.agregados.map((c) => (
                <p key={`${c.proveedor}-${c.nombre}-${c.tipo}`}>
                  {c.nombre || c.proveedor} / {c.tipo}: {c.consumido} consumidos · {c.retenido} retenidos (incidencia)
                </p>
              ))}
              {!consumo.value.agregados.length && <p>Sin movimientos de consumo.</p>}
              <Link href={`/admin/consumo?${fechas}`} className="text-acento">
                Comprobar movimientos →
              </Link>
            </>
          ) : (
            <ErrorAdmin>No se ha podido consultar consumo.</ErrorAdmin>
          )}
        </section>
      </div>
      <p>Analítica externa: No configurada. Los indicadores proceden de la base de datos de Escenara.</p>
    </PaginaAdmin>
  );
}
