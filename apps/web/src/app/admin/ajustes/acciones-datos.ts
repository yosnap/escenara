"use server";

import { exigirAdmin } from "@/server/auth/sesion";
import { reintentarObjetosFallidos } from "@/server/datos/borrado-de-objetos";

/** Vuelve a intentar borrar los archivos que agotaron sus intentos. Solo quien administra. */
export async function reintentarArchivosFallidos(): Promise<{ reintentados: number }> {
  await exigirAdmin("/admin/ajustes");
  return { reintentados: await reintentarObjetosFallidos() };
}
