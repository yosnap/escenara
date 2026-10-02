"use client";

import { Mail } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import type { Ajustes } from "@/server/ajustes";
import type { ClaveSecreta } from "@/server/boveda/secretos";
import { enviarCorreoPruebaAccion } from "./acciones";
import { Seccion } from "./seccion-ajustes";

const CamposSmtp = dynamic(() => import("./campos-smtp").then((m) => m.CamposSmtp));

const VistaPlantillasCorreo = dynamic(() => import("./vista-plantillas-correo").then((m) => m.VistaPlantillasCorreo), {
  ssr: false,
  loading: () => <p role="status">Cargando previsualización…</p>,
});

export function SeccionCorreo({
  valores,
  onCambio,
  errorDe,
  pista,
  bovedaLista,
  onGuardarSecreto,
  onQuitarSecreto,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
  errorDe: (clave: keyof Ajustes) => string | undefined;
  pista: (clave: ClaveSecreta) => string | null;
  bovedaLista: boolean;
  onGuardarSecreto: (clave: ClaveSecreta, valor: string) => Promise<boolean>;
  onQuitarSecreto: (clave: ClaveSecreta) => Promise<void>;
}) {
  const [probando, setProbando] = useState(false);
  const [mostrarPlantillas, setMostrarPlantillas] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  return (
    <Seccion
      titulo="Correo"
      descripcion="Confirmación de cuenta, recuperación de acceso y avisos de seguridad."
      icono={<Mail />}
    >
      <Selector
        etiqueta="Proveedor de correo"
        valor={valores.correoProveedor}
        opciones={[
          { value: "resend", label: "Resend (recomendado)", descripcion: "Envío mediante API" },
          {
            value: "smtp",
            label: "SMTP / otros proveedores",
            descripcion: "Tu servidor o un proveedor compatible con SMTP",
          },
        ]}
        onCambio={(v) => {
          if (v === "resend" || v === "smtp") onCambio("correoProveedor", v);
        }}
      />
      <Campo
        etiqueta="Remitente"
        ayuda="Usa una dirección de un dominio verificado por tu proveedor."
        error={errorDe("correoRemitente")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            value={valores.correoRemitente}
            onChange={(e) => onCambio("correoRemitente", e.target.value)}
          />
        )}
      </Campo>
      {valores.correoProveedor === "resend" ? (
        <CampoSecreto
          etiqueta="Clave API de Resend"
          pista={pista("resendApiKey")}
          vacio="Pendiente de configuración. Crea en Resend una clave de envío para tu dominio verificado; se guarda cifrada."
          deshabilitado={!bovedaLista}
          tituloQuitar="¿Quitar la clave de Resend?"
          descripcionQuitar="Los correos dejarán de enviarse hasta configurar otra clave o elegir SMTP."
          onGuardar={(v) => onGuardarSecreto("resendApiKey", v)}
          onQuitar={() => onQuitarSecreto("resendApiKey")}
        />
      ) : (
        <CamposSmtp {...{ valores, onCambio, errorDe, pista, bovedaLista, onGuardarSecreto, onQuitarSecreto }} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          variante="secundario"
          cargando={probando}
          onClick={async () => {
            setProbando(true);
            try {
              setPrueba(await enviarCorreoPruebaAccion());
            } catch {
              setPrueba({
                ok: false,
                mensaje: "No se ha podido confirmar el envío. Comprueba el proveedor antes de repetirlo.",
              });
            } finally {
              setProbando(false);
            }
          }}
        >
          Enviar correo de prueba
        </Boton>
        <span className="text-sm text-texto-suave">Se envía a tu cuenta con la configuración guardada.</span>
      </div>
      {prueba && <Aviso tono={prueba.ok ? "correcto" : "error"}>{prueba.mensaje}</Aviso>}
      <details
        className="rounded-control border border-borde p-4"
        onToggle={(e) => setMostrarPlantillas(e.currentTarget.open)}
      >
        <summary className="font-semibold">Previsualizar plantillas de correo</summary>
        {mostrarPlantillas && <VistaPlantillasCorreo />}
      </details>
    </Seccion>
  );
}
