import Link from "next/link";
import { notFound } from "next/navigation";
import { type Parametros, usuarioFiltro } from "@/server/admin/filtros";
import { fichaUsuario } from "@/server/admin/usuarios";
import { exigirAdmin } from "@/server/auth/sesion";
import { depositoDe } from "@/server/presupuesto/deposito";
import { PaginaAdmin } from "../../ui-admin";
import { AccionesFila, GestorAccionesUsuario } from "../acciones-fila";
import { FormularioUsuario } from "../formulario-usuario";

export const metadata = { title: "Ficha de usuario · Administración" };
export default async function Ficha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Parametros>;
}) {
  const sesion = await exigirAdmin("/admin/usuarios");
  const { id } = await params;
  try {
    usuarioFiltro({ usuario: id });
  } catch {
    notFound();
  }
  const datos = await fichaUsuario(sesion.user.id, id);
  if (!datos) notFound();
  const u = datos.usuario;
  const presupuesto = await depositoDe(id);
  const p = await searchParams;
  const volver = typeof p.volver === "string" && p.volver.length < 2000 ? new URLSearchParams(p.volver).toString() : "";
  return (
    <PaginaAdmin titulo={u.name}>
      <Link href={`/admin/usuarios?${volver}`} className="text-acento">
        ← Volver a usuarios
      </Link>
      <p className="break-all">
        {u.email} · {u.role} · Alta {u.createdAt.toISOString().slice(0, 10)} (UTC)
      </p>
      {u.eliminado && (
        <p>
          En eliminados. Borrado definitivo disponible desde {u.elegibleEn ? new Date(u.elegibleEn).toISOString() : "—"}
          .
        </p>
      )}
      <p>
        {u.emailVerified ? "Verificado" : "Pendiente"} · {u.banned ? "Bloqueado" : "Habilitado"} ·{" "}
        {u.borrado ? `Borrado programado: ${String(datos.plazo)}` : "Sin borrado programado"}
      </p>
      <p>
        Tope interno: {presupuesto.autorizado ?? "Sin tope"} · Por trabajo: {presupuesto.topeTrabajo ?? "Sin tope"} ·
        Disponible interno: {presupuesto.disponible ?? "Sin tope"} · Reservado: {presupuesto.reservado} · Retenido:{" "}
        {presupuesto.retenido}
      </p>
      <Link href={`/admin/consumo?usuario=${id}`} className="text-acento">
        Consultar generaciones y consumo por proveedor →
      </Link>
      <FormularioUsuario
        id={id}
        email={u.email}
        bloqueado={u.banned === true}
        verificado={u.emailVerified}
        borrado={u.borrado || u.eliminado}
        politica={datos.politica}
        operacionInicial={crypto.randomUUID()}
      />
      <GestorAccionesUsuario>
        <AccionesFila
          id={u.id}
          email={u.email}
          verificado={u.emailVerified}
          bloqueado={u.banned === true}
          borrado={u.borrado}
          eliminado={u.eliminado}
          definitivo={u.definitivo}
          elegibleEn={u.elegibleEn ? new Date(u.elegibleEn).toISOString() : null}
          soloPapelera
        />
      </GestorAccionesUsuario>
      <section>
        <h2 className="mb-3 text-xl font-bold">Correo de activación</h2>
        <p className="text-sm">
          Aceptado indica aceptación SMTP, sin confirmación de entrega. Solicitud sin cierre: resultado incierto.
        </p>
        <ul>
          {datos.correos.map((c) => (
            <li key={c.id}>
              {c.createdAt.toISOString()} · {c.state}
            </li>
          ))}
        </ul>
        {!datos.correos.length && <p>Sin reenvíos administrativos registrados.</p>}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Últimos 50 eventos administrativos</h2>
        <ul className="space-y-2">
          {datos.eventos.map((e) => (
            <li key={e.id} className="break-words">
              {e.createdAt.toISOString()} · {e.action} · {e.result} · {e.reason}
              <p className="text-sm">
                Actor: {e.actorId ?? "Cuenta eliminada"} · Cambios: {JSON.stringify(e.changes)}
              </p>
            </li>
          ))}
        </ul>
        {!datos.eventos.length && <p>Sin eventos administrativos.</p>}
      </section>
    </PaginaAdmin>
  );
}
