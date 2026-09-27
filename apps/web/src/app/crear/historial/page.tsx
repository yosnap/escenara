import { Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { exigirSesion } from "@/server/auth/sesion";
import { avanzarTrabajosDe } from "@/server/generacion/seguimiento-de-fondo";
import { listarTrabajos } from "@/server/generacion/trabajos";
import { CabeceraApp } from "../../_app/cabecera-app";
import { ListaTrabajos } from "./_componentes/lista-trabajos";

export const metadata: Metadata = { title: "Historial de generaciones · Escenara" };
export const dynamic = "force-dynamic";

/** Tiempo que se le da al avance antes de pintar: el bucle de fondo remata lo que quede. */
const MS_MAXIMO_AVANCE = 2500;

/** Espera a la tarea como mucho `ms`; no deja temporizadores colgando. */
async function conPlazo(tarea: Promise<unknown>, ms: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([tarea, new Promise((listo) => (temporizador = setTimeout(listo, ms)))]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Historial de lo generado por quien consulta. Nadie ve los trabajos de otra persona.
 *
 * Al entrar se intenta avanzar lo que se quedó a medias (por cerrar el navegador), pero sin que la página
 * dependa de ello: si el proveedor tarda o la base de datos falla, se pinta la lista guardada.
 */
export default async function PaginaHistorial() {
  const sesion = await exigirSesion("/crear/historial");
  let trabajos: Awaited<ReturnType<typeof listarTrabajos>> = [];
  try {
    await conPlazo(avanzarTrabajosDe(sesion.user.id), MS_MAXIMO_AVANCE);
    trabajos = await listarTrabajos(sesion.user.id);
  } catch (error) {
    // Un fallo aquí no puede dejar la página en un error 500: se muestra lo que se pueda leer.
    console.error(`[generacion] historial degradado: ${error instanceof Error ? error.message : String(error)}`);
    trabajos = await listarTrabajos(sesion.user.id).catch(() => []);
  }
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Historial de generaciones</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Todo lo que has pedido, con su estado real en el proveedor, los créditos y el archivo resultante.
            </p>
          </div>
          <Link href="/crear" className={claseBoton("chispa", "sm")}>
            <Wand2 className="size-4" aria-hidden /> Crear
          </Link>
        </div>
        <ListaTrabajos iniciales={trabajos} />
      </main>
    </div>
  );
}
