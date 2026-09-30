"use client";

import { CheckCircle2, Plug, XCircle } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { AVISO_BOVEDA_USUARIO } from "@/lib/boveda";
import { COMPATIBLES_MAXIMOS, type CompatibleVista } from "@/lib/compatible";
import {
  borrarCompatibleAccion,
  guardarCompatibleAccion,
  probarCompatibleAccion,
  type RespuestaCompatible,
} from "../acciones-compatibles";
import { Bloque } from "./bloque";
import { type DatosFormulario, FormularioCompatible } from "./formulario-compatible";

/**
 * Servicios compatibles con la API de OpenAI del usuario (0.21.1): son la **reserva** de la traducción de
 * prompts y del asistente de guion cuando el modelo de texto de siempre falla.
 *
 * Es una zona de claridad (afecta a la cuota que se consume y a la cuenta en la que se consume): sin degradados
 * ni animación, y diciendo con todas las letras cómo se paga.
 */
export function Compatibles({
  proveedores: iniciales,
  bovedaLista,
}: {
  proveedores: CompatibleVista[];
  bovedaLista: boolean;
}) {
  const [proveedores, setProveedores] = useState(iniciales);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hecho, setHecho] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [borrando, setBorrando] = useState<CompatibleVista | null>(null);

  const aplicar = (respuesta: RespuestaCompatible) => {
    if (!respuesta.ok) {
      setError(respuesta.error);
      setHecho(null);
      return false;
    }
    setError(undefined);
    setProveedores(respuesta.proveedores);
    setHecho(respuesta.mensaje);
    return true;
  };

  const ejecutar = async (clave: string, accion: Promise<RespuestaCompatible>) => {
    setOcupado(clave);
    const respuesta = await accion;
    setOcupado(null);
    return aplicar(respuesta);
  };

  const guardar = async (datos: DatosFormulario, clave: string) => {
    const ok = await ejecutar(clave, guardarCompatibleAccion(datos));
    if (ok) {
      setAnadiendo(false);
      setEditando(null);
    }
    return ok;
  };

  return (
    <Bloque
      titulo="Servicios de texto de tu plan"
      descripcion="Servicios compatibles con la API de OpenAI que pagas por cuota de tu plan, no por petición. Mientras no ordenes tu mapa de modelos, se usan primero para traducir y escribir el guion, y el modelo de texto de pago de la instalación queda como reserva. En Escenara sus llamadas se apuntan con 0 créditos."
      icono={<Plug />}
    >
      {!bovedaLista && <Aviso tono="error">{AVISO_BOVEDA_USUARIO}</Aviso>}
      {hecho && <Aviso tono="correcto">{hecho}</Aviso>}
      {error && !anadiendo && editando === null && <Aviso tono="error">{error}</Aviso>}

      <div className="flex flex-col gap-4">
        {proveedores.map((proveedor) =>
          editando === proveedor.id ? (
            <FormularioCompatible
              key={proveedor.id}
              inicial={proveedor}
              ocupado={ocupado === proveedor.id}
              error={error}
              onGuardar={(datos) => guardar(datos, proveedor.id)}
              onCancelar={() => {
                setEditando(null);
                setError(undefined);
              }}
            />
          ) : (
            <Tarjeta
              key={proveedor.id}
              proveedor={proveedor}
              bovedaLista={bovedaLista}
              ocupado={ocupado === proveedor.id}
              onProbar={async () => {
                await ejecutar(proveedor.id, probarCompatibleAccion(proveedor.id));
              }}
              onEditar={() => {
                setError(undefined);
                setEditando(proveedor.id);
              }}
              onBorrar={() => setBorrando(proveedor)}
            />
          ),
        )}
      </div>

      {anadiendo ? (
        <FormularioCompatible
          ocupado={ocupado === "nuevo"}
          error={error}
          onGuardar={(datos) => guardar(datos, "nuevo")}
          onCancelar={() => {
            setAnadiendo(false);
            setError(undefined);
          }}
        />
      ) : (
        <Boton
          variante="secundario"
          disabled={!bovedaLista || proveedores.length >= COMPATIBLES_MAXIMOS}
          onClick={() => {
            setError(undefined);
            setAnadiendo(true);
          }}
        >
          Añadir un servicio
        </Boton>
      )}

      <p className="text-sm text-texto-suave">
        Cuando la reserva entra en juego, el aviso te dice qué servicio y qué modelo se han usado. Probar una clave aquí
        no consume cuota: solo se pide su lista de modelos.
      </p>

      <Dialogo
        abierto={borrando !== null}
        onAbiertoCambio={(abierto) => !abierto && setBorrando(null)}
        titulo={`¿Borrar ${borrando?.nombre ?? "el servicio"}?`}
        descripcion="Dejará de usarse como reserva hasta que lo vuelvas a añadir. La clave sigue siendo tuya en el servicio."
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setBorrando(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={async () => {
                const id = borrando?.id;
                setBorrando(null);
                if (id) await ejecutar(id, borrarCompatibleAccion(id));
              }}
            >
              Borrar
            </Boton>
          </>
        }
      />
    </Bloque>
  );
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Tarjeta({
  proveedor,
  bovedaLista,
  ocupado,
  onProbar,
  onEditar,
  onBorrar,
}: {
  proveedor: CompatibleVista;
  bovedaLista: boolean;
  ocupado: boolean;
  onProbar: () => Promise<void>;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const valido = proveedor.estado === "valida";
  return (
    <article className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-texto">{proveedor.nombre}</h3>
          <p className="font-mono text-sm text-texto-suave">{proveedor.urlBase}</p>
        </div>
        <span
          // alerta-permitida: insignia de validez de un modelo
          className={cn(
            "inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-bold [&>svg]:size-4",
            valido ? "border-correcto/45 text-correcto" : "border-error/45 text-error",
          )}
        >
          {valido ? <CheckCircle2 /> : <XCircle />}
          {valido ? "Funciona" : "No funciona"}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="text-texto-suave">Modelos, en orden:</span>
        {proveedor.modelos.map((modelo, indice) => (
          <span key={modelo} className="rounded-control border border-borde px-2 py-0.5 font-mono text-texto">
            {indice + 1}. {modelo}
          </span>
        ))}
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
        <div className="flex gap-1">
          <dt>Clave:</dt>
          <dd className="font-mono text-texto">••••{proveedor.pista}</dd>
        </div>
        {proveedor.ultimoDetalle && (
          <div className="flex gap-1">
            <dt>Última prueba:</dt>
            <dd className="text-texto">{proveedor.ultimoDetalle}</dd>
          </div>
        )}
        <div className="flex gap-1">
          <dt>{proveedor.ultimaRotacion ? "Sustituido:" : "Guardado:"}</dt>
          <dd>{fecha(proveedor.ultimaRotacion ?? proveedor.alta)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 border-t border-borde/50 pt-3">
        <Boton tamano="sm" variante="secundario" disabled={!bovedaLista} cargando={ocupado} onClick={onProbar}>
          Probar
        </Boton>
        <Boton tamano="sm" variante="secundario" disabled={!bovedaLista || ocupado} onClick={onEditar}>
          Cambiar
        </Boton>
        <Boton tamano="sm" variante="fantasma" disabled={ocupado} onClick={onBorrar}>
          Borrar
        </Boton>
      </div>
    </article>
  );
}
