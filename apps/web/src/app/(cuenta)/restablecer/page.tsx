import type { Metadata } from "next";
import { FormularioRestablecer } from "../_componentes/formulario-restablecer";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function PaginaRestablecer({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <FormularioRestablecer token={error ? null : (token ?? null)} />;
}
