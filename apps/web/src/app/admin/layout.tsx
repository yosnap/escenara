import type { ReactNode } from "react";
import { exigirAdmin } from "@/server/auth/sesion";
import { contarTrabajosEnRevision } from "@/server/cola/revision";
import paquete from "../../../package.json";
import { CabeceraAdmin } from "./cabecera-admin";

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Admin: exige una sesión con rol de administrador; al resto se le responde como si no existiera. */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await exigirAdmin("/admin/componentes");
  // Los trabajos pendientes de revisión retienen presupuesto de alguien, así que se ven desde cualquier página
  // del panel y no solo si a quien administra se le ocurre entrar en «Trabajos».
  const enRevision = await contarTrabajosEnRevision().catch(() => 0);
  return (
    <div className="min-h-dvh">
      <CabeceraAdmin version={paquete.version} enRevision={enRevision} />
      {children}
    </div>
  );
}
