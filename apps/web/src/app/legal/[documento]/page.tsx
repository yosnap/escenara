import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerAjustes } from "@/server/ajustes";
import { identidadLegalCompleta } from "@/server/ajustes-legales";
import { obtenerSesion } from "@/server/auth/sesion";
import { CabeceraApp } from "../../_app/cabecera-app";
import { BarraPortada } from "../../_portada/barra-portada";
import { DOCUMENTOS_LEGALES, esDocumentoLegal } from "../textos";

type Props = { params: Promise<{ documento: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { documento } = await params;
  return { title: esDocumentoLegal(documento) ? DOCUMENTOS_LEGALES[documento].titulo : "Información legal" };
}
export default async function PaginaLegal({ params }: Props) {
  const { documento } = await params;
  if (!esDocumentoLegal(documento)) notFound();
  const [ajustes, sesion] = await Promise.all([leerAjustes(), obtenerSesion()]);
  const texto = DOCUMENTOS_LEGALES[documento];
  return (
    <>
      {sesion ? <CabeceraApp sesion={sesion} /> : <BarraPortada conSesion={false} />}
      <main id="contenido" tabIndex={-1} className="mx-auto max-w-3xl px-5 py-10 text-texto md:px-8">
        <h1 className="text-3xl font-bold">{texto.titulo}</h1>
        <p className="mt-2 text-sm text-texto-suave">Actualizado el 1 de octubre de 2026.</p>
        {!identidadLegalCompleta(ajustes) && (
          <p role="status" className="mt-4 rounded-control border-2 border-aviso bg-superficie p-4">
            La identificación legal del titular de esta instalación está pendiente de completar. Este documento todavía
            no está completo.
          </p>
        )}
        <section aria-labelledby="titular-legal" className="mt-6 rounded-tarjeta border border-borde bg-superficie p-4">
          <h2 id="titular-legal" className="text-xl font-bold">
            Titular de esta instalación
          </h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
            <dt>Titular</dt>
            <dd>{ajustes.legalTitular || "Pendiente de completar"}</dd>
            <dt>NIF/CIF</dt>
            <dd>{ajustes.legalNif || "Pendiente de completar"}</dd>
            <dt>Domicilio</dt>
            <dd>{ajustes.legalDomicilio || "Pendiente de completar"}</dd>
            <dt>Contacto y privacidad</dt>
            <dd>
              {ajustes.legalCorreo ? (
                <a href={`mailto:${ajustes.legalCorreo}`} className="break-all text-acento underline">
                  {ajustes.legalCorreo}
                </a>
              ) : (
                "Pendiente de completar"
              )}
            </dd>
            {ajustes.legalRegistro && (
              <>
                <dt>Datos registrales</dt>
                <dd>{ajustes.legalRegistro}</dd>
              </>
            )}
          </dl>
        </section>
        {texto.secciones.map(([titulo, cuerpo]) => (
          <section key={titulo} className="mt-8">
            <h2 className="text-xl font-bold">{titulo}</h2>
            <p className="mt-3 leading-relaxed text-texto-suave">{cuerpo}</p>
          </section>
        ))}
        {documento === "privacidad" && (
          <p className="mt-8 text-sm text-texto-suave">
            Configuración actual: {ajustes.borradoCuentaDiasGracia} días de gracia para borrar la cuenta; descargas ZIP
            disponibles durante {ajustes.exportacionCaducidadHoras} horas. Los plazos de conservación de cada proveedor
            son los de su servicio.
          </p>
        )}
      </main>
    </>
  );
}
