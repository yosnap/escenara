"use client";

import { ScanFace, ThumbsDown, ThumbsUp } from "lucide-react";
import { Boton } from "@/components/ui/button";
import {
  type CorreccionHumana,
  type DecisionVista,
  NOMBRE_VEREDICTO,
  type VeredictoCoherencia,
} from "@/lib/coherencia";

/**
 * Coherencia de una escena en la pantalla de revisión (0.24.0).
 *
 * Va **en sombra**, y eso se dice con todas las letras: lo que aparece aquí no bloquea la exportación, no cambia la
 * severidad de la escena y no acepta ni rechaza nada. Está para dos cosas: que el usuario vea si el sistema ha
 * entendido su escena, y que pueda decir si acierta. Esa corrección es la **única** etiqueta con la que se mide si
 * la comprobación sirve, así que los dos botones son el corazón de esta versión, no un adorno.
 *
 * La confianza se enseña como porcentaje **y con su advertencia**: es la forma de la respuesta del modelo, no una
 * tasa de acierto (PRD §9). Enseñarla sin decirlo sería invitar a confundirlas.
 */

const TONO: Record<VeredictoCoherencia, string> = {
  pasa: "border-correcto/45 text-correcto",
  revisar: "border-aviso/45 text-aviso",
  no_pasa: "border-error/45 text-error",
};

export function PanelCoherencia({
  decisiones,
  ocupado,
  onComprobar,
  onCorregir,
}: {
  decisiones: readonly DecisionVista[];
  ocupado: boolean;
  onComprobar: () => void;
  onCorregir: (decisionId: string, correccion: CorreccionHumana) => void;
}) {
  return (
    <section aria-label="Coherencia con el guion" className="flex flex-col gap-3 rounded-control bg-elevada p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-bold text-texto">Coherencia con el guion</h4>
        <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={onComprobar}>
          <ScanFace className="size-4" />
          {decisiones.length === 0 ? "Comprobar la coherencia" : "Volver a comprobar"}
        </Boton>
      </div>
      <p className="text-sm text-texto-suave">
        Estas comprobaciones <strong>no deciden nada</strong>: no bloquean la exportación ni cambian el estado de la
        escena. Se registran para ver si aciertan, y para eso hace falta que digas si tienen razón.
      </p>

      {decisiones.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Todavía no se ha comprobado esta escena. Mirar el fotograma y escuchar la voz se paga con la cuota de tu plan
          en el servicio que tengas en tu mapa de modelos: no cuesta créditos.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {decisiones.map((decision) => (
            <li key={decision.id} className="flex flex-col gap-2 rounded-control bg-superficie p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-texto">{decision.nombre}</p>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${TONO[decision.veredicto]}`}
                >
                  {NOMBRE_VEREDICTO[decision.veredicto]}
                </span>
              </div>
              <p className="text-sm text-texto-suave">{decision.evidencia}</p>
              <p className="text-xs text-texto-suave">
                Confianza {Math.round(decision.confianza * 100)} % (umbral {Math.round(decision.umbral * 100)} %). La
                confianza dice cómo de concentrada está la respuesta del modelo, no cuántas veces acierta. Decidió{" "}
                {decision.modeloDecision}
                {decision.modeloPercepcion === "" ? "" : ` sobre lo que describió ${decision.modeloPercepcion}`}.
              </p>
              {decision.correccion === null ? (
                <div className="flex flex-wrap gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={ocupado}
                    onClick={() => onCorregir(decision.id, "acierta")}
                  >
                    <ThumbsUp className="size-4" />
                    Tiene razón
                  </Boton>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={ocupado}
                    onClick={() => onCorregir(decision.id, "se_equivoca")}
                  >
                    <ThumbsDown className="size-4" />
                    Se equivoca
                  </Boton>
                </div>
              ) : (
                <p className="text-xs font-semibold text-texto-suave">
                  {decision.correccion === "acierta" ? "Dijiste que tiene razón." : "Dijiste que se equivoca."}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
