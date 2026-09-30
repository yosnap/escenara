import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui/alerta";
import { claseBoton } from "@/components/ui/button";
import { exigirSesion } from "@/server/auth/sesion";
import { publicacionVisible } from "@/server/comunidad/consulta";
import { listarPresets } from "@/server/prompts/consulta";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { AltaPersonajeInventado } from "./_componentes/alta-personaje-inventado";

export const metadata: Metadata = { title: "Nuevo personaje inventado" };
export const dynamic = "force-dynamic";

/**
 * Alta de un personaje **inventado**: nace de una descripción y su cara se genera. No pide fotos ni
 * consentimiento de nadie, porque no hay nadie a quien pedírselo; lo que sí pide es la declaración de que no
 * representa a ninguna persona real, y esa queda registrada con la cuenta y la fecha.
 */
export default async function PaginaNuevoPersonajeInventado({
  searchParams,
}: {
  searchParams: Promise<{ inspiracion?: string }>;
}) {
  const sesion = await exigirSesion("/personajes/nuevo/inventado");
  // «Inspirarte en él» desde la comunidad: solo el texto de un personaje publicado y visible, con su atribución. Sus
  // imágenes no se copian: el tuyo tendrá sus propios retratos.
  const { inspiracion } = await searchParams;
  const origen =
    inspiracion && /^[0-9a-f-]{36}$/i.test(inspiracion)
      ? await publicacionVisible(inspiracion).catch(() => null)
      : null;
  const inspirado = origen?.tipo === "personaje" ? origen : null;
  const estilos = (await listarPresets({ categoria: "estilo-animado" }))
    .filter((preset) => preset.activo)
    .map((preset) => ({ clave: preset.clave, nombre: preset.nombre, descripcion: preset.descripcion }));
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-col gap-3">
          <Link href="/personajes/nuevo" className={claseBoton("fantasma", "sm", "self-start")}>
            <ArrowLeft className="size-4" aria-hidden /> Otras formas de crear un personaje
          </Link>
          <h1 className="text-4xl font-bold text-texto">Nuevo personaje inventado</h1>
          <p className="max-w-2xl text-texto-suave">
            No existe: lo describes, se generan cuatro retratos y eliges el que te convenza. No admite fotos de personas
            reales, y todo lo que genere queda marcado como contenido sintético.
          </p>
        </div>
        {inspirado && (
          <Alerta tipo="info" anuncio="ninguno" titulo={`Te inspiras en «${inspirado.titulo}», de ${inspirado.firma}`}>
            Partes de su descripción; cámbiala a tu gusto. Tu personaje será tuyo, con sus propios retratos, y privado.
          </Alerta>
        )}
        <AltaPersonajeInventado estilos={estilos} descripcionInicial={inspirado?.descripcion ?? ""} />
      </main>
    </div>
  );
}
