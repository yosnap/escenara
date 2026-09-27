"use client";

import { ScanEye } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Umbrales de la revisión de continuidad (RF07, 0.20.0).
 *
 * **Aquí no se decide qué fallo es crítico**: eso vive en el código (`lib/revision.ts`), porque es una decisión de
 * producto y no un umbral. Lo que se ajusta es cuánta diferencia se tolera al medir el archivo, si se exige audio y
 * si se ofrece la revisión de pago.
 */
export function SeccionRevision({
  valores,
  errorDe,
  onCambio,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Revisión de continuidad"
      descripcion="Cómo se comprueban los clips producidos. Las comprobaciones técnicas no cuestan nada y solo miden el archivo: la identidad del personaje la valida siempre una persona."
      icono={<ScanEye />}
    >
      <Campo
        etiqueta="Tolerancia de duración (segundos)"
        ayuda="Diferencia que se acepta entre lo que dura el clip y los segundos que pedía la escena. Medio segundo de fábrica: un MP4 de 4 s mide 4,0–4,1 s según cómo se cierre el contenedor, y eso no es un formato incorrecto."
        error={errorDe("revisionToleranciaDuracion")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={0}
            max={5}
            step={0.1}
            inputMode="decimal"
            className="max-w-48"
            value={Number.isNaN(valores.revisionToleranciaDuracion) ? "" : valores.revisionToleranciaDuracion}
            onChange={(e) =>
              onCambio("revisionToleranciaDuracion", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>
      <Campo
        etiqueta="Segundos negros o congelados tolerados"
        ayuda="Metraje en negro o con el fotograma congelado que se acepta antes de avisar. Es un aviso, no un bloqueo: puede ser un fallo del modelo o una decisión de montaje."
        error={errorDe("revisionSegundosPlanosMaximos")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={0}
            max={60}
            step={0.1}
            inputMode="decimal"
            className="max-w-48"
            value={Number.isNaN(valores.revisionSegundosPlanosMaximos) ? "" : valores.revisionSegundosPlanosMaximos}
            onChange={(e) =>
              onCambio("revisionSegundosPlanosMaximos", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>
      <Interruptor
        etiqueta="Exigir que el clip lleve audio"
        descripcion="Apagado de fábrica: no todos los modelos de animación generan voz, así que con esto apagado la revisión dice si hay audio pero no lo cuenta como fallo."
        activo={valores.revisionExigirAudio}
        onCambio={(v) => onCambio("revisionExigirAudio", v)}
      />
      <Interruptor
        etiqueta="Ofrecer la revisión con modelo (cuesta créditos)"
        descripcion="Apagada de fábrica. Mirar un clip con un modelo cuesta dinero y solo añade una opinión: la identidad la valida la persona que revisa. Aunque la enciendas, cada revisión se estima y se confirma una por una y nunca se lanza sola."
        activo={valores.revisionMultimodalActiva}
        onCambio={(v) => onCambio("revisionMultimodalActiva", v)}
      />
      <p className="text-sm text-texto-suave">
        Las comprobaciones técnicas necesitan <span className="font-mono">ffprobe</span> y{" "}
        <span className="font-mono">ffmpeg</span> instalados en el servidor. Si faltan, la revisión lo dice con su
        mensaje y no muestra ningún resultado: un panel con vistos verdes por no tener FFmpeg sería peor que no
        comprobar nada.
      </p>
    </Seccion>
  );
}
