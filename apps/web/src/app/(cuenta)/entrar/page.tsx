import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { rutaSegura } from "@/lib/errores-auth";
import { proveedoresActivos, registroDisponible } from "@/server/auth/auth";
import { obtenerSesionVerificada } from "@/server/auth/sesion";
import { FormularioEntrar } from "../_componentes/formulario-entrar";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  restablecida: "Contraseña cambiada. Ya puedes entrar con la nueva.",
  cerrada: "Has cerrado la sesión.",
  necesaria:
    "Inicia sesión para continuar. Si ya habías entrado, tu sesión ha caducado o se ha cerrado. Los trabajos enviados siguen en la cola.",
};

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; aviso?: string }>;
}) {
  const { volver, aviso } = await searchParams;
  const destino = rutaSegura(volver);
  if (await obtenerSesionVerificada()) redirect(destino);
  return (
    <FormularioEntrar
      volver={destino}
      proveedores={await proveedoresActivos()}
      registroAbierto={await registroDisponible()}
      aviso={aviso ? AVISOS[aviso] : undefined}
      tonoAviso={aviso === "necesaria" ? "aviso" : "correcto"}
    />
  );
}
