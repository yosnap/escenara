import type { Metadata } from "next";
import { ReenviarVerificacion } from "../_componentes/reenviar-verificacion";

export const metadata: Metadata = { title: "Confirma tu correo" };

export default async function PaginaVerificar({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <ReenviarVerificacion emailInicial={email?.slice(0, 320) ?? ""} />;
}
