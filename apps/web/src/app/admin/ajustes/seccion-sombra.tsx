"use client";

import { Scale } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { NOMBRE_MODO } from "@/lib/coherencia";
import { costeEstimadoPorEvaluacion, NOMBRE_PREGUNTA_SOMBRA, TOKENS_ESTIMADOS_POR_EVALUACION } from "@/lib/decisiones";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Sombra de las decisiones (RF13): encender a Jev para que opine en paralelo sobre cada decisión del motor, sin
 * decidir nada, y ver **antes** lo que cuesta cada evaluación.
 *
 * Qué no se decide aquí: la pregunta (vive en el código, `server/decisiones/preguntas-sombra.ts`) ni la clave de
 * TypeSafe, que es la misma de la coherencia y se guarda en su sección.
 */
export function SeccionSombra({
  valores,
  errorDe,
  onCambio,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  const tarifa = valores.coherenciaEurosPorMillonTokens;
  const coste = Number.isNaN(tarifa) ? null : costeEstimadoPorEvaluacion(tarifa);
  const textoCoste =
    coste === null || tarifa === 0
      ? `Unos ${TOKENS_ESTIMADOS_POR_EVALUACION} tokens de entrada por evaluación. Sin tarifa de Jev en Coherencia, se apuntan a 0 €: ponla para ver el coste en euros.`
      : `Unos ${TOKENS_ESTIMADOS_POR_EVALUACION} tokens de entrada por evaluación: ≈ ${coste.toLocaleString("es-ES", { maximumFractionDigits: 6 })} € con la tarifa de Coherencia. El mismo guion no se paga dos veces.`;

  return (
    <Seccion
      titulo="Decisiones en sombra"
      descripcion="Jev opina en paralelo sobre cada decisión del motor de controles y su opinión se compara después con la revisión humana. No decide nada, el usuario no la ve y lo paga esta instalación con la clave de TypeSafe de Coherencia. Las cifras están en Admin › Decisiones."
      icono={<Scale />}
    >
      <Interruptor
        etiqueta="Encender la sombra"
        descripcion={`Apagada de fábrica: apagada no se pregunta nada ni se gasta nada. Encendida, manda a TypeSafe el guion y la descripción de cada escena que pasa por la puerta, sin esperar su respuesta. ${textoCoste}`}
        activo={valores.sombraActiva}
        onCambio={(v) => onCambio("sombraActiva", v)}
      />
      <Interruptor
        etiqueta={NOMBRE_PREGUNTA_SOMBRA.afirmacion_verificable}
        descripcion="Pregunta sobre el guion de la escena. Se compara con lo que hicieron las reglas, que ya frenan las afirmaciones marcadas sin verificar."
        activo={valores.sombraAfirmaciones}
        onCambio={(v) => onCambio("sombraAfirmaciones", v)}
      />
      <Campo
        etiqueta="Confianza mínima de esa pregunta"
        ayuda="De 0,50 a 0,99. Por debajo, la opinión cuenta como «no opina». No automatiza nada: solo ordena la medición hasta que haya datos para calibrarla."
        error={errorDe("sombraUmbralAfirmaciones")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={0.5}
            max={0.99}
            step={0.01}
            inputMode="decimal"
            className="max-w-48"
            value={Number.isNaN(valores.sombraUmbralAfirmaciones) ? "" : valores.sombraUmbralAfirmaciones}
            onChange={(e) =>
              onCambio("sombraUmbralAfirmaciones", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>
      <Campo
        etiqueta="Evaluaciones en sombra por usuario y día"
        ayuda="La sombra corre sola en cada envío y la paga esta instalación: el tope evita que un usuario la gaste sin saberlo. Pasado el tope no se evalúa, y la decisión sigue siendo la de las reglas."
        error={errorDe("sombraEvaluacionesPorDia")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="max-w-48"
            value={Number.isNaN(valores.sombraEvaluacionesPorDia) ? "" : valores.sombraEvaluacionesPorDia}
            onChange={(e) =>
              onCambio("sombraEvaluacionesPorDia", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>
      <p className="text-sm text-texto-suave">
        La otra pregunta que se mide, «{NOMBRE_PREGUNTA_SOMBRA.resultado.toLowerCase()}», es la comprobación del
        resultado de Coherencia y se enciende allí (ahora: {NOMBRE_MODO[valores.coherenciaResultado].toLowerCase()}).
      </p>
    </Seccion>
  );
}
