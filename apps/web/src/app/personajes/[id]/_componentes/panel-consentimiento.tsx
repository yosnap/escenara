"use client";

import { FileSignature, ShieldOff } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { AvisoEstado } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import {
  bloqueosDeConsentimiento,
  CONSENTIMIENTO_INICIAL,
  type EstadoConsentimiento,
  FormularioConsentimiento,
} from "@/components/ui/personajes/formulario-consentimiento";
import { fechaLarga } from "@/lib/fechas";
import {
  AVISO_CONTROL_NO_GARANTIA,
  ETIQUETA_ALCANCE,
  ETIQUETA_TITULAR,
  exigeDocumento,
  MOTIVO_MAXIMO,
  type PersonajeVista,
} from "@/lib/personajes";

/**
 * Consentimiento del personaje en su ficha: lo que hay registrado, o el formulario para registrarlo, más la
 * revocación con su diálogo propio.
 *
 * Revocar **bloquea el personaje al momento** y lo dice sin rodeos: lo ya generado se conserva, pero no se
 * puede volver a generar con él hasta que se registre un consentimiento nuevo.
 */
export function PanelConsentimiento({
  personaje,
  onRegistrar,
  onRevocar,
  ocupado,
  soloLectura = false,
}: {
  personaje: PersonajeVista;
  onRegistrar: (estado: EstadoConsentimiento) => Promise<string | null>;
  onRevocar: (motivo: string) => Promise<string | null>;
  ocupado: boolean;
  /** Quien administra revisando: ve el registro y el documento, sin ninguna acción. */
  soloLectura?: boolean;
}) {
  const [nuevo, setNuevo] = useState<EstadoConsentimiento | null>(null);
  const [revocando, setRevocando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const consentimiento = personaje.consentimiento;
  // Con zona fija: la misma fecha en el servidor y en el navegador, para que React no descarte la hidratación.
  const fecha = fechaLarga;

  return (
    <section aria-label="Consentimiento" className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold text-texto">Consentimiento</h2>

      {consentimiento && (
        <div className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ["Titular", ETIQUETA_TITULAR[consentimiento.titular]],
              ["Alcance de uso", ETIQUETA_ALCANCE[consentimiento.alcance]],
              ["Mayoría de edad declarada", consentimiento.mayoriaDeEdad ? "Sí" : "No"],
              [
                "Comprobación de parecido autorizada",
                consentimiento.coherenciaDeclarada
                  ? "Sí"
                  : consentimiento.titular === "inventado"
                    ? "No se aplica: las vistas generadas de este personaje inventado sí cuentan"
                    : "No: sus vistas generadas no cuentan como fotos de referencia",
              ],
              ["Registrado", fecha(consentimiento.registradoEn)],
              ...(consentimiento.revisadoEn
                ? ([
                    [
                      "Revisión",
                      `${consentimiento.aceptado ? "Aceptado" : "Rechazado"} el ${fecha(consentimiento.revisadoEn)}`,
                    ],
                  ] as const)
                : []),
              ...(consentimiento.revocadoEn ? ([["Revocado", fecha(consentimiento.revocadoEn)]] as const) : []),
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-sm text-texto-suave">{etiqueta}</dt>
                <dd className="font-semibold text-texto">{valor}</dd>
              </div>
            ))}
          </dl>

          {consentimiento.motivoRevocacion && (
            <p className="text-texto-suave">
              <span className="font-semibold text-texto">Motivo: </span>
              {consentimiento.motivoRevocacion}
            </p>
          )}

          {consentimiento.documento && (
            <div className="flex items-center gap-3">
              <span className="size-20 shrink-0 overflow-hidden rounded-control border border-borde bg-elevada">
                <MiniaturaMedio medio={consentimiento.documento} className="object-cover" />
              </span>
              <p className="text-sm text-texto-suave">
                Documento de consentimiento firmado. Solo lo ves tú y quien administra esta instalación, con un enlace
                temporal que caduca.
              </p>
            </div>
          )}

          <p className="text-sm text-texto-suave">{AVISO_CONTROL_NO_GARANTIA}</p>

          {consentimiento.vigente && !soloLectura && (
            <Boton
              variante="peligro"
              icono={<ShieldOff className="size-4" />}
              className="self-start"
              disabled={ocupado}
              onClick={() => setRevocando(true)}
            >
              Revocar el consentimiento
            </Boton>
          )}
        </div>
      )}

      {!consentimiento?.vigente && nuevo === null && !soloLectura && (
        <AvisoEstado
          estado={consentimiento ? "bloqueado" : "ajustes"}
          motivo={
            consentimiento
              ? "Este personaje no tiene consentimiento vigente, así que no se puede usar para generar. Registra uno nuevo para desbloquearlo."
              : "Falta registrar el consentimiento de uso de imagen. Sin él el personaje no genera nada."
          }
          accion={
            <Boton icono={<FileSignature className="size-4" />} onClick={() => setNuevo(CONSENTIMIENTO_INICIAL)}>
              {consentimiento ? "Registrar uno nuevo" : "Registrar el consentimiento"}
            </Boton>
          }
        />
      )}

      {nuevo !== null && (
        <div className="flex flex-col gap-3">
          <FormularioConsentimiento valor={nuevo} onCambio={setNuevo} deshabilitado={ocupado} />
          {bloqueosDeConsentimiento(nuevo).length > 0 && (
            <ul className="flex list-inside list-disc flex-col gap-1 text-texto-suave">
              {bloqueosDeConsentimiento(nuevo).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Boton
              cargando={ocupado}
              disabled={bloqueosDeConsentimiento(nuevo).length > 0}
              onClick={async () => {
                const error = await onRegistrar(nuevo);
                if (!error) setNuevo(null);
              }}
            >
              {exigeDocumento(nuevo.titular) ? "Registrar y enviar a revisión" : "Registrar el consentimiento"}
            </Boton>
            <Boton variante="fantasma" disabled={ocupado} onClick={() => setNuevo(null)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      <Dialogo
        abierto={revocando}
        onAbiertoCambio={(abierto) => !abierto && setRevocando(false)}
        titulo="¿Revocar el consentimiento?"
        descripcion={`«${personaje.nombre}» quedará bloqueado al momento y no podrá usarse para generar. Los vídeos y fotogramas que ya hayas hecho con él se conservan; si quieres que desaparezcan, borra el personaje.`}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setRevocando(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={ocupado}
              onClick={async () => {
                const error = await onRevocar(motivo.trim());
                if (!error) {
                  setRevocando(false);
                  setMotivo("");
                }
              }}
            >
              Revocar y bloquear
            </Boton>
          </>
        }
      >
        <Campo
          etiqueta="Motivo (opcional)"
          ayuda="Queda guardado con la revocación, por si hay que explicarlo después."
        >
          {(props) => (
            <EntradaTexto
              {...props}
              value={motivo}
              maxLength={MOTIVO_MAXIMO}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ha retirado su permiso."
            />
          )}
        </Campo>
      </Dialogo>
    </section>
  );
}
