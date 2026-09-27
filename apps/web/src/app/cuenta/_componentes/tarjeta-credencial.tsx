"use client";

import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Boton } from "@/components/ui/button";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { cn } from "@/components/ui/cn";
import type { CredencialVista, ProveedorPublico } from "@/lib/boveda";

/**
 * Tarjeta de un proveedor de IA: estado de la clave, su pista, el saldo que devolvió la última prueba y
 * las acciones. Es una zona de claridad (afecta al gasto): sin degradados ni animación.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ESTADOS: Record<"sin-clave" | "valida" | "invalida", { texto: string; icono: ReactNode; clase: string }> = {
  "sin-clave": { texto: "Sin clave", icono: <CircleDashed />, clase: "border-borde text-texto-suave" },
  valida: { texto: "Funciona", icono: <CheckCircle2 />, clase: "border-correcto/45 text-correcto" },
  invalida: { texto: "No funciona", icono: <XCircle />, clase: "border-error/45 text-error" },
};

export function TarjetaCredencial({
  proveedor,
  credencial,
  bovedaLista,
  ocupado,
  error,
  onGuardar,
  onProbar,
  onBorrar,
}: {
  proveedor: ProveedorPublico;
  credencial: CredencialVista | undefined;
  bovedaLista: boolean;
  ocupado: boolean;
  error?: string;
  onGuardar: (valor: string) => Promise<boolean>;
  onProbar: () => Promise<void>;
  onBorrar: () => Promise<void>;
}) {
  const estado = ESTADOS[credencial ? credencial.estado : "sin-clave"];

  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-texto">{proveedor.nombre}</h3>
          <p className="text-sm text-texto-suave">{proveedor.para}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-bold [&>svg]:size-4",
            estado.clase,
          )}
        >
          {estado.icono}
          {estado.texto}
        </span>
      </div>

      <CampoSecreto
        etiqueta="Clave de API"
        pista={credencial?.pista ?? null}
        vacio={`${proveedor.ayuda} Se guarda cifrada y no se vuelve a mostrar.`}
        ayuda={
          credencial ? (
            <>
              Obtén otra en{" "}
              <a className="underline" href={proveedor.urlClave} target="_blank" rel="noreferrer noopener">
                {proveedor.etiquetaUrlClave}
              </a>
              . Al sustituirla se prueba antes de reemplazar la que tienes.
            </>
          ) : (
            <>
              Consíguela en{" "}
              <a className="underline" href={proveedor.urlClave} target="_blank" rel="noreferrer noopener">
                {proveedor.etiquetaUrlClave}
              </a>
              . {proveedor.ayuda} Solo se guarda si funciona.
            </>
          )
        }
        error={error}
        deshabilitado={!bovedaLista || ocupado}
        tituloQuitar={`¿Borrar tu clave de ${proveedor.nombre}?`}
        descripcionQuitar="Dejará de poder generarse con este proveedor hasta que guardes otra. La clave sigue siendo tuya en el proveedor."
        onGuardar={onGuardar}
        onQuitar={onBorrar}
      />

      {credencial && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borde/50 pt-3">
          <Boton tamano="sm" variante="secundario" disabled={!bovedaLista} cargando={ocupado} onClick={onProbar}>
            Probar
          </Boton>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
            {credencial.ultimoDetalle && (
              <div className="flex gap-1">
                <dt>Saldo:</dt>
                <dd className="font-mono text-texto">{credencial.ultimoDetalle}</dd>
              </div>
            )}
            {credencial.ultimaPrueba && (
              <div className="flex gap-1">
                <dt>Última prueba:</dt>
                <dd>{fecha(credencial.ultimaPrueba)}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>{credencial.ultimaRotacion ? "Sustituida:" : "Guardada:"}</dt>
              <dd>{fecha(credencial.ultimaRotacion ?? credencial.alta)}</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
