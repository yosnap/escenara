import type { Metadata } from "next";
import { FormularioRecuperar } from "../_componentes/formulario-recuperar";

export const metadata: Metadata = { title: "Recuperar contraseña · Escenara" };

export default function PaginaRecuperar() {
  return <FormularioRecuperar />;
}
