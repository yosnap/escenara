import Link from "next/link";
import type { Parametros } from "@/server/admin/filtros";
import { listarUsuarios } from "@/server/admin/usuarios";
import { exigirAdmin } from "@/server/auth/sesion";
import { FiltroAdmin } from "../filtro-admin";
import { ErrorAdmin, estiloCampoAdmin, PaginaAdmin, PaginacionAdmin } from "../ui-admin";
import { AccionesFila, GestorAccionesUsuario } from "./acciones-fila";

export const metadata = { title: "Usuarios · Administración" };
export default async function Usuarios({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirAdmin("/admin/usuarios");
  const p = await searchParams;
  let datos: Awaited<ReturnType<typeof listarUsuarios>>;
  try {
    datos = await listarUsuarios(sesion.user.id, p);
  } catch (error) {
    return (
      <PaginaAdmin titulo="Usuarios">
        <ErrorAdmin>
          {error instanceof Error && /Filtro|Página|parámetros|filtro/.test(error.message)
            ? error.message
            : "No se han podido consultar los usuarios. Recarga para volver a intentarlo."}
        </ErrorAdmin>
      </PaginaAdmin>
    );
  }
  const valor = (clave: string) => (typeof p[clave] === "string" ? p[clave] : "");
  const volver = new URLSearchParams(
    Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string"),
  ).toString();
  const estado = valor("papelera") || "no";
  const vistas = [
    { estado: "no", nombre: "Activos", total: datos.contadores.activos },
    { estado: "si", nombre: "Eliminados", total: datos.contadores.eliminados },
    { estado: "todos", nombre: "Todos", total: datos.contadores.todos },
  ];
  return (
    <PaginaAdmin titulo="Usuarios">
      <nav
        aria-label="Estado de usuarios"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-borde bg-superficie p-1"
      >
        {vistas.map((vista) => {
          const parametros = new URLSearchParams(volver);
          parametros.set("papelera", vista.estado);
          parametros.delete("pagina");
          const activa = estado === vista.estado;
          return (
            <Link
              key={vista.estado}
              href={`/admin/usuarios?${parametros}`}
              aria-current={activa ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-control px-3 py-2 text-sm font-medium ${activa ? "bg-acento text-sobre-acento" : "text-texto-suave hover:bg-fondo hover:text-texto"}`}
            >
              {vista.nombre}
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${activa ? "bg-sobre-acento/15" : "bg-fondo text-texto"}`}
              >
                {vista.total}
              </span>
            </Link>
          );
        })}
      </nav>
      <form className="flex flex-wrap items-end gap-3" action="/admin/usuarios">
        <input type="hidden" name="papelera" value={valor("papelera") || "no"} />
        {typeof p.desde === "string" && <input type="hidden" name="desde" value={p.desde} />}
        {typeof p.hasta === "string" && <input type="hidden" name="hasta" value={p.hasta} />}
        <FiltroAdmin nombre="q" etiqueta="Nombre o correo" valor={valor("q")} />
        <FiltroAdmin nombre="rol" etiqueta="Rol" valor={valor("rol")} opciones={["user", "admin"]} />
        <FiltroAdmin nombre="verificado" etiqueta="Verificado" valor={valor("verificado")} opciones={["si", "no"]} />
        <FiltroAdmin nombre="bloqueado" etiqueta="Bloqueado" valor={valor("bloqueado")} opciones={["si", "no"]} />
        <FiltroAdmin nombre="borrado" etiqueta="En borrado" valor={valor("borrado")} opciones={["si", "no"]} />
        <button type="submit" className={estiloCampoAdmin}>
          Filtrar
        </button>
      </form>
      <GestorAccionesUsuario>
        <TablaDesplazable etiqueta="Datos administrativos">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Usuarios de la instalación</caption>
            <thead>
              <tr>
                {["Cuenta", "Alta (UTC)", "Rol", "Verificación", "Bloqueo", "Borrado", "Acciones"].map((t) => (
                  <th key={t} scope="col" className="p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((u) => (
                <tr key={u.id} className="border-t border-borde">
                  <td className="p-3">
                    <Link
                      className="break-all text-acento"
                      href={`/admin/usuarios/${u.id}?volver=${encodeURIComponent(volver)}`}
                    >
                      {u.name}
                      <br />
                      {u.email}
                    </Link>
                  </td>
                  <td className="p-3">{u.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="p-3">{u.role === "admin" ? "Administrador" : "Usuario"}</td>
                  <td className="p-3">{u.emailVerified ? "Verificado" : "Pendiente"}</td>
                  <td className="p-3">{u.banned ? "Bloqueado" : "Habilitado"}</td>
                  <td className="p-3">{u.eliminado ? "En eliminados" : u.borrado ? "Programado" : "No"}</td>
                  <td className="p-3">
                    <AccionesFila
                      id={u.id}
                      email={u.email}
                      verificado={u.emailVerified}
                      bloqueado={u.banned === true}
                      borrado={u.borrado}
                      eliminado={u.eliminado}
                      definitivo={u.definitivo}
                      elegibleEn={u.elegibleEn ? new Date(u.elegibleEn).toISOString() : null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaDesplazable>
      </GestorAccionesUsuario>
      {datos.filas.length === 0 && <p>No hay usuarios con estos filtros.</p>}
      <PaginacionAdmin ruta="/admin/usuarios" filtros={p} pagina={datos.pagina} total={datos.total} />
    </PaginaAdmin>
  );
}

import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
