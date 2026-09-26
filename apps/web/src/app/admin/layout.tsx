import type { ReactNode } from "react";
import { exigirAdmin } from "@/server/auth/sesion";
import paquete from "../../../package.json";
import { CabeceraAdmin } from "./cabecera-admin";

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Admin: exige una sesión con rol de administrador; al resto se le responde como si no existiera. */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await exigirAdmin("/admin/componentes");
  return (
    <div className="min-h-dvh">
      <CabeceraAdmin version={paquete.version} />
      {children}
    </div>
  );
}
