"use client";

import { BadgeCheck, Mic } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import { formatearCreditos } from "@/lib/generacion";
import {
  DESCRIPCION_VOZ_OMNI_POR_DEFECTO,
  EJEMPLO_VOZ_OMNI_MAXIMO,
  EJEMPLO_VOZ_OMNI_POR_DEFECTO,
  nombreDeVozOmni,
} from "@/lib/omni";
import type { EstadoOmniVista } from "@/lib/voz";

/**
 * Modo **Omni** de un proyecto (RF08, 0.22.0): la cara y la voz se registran una vez en el proveedor y todas las
 * escenas las citan, así que salen con la misma cara, la misma voz y los labios sincronizados.
 *
 * Dos cosas que la pantalla dice siempre, porque son las que deciden:
 *
 * - **registrar no cuesta créditos** (medido con dinero real), así que nunca hay un diálogo de gasto aquí;
 * - lo que sí cuesta es **cada escena**, y su cifra va delante, marcada como estimada cuando esa duración no se
 *   ha medido todavía.
 */
export function PanelVozOmni({
  omni,
  ocupado,
  onRegistrarVoz,
}: {
  omni: EstadoOmniVista;
  ocupado: boolean;
  /** Registra la voz del proyecto en el proveedor. El servidor pide confirmación si invalida algo generado. */
  onRegistrarVoz: (voz: string, descripcion: string, ejemplo: string) => void;
}) {
  const registrada = omni.voz;
  const [voz, setVoz] = useState(registrada?.voz ?? omni.voces[0]?.id ?? "");
  const [descripcion, setDescripcion] = useState(registrada?.descripcion ?? DESCRIPCION_VOZ_OMNI_POR_DEFECTO);
  const [ejemplo, setEjemplo] = useState(registrada?.ejemplo ?? EJEMPLO_VOZ_OMNI_POR_DEFECTO);
  const cambiada =
    registrada === null ||
    registrada.voz !== voz ||
    registrada.descripcion !== descripcion.trim() ||
    registrada.ejemplo !== ejemplo.trim();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-suave">
        La cara y la voz del protagonista se registran <strong className="text-texto">una vez</strong> en el proveedor y
        todas las escenas las citan: la misma cara, la misma voz y los labios sincronizados.{" "}
        <strong className="text-texto">Registrar no cuesta créditos</strong>; lo que cuesta es cada escena.
      </p>

      {/* Lo que costará cada escena, antes de producir nada. Sin precio registrado no se ofrece gastar. */}
      <div className="flex flex-col gap-1 rounded-tarjeta border-2 border-borde bg-elevada p-4">
        <p className="text-sm font-semibold text-texto">Lo que cuesta cada escena hablada</p>
        <p className="text-sm text-texto-suave">
          {omni.creditosPorEscena === null
            ? "Esta instalación no tiene ningún modelo de escenas habladas con precio registrado, así que no se puede estimar ni producir en este modo."
            : `${formatearCreditos(omni.creditosPorEscena)} por escena${omni.precioEstimado ? ", estimados: solo está medido el precio de los clips de 4 s, y el de las demás duraciones se calcula en proporción." : ", medido con esa duración."}`}
        </p>
      </div>

      <Selector
        etiqueta="Voz del proyecto"
        valor={voz}
        onCambio={(v) => setVoz(v ?? voz)}
        opciones={omni.voces.map((v) => ({
          value: v.id,
          label: v.nombre,
          descripcion: `${v.genero === "femenina" ? "Femenina" : "Masculina"} · ${v.tono}`,
        }))}
      />

      <Campo
        etiqueta="Cómo tiene que sonar"
        ayuda="Se le manda al proveedor tal cual. El acento va aquí: las treinta voces no lo declaran, y sin pedirlo no sale el de España."
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={descripcion}
            maxLength={2000}
            onChange={(e) => setDescripcion(e.target.value)}
            className="min-h-20"
          />
        )}
      </Campo>

      <Campo
        etiqueta="Frase de ejemplo"
        ayuda={`Una frase corta con la que el proveedor ajusta el tono. Hasta ${EJEMPLO_VOZ_OMNI_MAXIMO} caracteres.`}
      >
        {(props) => (
          <EntradaTexto
            {...props}
            value={ejemplo}
            maxLength={EJEMPLO_VOZ_OMNI_MAXIMO}
            onChange={(e) => setEjemplo(e.target.value)}
          />
        )}
      </Campo>

      <div className="flex flex-wrap items-center gap-3">
        <Boton
          icono={<Mic className="size-4" />}
          disabled={ocupado || !cambiada || descripcion.trim() === "" || ejemplo.trim() === ""}
          onClick={() => onRegistrarVoz(voz, descripcion.trim(), ejemplo.trim())}
        >
          {registrada === null ? "Registrar esta voz" : "Registrar otra voz"}
        </Boton>
        {registrada !== null && (
          <p className="flex items-center gap-1.5 text-sm text-texto-suave">
            <BadgeCheck className="size-4 text-acento" aria-hidden />
            Registrada <strong className="text-texto">{nombreDeVozOmni(registrada.voz)}</strong> el{" "}
            {new Date(registrada.registradaEn).toLocaleDateString("es-ES")}.
          </p>
        )}
      </div>

      {/* Estado del registro del personaje: lo que falta para poder producir, con su acción concreta. */}
      {omni.listo ? (
        <Aviso tono="correcto">
          {omni.personaje === ""
            ? "Todo registrado: las escenas de este proyecto saldrán con la misma cara y la misma voz."
            : `«${omni.personaje}» está registrado con esta voz: sus escenas saldrán todas con la misma cara y la misma voz.`}
        </Aviso>
      ) : (
        <Aviso tono="error">
          {omni.falta} Se registra desde la ficha del personaje y{" "}
          <strong className="font-semibold">no cuesta créditos</strong>.
        </Aviso>
      )}
    </div>
  );
}
