import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { rutaSegura } from "@/lib/errores-auth";
import { proveedoresActivos, registroDisponible } from "@/server/auth/auth";
import { obtenerSesion } from "@/server/auth/sesion";
import { FormularioEntrar } from "../_componentes/formulario-entrar";

export const metadata: Metadata = { title: "Entrar · Escenara" };
export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  restablecida: "Contraseña cambiada. Ya puedes entrar con la nueva.",
  cerrada: "Has cerrado la sesión.",
};

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; aviso?: string }>;
}) {
  const { volver, aviso } = await searchParams;
  const destino = rutaSegura(volver);
  if (await obtenerSesion()) redirect(destino);
  return (
    <FormularioEntrar
      volver={destino}
      proveedores={proveedoresActivos()}
      registroAbierto={await registroDisponible()}
      aviso={aviso ? AVISOS[aviso] : undefined}
    />
  );
}
