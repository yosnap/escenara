import type { Metadata } from "next";
import { FormularioRecuperar } from "../_componentes/formulario-recuperar";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function PaginaRecuperar() {
  return <FormularioRecuperar />;
}
