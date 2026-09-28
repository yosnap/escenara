"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { type CompatibleVista, MODELOS_MAXIMOS, PLANTILLAS } from "@/lib/compatible";

/**
 * Alta o sustitución de un servicio compatible con la API de OpenAI. Es una **zona de claridad**: decide con qué
 * cuenta se va a consumir cuota, así que ni degradados ni animación.
 *
 * La clave se escribe entera siempre, también al sustituir: el servidor no la devuelve nunca.
 */
export interface DatosFormulario {
  nombre: string;
  urlBase: string;
  clave: string;
  modelos: string[];
}

export function FormularioCompatible({
  inicial,
  ocupado,
  error,
  onGuardar,
  onCancelar,
}: {
  /** Servicio que se está sustituyendo, o `undefined` al dar de alta uno nuevo. */
  inicial?: CompatibleVista;
  ocupado: boolean;
  error?: string;
  onGuardar: (datos: DatosFormulario) => Promise<boolean>;
  onCancelar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [urlBase, setUrlBase] = useState(inicial?.urlBase ?? "");
  const [modelos, setModelos] = useState((inicial?.modelos ?? []).join("\n"));
  const [clave, setClave] = useState("");

  const aplicarPlantilla = (indice: number) => {
    const plantilla = PLANTILLAS[indice];
    if (!plantilla) return;
    setNombre(plantilla.nombre);
    setUrlBase(plantilla.urlBase);
    setModelos(plantilla.modelos.join("\n"));
  };

  const guardar = async () => {
    const ok = await onGuardar({
      nombre,
      urlBase,
      clave,
      modelos: modelos.split("\n").map((m) => m.trim()),
    });
    if (ok) setClave("");
  };

  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      {!inicial && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-texto-suave">Servicios ya comprobados:</span>
          {PLANTILLAS.map((plantilla, indice) => (
            <Boton
              key={plantilla.nombre}
              tamano="sm"
              variante="secundario"
              disabled={ocupado}
              onClick={() => aplicarPlantilla(indice)}
            >
              Rellenar con {plantilla.nombre}
            </Boton>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del servicio" ayuda="Es el nombre que verás en los avisos y en tu historial de gasto.">
          {(p) => (
            <EntradaTexto
              {...p}
              value={nombre}
              disabled={ocupado || Boolean(inicial)}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Dirección base"
          ayuda="La que termina en «/v1». Tiene que ser https y apuntar a un servidor público de internet."
        >
          {(p) => (
            <EntradaTexto
              {...p}
              inputMode="url"
              placeholder="https://api.nan.builders/v1"
              value={urlBase}
              disabled={ocupado}
              onChange={(e) => setUrlBase(e.target.value)}
            />
          )}
        </Campo>
      </div>

      <Campo
        etiqueta="Modelos de texto, uno por línea"
        ayuda={`Se prueban en este orden: el primero es el preferido y se pasa al siguiente si ese no está disponible. Como mucho ${MODELOS_MAXIMOS}.`}
      >
        {(p) => (
          <AreaTexto
            {...p}
            rows={4}
            className="font-mono"
            value={modelos}
            disabled={ocupado}
            onChange={(e) => setModelos(e.target.value)}
          />
        )}
      </Campo>

      <Campo
        etiqueta="Clave de API"
        ayuda="Se guarda cifrada y no se vuelve a mostrar. Al guardar se comprueba con una llamada que no consume cuota."
        error={error}
      >
        {(p) => (
          <EntradaContrasena
            {...p}
            nombre="clave de API"
            value={clave}
            disabled={ocupado}
            onChange={(e) => setClave(e.target.value)}
          />
        )}
      </Campo>

      <div className="flex flex-wrap gap-3">
        <Boton cargando={ocupado} onClick={guardar}>
          {inicial ? "Guardar cambios" : "Añadir servicio"}
        </Boton>
        {onCancelar && (
          <Boton variante="fantasma" disabled={ocupado} onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
      </div>
    </div>
  );
}
