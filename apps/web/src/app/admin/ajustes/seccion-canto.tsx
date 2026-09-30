"use client";

import { MicVocal } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import { MODELOS_CANTO, NOMBRE_MODELO_CANTO, RESOLUCIONES_CANTO, SEGUNDOS_CANTO_MAXIMOS } from "@/lib/canto";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

export function SeccionCanto({
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
      titulo="Cantar con audio propio"
      descripcion="El audio lo aporta quien usa la instalación. Antes de generar se exigen sus derechos, el consentimiento del personaje, un retrato vertical y una estimación por segundo."
      icono={<MicVocal />}
    >
      <Interruptor
        etiqueta="Ofrecer canto con audio propio"
        descripcion="Apagado de fábrica hasta aprobar una prueba real de pago. Apagarlo impide generar, sin borrar los audios ni sus declaraciones."
        activo={valores.cantoActivo}
        onCambio={(v) => onCambio("cantoActivo", v)}
      />
      <Selector
        etiqueta="Modelo de canto"
        valor={valores.cantoModelo}
        opciones={MODELOS_CANTO.map((modelo) => ({ value: modelo, label: NOMBRE_MODELO_CANTO[modelo] }))}
        onCambio={(modelo) => {
          if (!modelo) return;
          onCambio("cantoModelo", modelo);
          if (modelo === "kling/v1-avatar-standard") onCambio("cantoResolucion", "720p");
        }}
      />
      {errorDe("cantoModelo") && <Aviso tono="error">{errorDe("cantoModelo")}</Aviso>}
      <Campo
        etiqueta="Duración máxima del audio (segundos)"
        ayuda={`De 1 a ${SEGUNDOS_CANTO_MAXIMOS} s. Los audios más largos se rechazan antes de reservar créditos.`}
        error={errorDe("cantoSegundosMaximos")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            max={SEGUNDOS_CANTO_MAXIMOS}
            value={valores.cantoSegundosMaximos}
            onChange={(e) => onCambio("cantoSegundosMaximos", Number(e.target.value))}
          />
        )}
      </Campo>
      <Selector
        etiqueta="Resolución"
        valor={valores.cantoResolucion}
        opciones={RESOLUCIONES_CANTO.map((resolucion) => ({
          value: resolucion,
          label: resolucion,
          descripcion: resolucion === "480p" ? "Menor coste por segundo" : "Más detalle y mayor coste",
          deshabilitada: valores.cantoModelo === "kling/v1-avatar-standard" && resolucion === "480p",
        }))}
        onCambio={(resolucion) => resolucion && onCambio("cantoResolucion", resolucion)}
      />
      {errorDe("cantoResolucion") && <Aviso tono="error">{errorDe("cantoResolucion")}</Aviso>}
      <p className="text-sm text-texto-suave">
        El precio publicado es una estimación; el cobro final lo informa el proveedor. La declaración de derechos
        siempre es obligatoria y no tiene interruptor.
      </p>
    </Seccion>
  );
}
