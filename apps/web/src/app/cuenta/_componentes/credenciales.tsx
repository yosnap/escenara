"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import {
  AVISO_BOVEDA_USUARIO,
  type CredencialVista,
  PROVEEDORES,
  PROVEEDORES_PUBLICOS,
  type Proveedor,
} from "@/lib/boveda";
import {
  borrarCredencialAccion,
  guardarCredencialAccion,
  probarCredencialAccion,
  type RespuestaCredencial,
} from "../acciones-credenciales";
import { Bloque } from "./bloque";
import { TarjetaCredencial } from "./tarjeta-credencial";

/**
 * Credenciales de IA del usuario (BYOK, RF01): una clave por proveedor, que se guarda cifrada en el
 * servidor. La clave nunca vuelve al navegador: de vuelta solo llegan la pista y el estado.
 */
export function Credenciales({
  credenciales: iniciales,
  bovedaLista,
}: {
  credenciales: CredencialVista[];
  bovedaLista: boolean;
}) {
  const [credenciales, setCredenciales] = useState(iniciales);
  const [ocupado, setOcupado] = useState<Proveedor | null>(null);
  const [errores, setErrores] = useState<Partial<Record<Proveedor, string>>>({});
  const [hecho, setHecho] = useState<string | null>(null);

  /** Aplica el resultado de una acción: guarda la lista nueva o el error del proveedor afectado. */
  const aplicar = (proveedor: Proveedor, respuesta: RespuestaCredencial) => {
    setErrores((e) => ({ ...e, [proveedor]: respuesta.ok ? undefined : respuesta.error }));
    if (!respuesta.ok) {
      setHecho(null);
      return false;
    }
    setCredenciales(respuesta.credenciales);
    setHecho(respuesta.mensaje);
    return true;
  };

  const ejecutar = async (proveedor: Proveedor, accion: Promise<RespuestaCredencial>) => {
    setOcupado(proveedor);
    const respuesta = await accion;
    setOcupado(null);
    return aplicar(proveedor, respuesta);
  };

  return (
    <Bloque
      titulo="Credenciales de IA"
      descripcion="Tus claves de API: generas con tu propia cuenta y pagas directamente al proveedor. Se guardan cifradas y nadie más puede verlas."
      icono={<KeyRound />}
    >
      {!bovedaLista && <Aviso tono="error">{AVISO_BOVEDA_USUARIO}</Aviso>}
      {hecho && <Aviso tono="correcto">{hecho}</Aviso>}
      <div className="flex flex-col gap-4">
        {PROVEEDORES.map((id) => (
          <TarjetaCredencial
            key={id}
            proveedor={PROVEEDORES_PUBLICOS[id]}
            credencial={credenciales.find((c) => c.proveedor === id)}
            bovedaLista={bovedaLista}
            ocupado={ocupado === id}
            error={errores[id]}
            onGuardar={(valor) => ejecutar(id, guardarCredencialAccion(id, valor))}
            onProbar={async () => {
              await ejecutar(id, probarCredencialAccion(id));
            }}
            onBorrar={async () => {
              await ejecutar(id, borrarCredencialAccion(id));
            }}
          />
        ))}
      </div>
      <p className="text-sm text-texto-suave">
        Escenara no cobra por generar: cada petición se paga en la cuenta del proveedor cuya clave uses. Al probar una
        clave no se gasta nada.
      </p>
    </Bloque>
  );
}
