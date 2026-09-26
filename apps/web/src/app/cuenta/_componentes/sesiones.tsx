"use client";

import { Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { cerrarSesionDispositivo } from "../acciones";
import { Bloque } from "./bloque";

export interface SesionVista {
  id: string;
  agente: string;
  ip: string;
  creada: string;
}

/** Descripción legible del dispositivo a partir del agente de usuario (aproximada, sin librerías). */
function dispositivo(agente: string): { texto: string; movil: boolean } {
  const movil = /Mobile|Android|iPhone|iPad/i.test(agente);
  const navegador = /Edg\//.test(agente)
    ? "Edge"
    : /Firefox\//.test(agente)
      ? "Firefox"
      : /Chrome\//.test(agente)
        ? "Chrome"
        : /Safari\//.test(agente)
          ? "Safari"
          : "Navegador";
  const sistema = /iPhone|iPad/.test(agente)
    ? "iOS"
    : /Android/.test(agente)
      ? "Android"
      : /Mac OS X/.test(agente)
        ? "macOS"
        : /Windows/.test(agente)
          ? "Windows"
          : /Linux/.test(agente)
            ? "Linux"
            : "";
  return { texto: sistema ? `${navegador} en ${sistema}` : navegador, movil };
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function Sesiones({ actual, sesiones }: { actual: string; sesiones: SesionVista[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const otras = sesiones.filter((s) => s.id !== actual);

  const ejecutar = async (clave: string, accion: () => Promise<{ error: unknown }>) => {
    setOcupado(clave);
    setError(null);
    const { error } = await accion();
    setOcupado(null);
    if (error) return setError(mensajeError(error as { code?: string; status?: number }));
    router.refresh();
  };

  return (
    <Bloque
      titulo="Sesiones abiertas"
      descripcion="Dispositivos con la sesión iniciada. Cierra los que no reconozcas."
      icono={<MonitorSmartphone />}
    >
      <ul className="flex flex-col gap-2">
        {sesiones.map((s) => {
          const d = dispositivo(s.agente);
          const esActual = s.id === actual;
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-control border border-borde/60 px-4 py-2">
              {d.movil ? (
                <Smartphone className="size-4 shrink-0 text-acento" aria-hidden />
              ) : (
                <Laptop className="size-4 shrink-0 text-acento" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-texto">
                  {d.texto}
                  {esActual && <span className="ml-2 text-sm font-medium text-correcto">· Esta sesión</span>}
                </span>
                <span className="text-sm text-texto-suave">
                  Desde el {fecha(s.creada)}
                  {s.ip && ` · ${s.ip}`}
                </span>
              </span>
              {!esActual && (
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  cargando={ocupado === s.id}
                  disabled={ocupado !== null}
                  onClick={() =>
                    ejecutar(s.id, async () => {
                      const r = await cerrarSesionDispositivo(s.id);
                      return { error: r.ok ? null : { code: "SESSION_NOT_FOUND" } };
                    })
                  }
                >
                  Cerrar
                </Boton>
              )}
            </li>
          );
        })}
      </ul>
      {otras.length > 0 && (
        <Boton
          variante="secundario"
          icono={<LogOut className="size-4" />}
          className="self-start"
          cargando={ocupado === "otras"}
          disabled={ocupado !== null}
          onClick={() => ejecutar("otras", () => authCliente.revokeOtherSessions())}
        >
          Cerrar las demás sesiones
        </Boton>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </Bloque>
  );
}
