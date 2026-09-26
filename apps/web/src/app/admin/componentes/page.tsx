import type { Metadata } from "next";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Componentes · Admin · Escenara" };

/** Catálogo de componentes reutilizables (el acceso lo decide el layout del admin). */
export default function PaginaComponentes() {
  return <Catalogo />;
}
