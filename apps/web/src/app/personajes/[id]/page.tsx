import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { AVISO_BOVEDA_USUARIO } from "@/lib/boveda";
import { leerAjustes } from "@/server/ajustes";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { bovedaDisponible } from "@/server/boveda/cifrado";
import { listarCredenciales } from "@/server/boveda/credenciales";
import { umbralesDe } from "@/server/personajes/calidad";
import { obtenerPersonaje } from "@/server/personajes/consulta";
import { ErrorPersonaje } from "@/server/personajes/errores";
import { medioDeLaHoja } from "@/server/personajes/hoja-identidad";
import { mediosDeCandidatos } from "@/server/personajes/inventado";
import { listarPresets } from "@/server/prompts/consulta";
import { proyectosEnModoOmni } from "@/server/voz/omni";
import { CabeceraApp } from "../../_app/cabecera-app";
import { FichaPersonaje } from "./_componentes/ficha-personaje";

export const metadata: Metadata = { title: "Personaje · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Ficha de un personaje. Un personaje ajeno responde 404, igual que en la biblioteca: no se revela que
 * existe. Quien administra puede leerlo para revisar su consentimiento, pero no editarlo (lo impide el
 * servidor, no la interfaz).
 */
export default async function PaginaPersonaje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await exigirSesion(`/personajes/${id}`);
  const personaje = await obtenerPersonaje({ id: sesion.user.id, esAdmin: esAdmin(sesion) }, id).catch((error) => {
    if (error instanceof ErrorPersonaje && error.estado === 404) notFound();
    throw error;
  });

  // Generar una vista sintética cuesta dinero de la cuenta del usuario en el proveedor, así que la ficha
  // necesita saber si hay clave utilizable: sin ella se dice qué falta y no se ofrece generar, igual que en
  // «Crear». Lo que decide sigue siendo el servidor al encolar.
  const claveDeGeneracion = await estadoDeLaClave(sesion.user.id);
  // Los retratos candidatos solo existen en un personaje inventado: en los demás no se consulta nada.
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const retratos = personaje.inventado && personaje.puedeEditar ? await mediosDeCandidatos(actor, id) : [];
  // Con qué voz se puede registrar: la de sus proyectos en modo Omni. Sin ninguno, la ficha lo dice y no ofrece.
  const proyectosOmni = personaje.puedeEditar ? await proyectosEnModoOmni(actor.id) : [];
  // La hoja 3×3, si la tiene generada: es lo que se enseña en la pestaña de referencias.
  const hojaIdentidad = personaje.puedeEditar ? await medioDeLaHoja(actor, id) : null;
  const estilos =
    personaje.inventado && personaje.puedeEditar
      ? (await listarPresets({ categoria: "estilo-animado" }))
          .filter((preset) => preset.activo)
          .map((preset) => ({ clave: preset.clave, nombre: preset.nombre, descripcion: preset.descripcion }))
      : [];

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <Link href="/personajes" className={claseBoton("fantasma", "sm", "self-start")}>
          <ArrowLeft className="size-4" aria-hidden /> Tus personajes
        </Link>
        {/* Los umbrales del control de calidad viajan al navegador para poder avisar antes de subir nada; lo
            que decide sigue siendo el servidor, que los vuelve a aplicar. */}
        <FichaPersonaje
          inicial={personaje}
          umbrales={umbralesDe(await leerAjustes())}
          claveDeGeneracion={claveDeGeneracion}
          retratos={retratos}
          hojaIdentidad={hojaIdentidad}
          proyectosOmni={proyectosOmni}
          estilosAnimados={estilos}
        />
      </main>
    </div>
  );
}

/**
 * Si se puede generar con la clave del usuario, y si no, por qué. El mismo criterio que `/crear`: hace falta
 * bóveda y una credencial de KIE marcada como válida.
 */
async function estadoDeLaClave(usuarioId: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!bovedaDisponible()) return { ok: false, motivo: AVISO_BOVEDA_USUARIO };
  const kie = (await listarCredenciales(usuarioId)).find((c) => c.proveedor === "kie") ?? null;
  if (!kie) {
    return {
      ok: false,
      motivo:
        "Para generar una vista hace falta tu propia clave de KIE.ai: tú pagas al proveedor y nadie más usa tu saldo. Añádela en «Tu cuenta».",
    };
  }
  if (kie.estado !== "valida") {
    return {
      ok: false,
      motivo: "Tu clave de KIE está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta» y vuelve aquí.",
    };
  }
  return { ok: true };
}
