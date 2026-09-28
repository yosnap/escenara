"use client";

import { ScanFace } from "lucide-react";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { GrupoOpciones } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import {
  COMPROBACIONES,
  type Comprobacion,
  DESCRIPCION_COMPROBACION,
  MODOS_COHERENCIA,
  type ModoCoherencia,
  NOMBRE_COMPROBACION,
  NOMBRE_MODO,
} from "@/lib/coherencia";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Coherencia con Jev (RF13, 0.24.0): **qué se comprueba, en qué modo y con cuánta confianza**.
 *
 * Lo que aquí no se decide: qué pregunta se le hace a Jev (vive en el código, `server/coherencia/preguntas.ts`,
 * porque cambiar su texto cambia lo que significa su respuesta) ni con qué modelo se percibe más allá de cuál se
 * prueba primero: la lista sigue siendo el mapa de modelos de cada usuario.
 */

/** Modo y umbral de cada comprobación, emparejados con su ajuste. */
const CAMPOS: Record<Comprobacion, { modo: keyof Ajustes; umbral: keyof Ajustes }> = {
  identidad: { modo: "coherenciaIdentidad", umbral: "coherenciaUmbralIdentidad" },
  guion: { modo: "coherenciaGuion", umbral: "coherenciaUmbralGuion" },
  resultado: { modo: "coherenciaResultado", umbral: "coherenciaUmbralResultado" },
  emocion: { modo: "coherenciaEmocion", umbral: "coherenciaUmbralEmocion" },
  direccion_fiel: { modo: "coherenciaDireccionFiel", umbral: "coherenciaUmbralDireccionFiel" },
  producto_fiel: { modo: "coherenciaProductoFiel", umbral: "coherenciaUmbralProductoFiel" },
  angulo_fiel: { modo: "coherenciaAnguloFiel", umbral: "coherenciaUmbralAnguloFiel" },
  reparto_fiel: { modo: "coherenciaRepartoFiel", umbral: "coherenciaUmbralRepartoFiel" },
};

export function SeccionCoherencia({
  valores,
  errorDe,
  onCambio,
  pistaTypesafe,
  onGuardarSecreto,
  onQuitarSecreto,
  bovedaLista,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
  pistaTypesafe: string | null;
  onGuardarSecreto: (valor: string) => Promise<boolean>;
  onQuitarSecreto: () => Promise<void>;
  bovedaLista: boolean;
}) {
  return (
    <Seccion
      titulo="Coherencia"
      descripcion="Comprobar que lo generado encaja: que una vista es la misma persona, que la escena cubre el guion, que la emoción pega con su tono y que el clip hace lo que se dirigió. Se percibe con el mapa de modelos del usuario (por cuota de su plan, 0 créditos) y decide Jev con la clave de esta instalación."
      icono={<ScanFace />}
    >
      <CampoSecreto
        etiqueta="Clave de TypeSafe (Jev)"
        ayuda="La paga esta instalación, no cada usuario: lo que se comprueba es una regla de la casa. Se guarda cifrada en la bóveda y nunca vuelve al navegador. Sin ella, las comprobaciones no se hacen y se dice que falta."
        pista={pistaTypesafe}
        deshabilitado={!bovedaLista}
        onGuardar={onGuardarSecreto}
        onQuitar={onQuitarSecreto}
      />

      {COMPROBACIONES.map((comprobacion) => (
        <div key={comprobacion} className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde p-4">
          <div className="flex flex-col gap-1">
            <h4 className="font-bold text-texto">{NOMBRE_COMPROBACION[comprobacion]}</h4>
            <p className="text-sm text-texto-suave">{DESCRIPCION_COMPROBACION[comprobacion]}</p>
          </div>
          <GrupoOpciones
            etiqueta="Cómo se aplica"
            opciones={MODOS_COHERENCIA.map((modo) => ({
              value: modo,
              etiqueta: NOMBRE_MODO[modo],
              descripcion: DESCRIPCION_MODO[modo],
            }))}
            valor={valores[CAMPOS[comprobacion].modo] as ModoCoherencia}
            onCambio={(v) => onCambio(CAMPOS[comprobacion].modo, v as Ajustes[keyof Ajustes])}
          />
          <Campo
            etiqueta="Confianza mínima para actuar"
            ayuda="De 0,50 a 0,99. Por debajo de este número el veredicto es «míralo tú» y no decide nada. Ojo: la confianza dice cómo de concentrada está la respuesta del modelo, no cuántas veces acierta."
            error={errorDe(CAMPOS[comprobacion].umbral)}
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
                value={
                  Number.isNaN(valores[CAMPOS[comprobacion].umbral] as number)
                    ? ""
                    : (valores[CAMPOS[comprobacion].umbral] as number)
                }
                onChange={(e) =>
                  onCambio(
                    CAMPOS[comprobacion].umbral,
                    (e.target.value === "" ? Number.NaN : Number(e.target.value)) as Ajustes[keyof Ajustes],
                  )
                }
              />
            )}
          </Campo>
        </div>
      ))}

      <Campo
        etiqueta="Modelo de percepción de imagen"
        ayuda="El que se prueba primero dentro del mapa de cada usuario para describir una cara o un fotograma. Si él no lo tiene dado de alta, se recorre su mapa tal cual."
        error={errorDe("coherenciaModeloImagen")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            className="max-w-72"
            value={valores.coherenciaModeloImagen}
            onChange={(e) => onCambio("coherenciaModeloImagen", e.target.value)}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Modelo de percepción de audio"
        ayuda="El que describe la voz y el ambiente de un clip. Tiene que ser omnimodal: hoy, en NaN builders, solo «mimo-v2.5» y «mimo-v2.6-flash» oyen audio."
        error={errorDe("coherenciaModeloAudio")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            className="max-w-72"
            value={valores.coherenciaModeloAudio}
            onChange={(e) => onCambio("coherenciaModeloAudio", e.target.value)}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Euros por millón de tokens de entrada de Jev"
        ayuda="0 de fábrica: mientras no midas la tarifa, el panel enseña los tokens y no un euro inventado. La salida de Jev no se factura."
        error={errorDe("coherenciaEurosPorMillonTokens")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={0}
            step={0.001}
            inputMode="decimal"
            className="max-w-48"
            value={Number.isNaN(valores.coherenciaEurosPorMillonTokens) ? "" : valores.coherenciaEurosPorMillonTokens}
            onChange={(e) =>
              onCambio("coherenciaEurosPorMillonTokens", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>

      <Campo
        etiqueta="Comprobaciones de coherencia por usuario y día"
        ayuda="Jev lo paga esta instalación con su clave: el tope evita que un usuario gaste la cuenta pulsando «Comprobar» en bucle. Cuenta las últimas 24 horas."
        error={errorDe("coherenciaDecisionesPorDia")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="max-w-48"
            value={Number.isNaN(valores.coherenciaDecisionesPorDia) ? "" : valores.coherenciaDecisionesPorDia}
            onChange={(e) =>
              onCambio("coherenciaDecisionesPorDia", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>

      <p className="text-sm text-texto-suave">
        La cara y la voz de una <strong>persona real</strong> solo se envían a la percepción si su consentimiento lo
        autoriza expresamente. Sin esa autorización, la comprobación no se hace y sus vistas generadas no cuentan para
        la cobertura, igual que antes de la 0.24.0. Un personaje inventado no la necesita.
      </p>
    </Seccion>
  );
}

const DESCRIPCION_MODO: Record<ModoCoherencia, string> = {
  apagada: "No se percibe, no se pregunta y no se gasta nada.",
  sombra: "Se decide y se registra con su evidencia, y su veredicto no bloquea ni cambia nada. Sirve para medirlo.",
  activa: "Su veredicto decide de verdad. Enciéndelo cuando el panel de acierto diga que acierta.",
};
