import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { adminDisponible } from "@/server/acceso";
import paquete from "../../../package.json";
import { CabeceraAdmin } from "./cabecera-admin";

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Admin: solo en desarrollo, o con `ESCENARA_ADMIN_COMPONENTES=1`, hasta que existan cuentas (0.7.0). */
export default function LayoutAdmin({ children }: { children: ReactNode }) {
  if (!adminDisponible()) notFound();
  return (
    <div className="min-h-dvh">
      <CabeceraAdmin version={paquete.version} />
      {children}
    </div>
  );
}
