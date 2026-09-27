"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { InsigniaAfirmacion } from "@/components/ui/proyecto";
import {
  type AfirmacionVista,
  AYUDA_TIPO_AFIRMACION,
  FUENTE_AFIRMACION_MAXIMA,
  type ProyectoDetalle,
} from "@/lib/proyectos";
import { resolverAfirmacion } from "../../_componentes/api-proyectos";

/**
 * Afirmaciones señaladas en una escena, con sus tres acciones: verificar, corregir o descartar.
 *
 * Es una **zona de claridad**: fondo neutro y ninguna animación. Escenara no verifica nada por su cuenta, así
 * que aquí no hay ningún resultado automático que pueda parecer un aval; lo único que se guarda es la decisión
 * de una persona y la fuente que aporta. Verificar exige escribir esa fuente.
 */
export function PanelAfirmaciones({
  afirmaciones,
  onCambio,
  onError,
}: {
  afirmaciones: AfirmacionVista[];
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [fuentes, setFuentes] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (afirmaciones.length === 0) return null;

  const resolver = async (afirmacion: AfirmacionVista, estado: string) => {
    setOcupado(afirmacion.id);
    const resultado = await resolverAfirmacion(afirmacion.id, estado, fuentes[afirmacion.id] ?? afirmacion.fuente);
    setOcupado(null);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  return (
    <section
      aria-label="Afirmaciones por verificar"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-3"
    >
      <div>
        <h4 className="font-bold text-texto">Afirmaciones que conviene verificar</h4>
        <p className="text-sm text-texto-suave">
          Las señala Escenara leyendo el guion, sin llamar a ningún modelo y sin coste. No comprueba si son ciertas: eso
          lo decides tú.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {afirmaciones.map((afirmacion) => (
          <li
            key={afirmacion.id}
            className="flex flex-col gap-2 border-t border-borde/50 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaAfirmacion tipo={afirmacion.tipo} estado={afirmacion.estado} />
              <span className="text-sm text-texto-suave">{AYUDA_TIPO_AFIRMACION[afirmacion.tipo]}</span>
            </div>
            <p className="text-texto">«{afirmacion.texto}»</p>
            <Campo etiqueta="Fuente" ayuda="Obligatoria para marcarla como verificada.">
              {(p) => (
                <EntradaTexto
                  {...p}
                  value={fuentes[afirmacion.id] ?? afirmacion.fuente}
                  maxLength={FUENTE_AFIRMACION_MAXIMA}
                  placeholder="Estudio, página o dato concreto de donde sale"
                  onChange={(e) => setFuentes((previas) => ({ ...previas, [afirmacion.id]: e.target.value }))}
                />
              )}
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={ocupado === afirmacion.id}
                onClick={() => resolver(afirmacion, "verificada")}
              >
                Verificar
              </Boton>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={ocupado === afirmacion.id}
                onClick={() => resolver(afirmacion, "corregida")}
              >
                Corregir
              </Boton>
              <Boton
                variante="fantasma"
                tamano="sm"
                disabled={ocupado === afirmacion.id}
                onClick={() => resolver(afirmacion, "descartada")}
              >
                Descartar
              </Boton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
