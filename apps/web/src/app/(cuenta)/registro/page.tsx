import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { proveedoresActivos, registroDisponible } from "@/server/auth/auth";
import { obtenerSesion } from "@/server/auth/sesion";
import { FormularioRegistro } from "../_componentes/formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default async function PaginaRegistro() {
  if (await obtenerSesion()) redirect("/cuenta");
  return <FormularioRegistro proveedores={await proveedoresActivos()} registroAbierto={await registroDisponible()} />;
}
