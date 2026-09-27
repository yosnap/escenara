import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { AvisoEstado } from "@/components/ui/feedback";
import { AVISO_BOVEDA_USUARIO, PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { exigirSesion } from "@/server/auth/sesion";
import { bovedaDisponible } from "@/server/boveda/cifrado";
import { listarCredenciales } from "@/server/boveda/credenciales";
import { estimarTodo } from "@/server/generacion/estimacion";
import { modelosParaCrear } from "@/server/proveedores/catalogo";
import { CabeceraApp } from "../_app/cabecera-app";
import { VistaCrear } from "./_componentes/vista-crear";

export const metadata: Metadata = { title: "Crear · Escenara" };
export const dynamic = "force-dynamic";

/**
 * «Crear»: el primer flujo usable. Cada usuario genera con su propia clave de KIE (RF01) y paga en su
 * cuenta del proveedor. Sin clave utilizable no se muestra el formulario: se explica qué falta.
 */
export default async function PaginaCrear() {
  const sesion = await exigirSesion("/crear");
  const boveda = bovedaDisponible();
  const credenciales = boveda ? await listarCredenciales(sesion.user.id) : [];
  const kie = credenciales.find((c) => c.proveedor === "kie") ?? null;
  const puedeGenerar = Boolean(kie && kie.estado === "valida");
  // La estimación no necesita credencial (el saldo se queda en `null`): así el coste se ve siempre.
  const [estimaciones, modelosFotograma, modelosClip] = puedeGenerar
    ? await Promise.all([
        estimarTodo(sesion.user.id),
        modelosParaCrear("image_edit"),
        modelosParaCrear("image_to_video"),
      ])
    : [null, [], []];

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Crear</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Elige una imagen, describe la escena y genera un fotograma vertical y un clip corto con tu propia clave de{" "}
              {PROVEEDORES_PUBLICOS.kie.nombre}. Nada se envía sin que veas antes el coste estimado.
            </p>
          </div>
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            <History className="size-4" aria-hidden /> Historial
          </Link>
        </div>

        {!boveda && <AvisoEstado estado="bloqueado" motivo={AVISO_BOVEDA_USUARIO} />}

        {boveda && !puedeGenerar && (
          <AvisoEstado
            estado="bloqueado"
            motivo={
              kie
                ? "Tu clave de KIE está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta» y vuelve aquí."
                : "Para generar necesitas tu propia clave de KIE.ai: tú pagas al proveedor y nadie más usa tu saldo. Añádela en «Tu cuenta»."
            }
            accion={
              <Link href="/cuenta" className={claseBoton("primario", "sm")}>
                Ir a Tu cuenta
              </Link>
            }
          />
        )}

        {estimaciones && (
          <VistaCrear
            estimacionFotograma={estimaciones.fotograma}
            estimacionAnimacion={estimaciones.animacion}
            modelosFotograma={modelosFotograma}
            modelosClip={modelosClip}
          />
        )}
      </main>
    </div>
  );
}
