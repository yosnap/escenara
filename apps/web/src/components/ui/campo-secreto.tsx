"use client";

import { KeyRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Boton } from "./button";
import { EntradaContrasena } from "./entrada-contrasena";
import { Campo } from "./field";
import { Dialogo } from "./overlay";

/**
 * Campo para un secreto que el servidor guarda cifrado y **nunca devuelve**. Si ya hay uno guardado solo
 * se muestra su pista («Guardada (••••abcd)») con Cambiar y Quitar; para cambiarlo hay que escribir el
 * valor nuevo completo. El borrado pide confirmación con un diálogo propio, nunca con `confirm()`.
 */
export interface CampoSecretoProps {
  etiqueta: string;
  ayuda?: ReactNode;
  /**
   * Últimos cuatro caracteres del secreto guardado, o `null` si no hay ninguno. Vacío cuando el secreto es
   * demasiado corto para enseñar parte de él: entonces solo se dice que está guardado.
   */
  pista: string | null;
  /** Texto que se muestra bajo el campo cuando no hay ninguno guardado. */
  vacio?: string;
  error?: string;
  /** Devuelve `true` si se ha guardado: entonces el campo vuelve a su estado de reposo. */
  onGuardar: (valor: string) => Promise<boolean>;
  onQuitar?: () => Promise<void>;
  tituloQuitar?: string;
  descripcionQuitar?: string;
  deshabilitado?: boolean;
}

export function CampoSecreto({
  etiqueta,
  ayuda,
  pista,
  vacio = "Sin guardar.",
  error,
  onGuardar,
  onQuitar,
  tituloQuitar = "¿Quitar el secreto guardado?",
  descripcionQuitar,
  deshabilitado,
}: CampoSecretoProps) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    const ok = await onGuardar(valor);
    setOcupado(false);
    if (!ok) return;
    setValor("");
    setEditando(false);
  };

  const quitar = async () => {
    if (!onQuitar) return;
    setConfirmando(false);
    setOcupado(true);
    await onQuitar();
    setOcupado(false);
  };

  // En reposo con un secreto guardado: solo la pista y las acciones.
  if (pista !== null && !editando) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-texto">{etiqueta}</span>
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-borde bg-superficie px-3.5 py-2.5">
          <KeyRound className="size-4 shrink-0 text-acento" aria-hidden />
          <span className="flex-1 text-texto">
            {pista === "" ? (
              "Guardada"
            ) : (
              <>
                Guardada (<span className="font-mono">••••{pista}</span>)
              </>
            )}
          </span>
          <Boton
            tamano="sm"
            variante="secundario"
            disabled={deshabilitado || ocupado}
            onClick={() => setEditando(true)}
          >
            Cambiar
          </Boton>
          {onQuitar && (
            <Boton
              tamano="sm"
              variante="fantasma"
              disabled={deshabilitado || ocupado}
              onClick={() => setConfirmando(true)}
            >
              Quitar
            </Boton>
          )}
        </div>
        {ayuda && <p className="text-sm text-texto-suave">{ayuda}</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-error">
            {error}
          </p>
        )}
        <Dialogo
          abierto={confirmando}
          onAbiertoCambio={setConfirmando}
          titulo={tituloQuitar}
          descripcion={descripcionQuitar}
          pie={
            <>
              <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={quitar}>
                Quitar
              </Boton>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Campo etiqueta={etiqueta} ayuda={ayuda ?? (pista === null ? vacio : undefined)} error={error}>
        {(p) => (
          <EntradaContrasena
            {...p}
            nombre="clave"
            autoComplete="off"
            value={valor}
            disabled={deshabilitado || ocupado}
            onChange={(e) => setValor(e.target.value)}
          />
        )}
      </Campo>
      <div className="flex flex-wrap gap-3">
        <Boton
          tamano="sm"
          variante="secundario"
          cargando={ocupado}
          disabled={deshabilitado || valor.trim().length === 0}
          onClick={guardar}
        >
          Guardar
        </Boton>
        {pista !== null && (
          <Boton
            tamano="sm"
            variante="fantasma"
            disabled={ocupado}
            onClick={() => {
              setValor("");
              setEditando(false);
            }}
          >
            Cancelar
          </Boton>
        )}
      </div>
    </div>
  );
}
