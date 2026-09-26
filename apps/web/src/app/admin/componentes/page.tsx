import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDisponible } from "@/server/acceso";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Componentes · Admin · Escenara" };

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Catálogo de componentes reutilizables. Solo en desarrollo hasta que exista autenticación (0.7.0). */
export default function PaginaComponentes() {
  if (!adminDisponible()) notFound();
  return <Catalogo />;
}
