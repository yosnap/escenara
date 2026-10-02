"use client";

import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { SeccionCorreo } from "./seccion-correo";

/** Solo se carga cuando la instalación elige SMTP. */
export function CamposSmtp({
  valores,
  onCambio,
  errorDe,
  pista,
  bovedaLista,
  onGuardarSecreto,
  onQuitarSecreto,
}: Parameters<typeof SeccionCorreo>[0]) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Servidor SMTP" error={errorDe("smtpHost")}>
          {(p) => (
            <EntradaTexto {...p} value={valores.smtpHost} onChange={(e) => onCambio("smtpHost", e.target.value)} />
          )}
        </Campo>
        <Campo etiqueta="Puerto" error={errorDe("smtpPuerto")}>
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              max={65535}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.smtpPuerto) ? "" : valores.smtpPuerto}
              onChange={(e) => onCambio("smtpPuerto", e.target.value === "" ? Number.NaN : Number(e.target.value))}
            />
          )}
        </Campo>
        <Campo etiqueta="Usuario" ayuda="Vacío si el servidor no pide autenticación." error={errorDe("smtpUsuario")}>
          {(p) => (
            <EntradaTexto
              {...p}
              value={valores.smtpUsuario}
              onChange={(e) => onCambio("smtpUsuario", e.target.value)}
            />
          )}
        </Campo>
        <CampoSecreto
          etiqueta="Contraseña del servidor"
          pista={pista("smtpContrasena")}
          vacio="Se guarda cifrada. Vacía si el servidor no la pide."
          deshabilitado={!bovedaLista}
          tituloQuitar="¿Quitar la contraseña del correo?"
          descripcionQuitar="Si el servidor la necesita, dejarán de salir los correos."
          onGuardar={(v) => onGuardarSecreto("smtpContrasena", v)}
          onQuitar={() => onQuitarSecreto("smtpContrasena")}
        />
      </div>
      {pista("smtpContrasena") !== null && !valores.smtpUsuario.trim() && (
        <Aviso tono="error">Hay una contraseña guardada, pero falta el usuario del servidor.</Aviso>
      )}
      <Interruptor
        etiqueta="Conexión segura directa (TLS, puerto 465)"
        descripcion="Desactivado: se usa STARTTLS si el servidor lo ofrece."
        activo={valores.smtpSeguro}
        onCambio={(v) => onCambio("smtpSeguro", v)}
      />
    </>
  );
}
