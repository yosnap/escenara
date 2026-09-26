import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Componentes · Admin · Escenara" };

// El acceso se decide al servir la página, no al compilar.
export const dynamic = "force-dynamic";

/** Catálogo de componentes reutilizables. Solo en desarrollo hasta que exista autenticación (0.6.0). */
export default function PaginaComponentes() {
  if (process.env.NODE_ENV === "production" && process.env.ESCENARA_ADMIN_COMPONENTES !== "1") notFound();
  return <Catalogo />;
}
