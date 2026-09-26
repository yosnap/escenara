"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { BotonProveedor, type Proveedor, SeparadorO } from "@/components/ui/cuenta";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";

/** Passkey (solo al entrar) y proveedores configurados, con el separador hacia el formulario de correo. */
export function AccesoExterno({
  proveedores,
  volver,
  conPasskey,
  onError,
}: {
  proveedores: Proveedor[];
  volver: string;
  conPasskey: boolean;
  onError: (mensaje: string | null) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!conPasskey && proveedores.length === 0) return null;

  const conProveedor = async (proveedor: Proveedor) => {
    setOcupado(proveedor);
    onError(null);
    const { error } = await authCliente.signIn.social({ provider: proveedor, callbackURL: volver });
    if (error) {
      onError(mensajeError(error));
      setOcupado(null);
    }
  };

  const conPasskeyClick = async () => {
    setOcupado("passkey");
    onError(null);
    const r = await authCliente.signIn.passkey();
    setOcupado(null);
    if (r?.error) onError(mensajeError(r.error));
    else window.location.assign(volver);
  };

  return (
    <div className="flex flex-col gap-3">
      {conPasskey && (
        <Boton
          variante="secundario"
          icono={<KeyRound className="size-4" />}
          cargando={ocupado === "passkey"}
          disabled={ocupado !== null}
          onClick={conPasskeyClick}
        >
          Entrar con passkey
        </Boton>
      )}
      {proveedores.map((p) => (
        <BotonProveedor key={p} proveedor={p} disabled={ocupado !== null} onClick={() => conProveedor(p)} />
      ))}
      <SeparadorO texto="o con tu correo" />
    </div>
  );
}
