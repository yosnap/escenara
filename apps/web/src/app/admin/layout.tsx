import Link from "next/link";
import type { ReactNode } from "react";
import { SelectorTema } from "@/components/ui/theme-toggle";
import { exigirAdmin } from "@/server/auth/sesion";
import { contarTrabajosEnRevision } from "@/server/cola/revision";
import paquete from "../../../package.json";
import { AvisoSesion } from "../_app/aviso-sesion";
import { CerrarSesion } from "../_app/cerrar-sesion";
import { MenuAdmin } from "./menu-admin";
import { NavegacionAdmin } from "./navegacion-admin";

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Admin: exige una sesión con rol de administrador; al resto se le responde como si no existiera. */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await exigirAdmin("/admin");
  // Los trabajos pendientes de revisión retienen presupuesto de alguien, así que se ven desde cualquier página
  // del panel y no solo si a quien administra se le ocurre entrar en «Trabajos».
  const enRevision = await contarTrabajosEnRevision().catch(() => null);
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-superficie px-5 py-3">
        <Link href="/admin" className="font-bold">
          Escenara · Administración <span className="text-xs text-texto-suave">{paquete.version}</span>
        </Link>
        <div className="flex items-center gap-3">
          <SelectorTema />
          <CerrarSesion />
        </div>
      </header>
      <AvisoSesion />
      {enRevision === null && (
        <p className="bg-elevada px-5 py-2">No se pudo consultar la revisión de trabajos. Vuelve a intentarlo.</p>
      )}
      {enRevision !== null && enRevision > 0 && (
        <p className="bg-elevada px-5 py-2">
          <Link href="/admin/trabajos">{enRevision} trabajos pendientes de revisión</Link>
        </p>
      )}
      <div className="flex min-w-0 flex-col lg:flex-row">
        <NavegacionAdmin>
          <MenuAdmin />
        </NavegacionAdmin>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
