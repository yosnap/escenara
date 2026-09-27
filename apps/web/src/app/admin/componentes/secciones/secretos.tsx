"use client";

import { useState } from "react";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Muestra, Seccion } from "../seccion";

/**
 * Campo de secreto del catálogo. Aquí la demostración guarda en memoria; en la aplicación real el valor
 * viaja a una acción de servidor que lo cifra y solo devuelve la pista.
 */
export function SeccionSecretos() {
  const [pista, setPista] = useState<string | null>("f4c9");
  const [error, setError] = useState<string | undefined>();

  return (
    <Seccion
      id="secretos"
      titulo="Secretos"
      descripcion="Campo para claves y contraseñas que el servidor guarda cifradas y nunca devuelve: en reposo solo se ve la pista de cuatro caracteres, y quitarlo pide confirmación con un diálogo propio."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Con un secreto guardado">
          <div className="w-full max-w-md">
            <CampoSecreto
              etiqueta="Secreto de cliente de Google"
              pista={pista}
              vacio="Se guarda cifrado y no se vuelve a mostrar."
              error={error}
              tituloQuitar="¿Quitar el secreto de Google?"
              descripcionQuitar="Sin él, el botón de Google dejará de aparecer en «Entrar»."
              onGuardar={async (valor) => {
                if (valor.trim().length < 8) {
                  setError("Ese valor es demasiado corto para ser un secreto.");
                  return false;
                }
                setError(undefined);
                setPista(valor.trim().slice(-4));
                return true;
              }}
              onQuitar={async () => {
                setError(undefined);
                setPista(null);
              }}
            />
          </div>
        </Muestra>
        <Muestra titulo="Sin guardar y desactivado">
          <div className="flex w-full max-w-md flex-col gap-6">
            <CampoSecreto
              etiqueta="Contraseña del servidor de correo"
              pista={null}
              vacio="Se guarda cifrada y no se vuelve a mostrar."
              onGuardar={async () => true}
            />
            <CampoSecreto
              etiqueta="Clave de API (sin clave maestra)"
              pista={null}
              vacio="La bóveda está desactivada: no se puede guardar."
              deshabilitado
              onGuardar={async () => false}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
