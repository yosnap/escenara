"use client";

import { KeyRound } from "lucide-react";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import type { ClaveSecreta } from "@/server/boveda/secretos";
import { Seccion } from "./seccion-ajustes";

/**
 * Acceso con Google y GitHub. El identificador de cliente es un ajuste normal; el secreto va cifrado en la
 * bóveda y nunca vuelve al navegador. Un proveedor solo se activa con las dos cosas puestas.
 */
const PROVEEDORES = [
  {
    id: "google",
    nombre: "Google",
    idAjuste: "googleClientId",
    claveSecreta: "googleClientSecret",
    urlConsola: "https://console.cloud.google.com/apis/credentials",
    etiquetaConsola: "Google Cloud › Credenciales",
  },
  {
    id: "github",
    nombre: "GitHub",
    idAjuste: "githubClientId",
    claveSecreta: "githubClientSecret",
    urlConsola: "https://github.com/settings/developers",
    etiquetaConsola: "GitHub › Developer settings",
  },
] as const satisfies readonly {
  id: "google" | "github";
  nombre: string;
  idAjuste: keyof Ajustes;
  claveSecreta: ClaveSecreta;
  urlConsola: string;
  etiquetaConsola: string;
}[];

export function SeccionAccesoSocial({
  valores,
  activos,
  redirecciones,
  pista,
  bovedaLista,
  errorDe,
  onCambio,
  onGuardarSecreto,
  onQuitarSecreto,
}: {
  valores: Ajustes;
  activos: string[];
  redirecciones: Record<"google" | "github", string>;
  pista: (clave: ClaveSecreta) => string | null;
  bovedaLista: boolean;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
  onGuardarSecreto: (clave: ClaveSecreta, valor: string) => Promise<boolean>;
  onQuitarSecreto: (clave: ClaveSecreta) => Promise<void>;
}) {
  return (
    <Seccion
      titulo="Acceso con Google y GitHub"
      descripcion="Proveedores externos para entrar. Hacen falta el identificador y el secreto de cliente."
      icono={<KeyRound />}
    >
      <p className="text-texto">
        {activos.length > 0 ? `Activos: ${activos.join(" y ")}.` : "Ninguno activo."}{" "}
        <span className="text-texto-suave">Si quitas una de las dos claves, su botón deja de aparecer.</span>
      </p>
      {!bovedaLista && <Aviso tono="error">Sin clave maestra no se pueden guardar los secretos de cliente.</Aviso>}
      {PROVEEDORES.map((p) => (
        <div key={p.id} className="flex flex-col gap-4 border-t border-borde/50 pt-4">
          <h3 className="font-bold text-texto">{p.nombre}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta={`Identificador de cliente de ${p.nombre}`}
              ayuda={
                <>
                  Se obtiene en{" "}
                  <a className="underline" href={p.urlConsola} target="_blank" rel="noreferrer noopener">
                    {p.etiquetaConsola}
                  </a>
                  .
                </>
              }
              error={errorDe(p.idAjuste)}
            >
              {(props) => (
                <EntradaTexto
                  {...props}
                  autoComplete="off"
                  value={valores[p.idAjuste] as string}
                  onChange={(e) => onCambio(p.idAjuste, e.target.value)}
                />
              )}
            </Campo>
            <CampoSecreto
              etiqueta={`Secreto de cliente de ${p.nombre}`}
              pista={pista(p.claveSecreta)}
              vacio="Se guarda cifrado y no se vuelve a mostrar."
              deshabilitado={!bovedaLista}
              tituloQuitar={`¿Quitar el secreto de ${p.nombre}?`}
              descripcionQuitar={`Sin él, el botón de ${p.nombre} dejará de aparecer en «Entrar».`}
              onGuardar={(valor) => onGuardarSecreto(p.claveSecreta, valor)}
              onQuitar={() => onQuitarSecreto(p.claveSecreta)}
            />
          </div>
          <p className="text-sm text-texto-suave">
            Registra esta URL de redirección en {p.nombre}:{" "}
            <code className="font-mono break-all">{redirecciones[p.id]}</code>
          </p>
        </div>
      ))}
    </Seccion>
  );
}
