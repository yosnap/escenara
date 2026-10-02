import Link from "next/link";
import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
import { comunidadAdmin } from "@/server/admin/comunidad";
import type { Parametros } from "@/server/admin/filtros";
import { exigirAdmin } from "@/server/auth/sesion";
import { FiltroAdmin } from "../filtro-admin";
import { ErrorAdmin, estiloCampoAdmin, PaginaAdmin, PaginacionAdmin } from "../ui-admin";

export const metadata = { title: "Comunidad · Administración" };
export default async function Comunidad({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirAdmin("/admin/comunidad");
  const p = await searchParams;
  let datos: Awaited<ReturnType<typeof comunidadAdmin>>;
  try {
    datos = await comunidadAdmin(sesion.user.id, p);
  } catch {
    return (
      <PaginaAdmin titulo="Comunidad">
        <ErrorAdmin>No se ha podido consultar comunidad. Comprueba el intervalo y vuelve a intentarlo.</ErrorAdmin>
      </PaginaAdmin>
    );
  }
  return (
    <PaginaAdmin titulo="Comunidad">
      <form action="/admin/comunidad" className="flex flex-wrap items-end gap-3">
        <FiltroAdmin
          nombre="estado"
          etiqueta="Estado"
          valor={typeof p.estado === "string" ? p.estado : ""}
          opciones={["pendiente", "aprobada", "rechazada"]}
        />
        <label>
          Desde UTC
          <input
            type="date"
            name="desde"
            defaultValue={datos.inicio.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <label>
          Hasta (exclusivo)
          <input
            type="date"
            name="hasta"
            defaultValue={datos.fin.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <button type="submit" className={estiloCampoAdmin}>
          Filtrar
        </button>
      </form>
      <p>
        {datos.total} publicaciones · {datos.autores} autores en este intervalo
      </p>
      <Link href="/admin/moderacion" className="text-acento">
        Abrir cola de moderación y retos →
      </Link>
      <TablaDesplazable etiqueta="Publicaciones de comunidad">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-3">
                Título
              </th>
              <th scope="col" className="p-3">
                Estado
              </th>
              <th scope="col" className="p-3">
                Autor
              </th>
              <th scope="col" className="p-3">
                Fecha UTC
              </th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => (
              <tr key={f.id} className="border-t border-borde">
                <td className="break-words p-3">{f.title}</td>
                <td className="p-3">{f.state}</td>
                <td className="break-all p-3">
                  <Link href={`/admin/usuarios/${f.author_id}`} className="text-acento">
                    Ficha del autor
                  </Link>
                </td>
                <td className="p-3">{new Date(f.created_at).toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaDesplazable>
      {!datos.filas.length && <p>Sin publicaciones con estos filtros.</p>}
      <PaginacionAdmin ruta="/admin/comunidad" filtros={p} pagina={datos.pagina} total={datos.total} />
    </PaginaAdmin>
  );
}
