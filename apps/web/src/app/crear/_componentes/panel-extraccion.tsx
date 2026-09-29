"use client";

import { ScanSearch } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import type { Medio } from "@/lib/media/tipos";
import { ETIQUETA_AUTORIZO_PARECIDO } from "@/lib/personajes";
import { extraerCamposDeFoto, type SeisCExtraidas } from "./api-generacion";

/**
 * **Rellenar el fotograma desde una foto** (0.25.0): el usuario sube o elige una imagen que le gusta, se
 * describe con el servicio de percepción y de ahí salen la cámara, la ropa, el sitio y la luz, **en campos
 * que puede corregir**.
 *
 * Tres cosas que la pantalla respeta:
 *
 * - **no se genera nada hasta que él lo confirma.** Lo que un modelo cree ver no es lo que el usuario quiere
 *   pedir, y darlo por bueno sin que lo mire sería gastarle el dinero en la interpretación de otro;
 * - **no se lee quién es la persona de la foto.** La identidad sale de las referencias del personaje, no de
 *   lo que un modelo opine de una cara, y pedirlo abriría la puerta a los juicios de atractivo que el
 *   producto prohíbe;
 * - **no cuesta créditos**: la percepción se paga con la cuota del plan del propio usuario, como en la
 *   0.24.0. Se dice, para que nadie tema pulsar.
 */

const ETIQUETAS: Record<keyof SeisCExtraidas, { etiqueta: string; ayuda: string }> = {
  camara: { etiqueta: "Cámara", ayuda: "El plano, el ángulo y el tipo de lente que se ven en la foto." },
  ropa: { etiqueta: "Ropa", ayuda: "El outfit, el estilismo y los accesorios." },
  contexto: { etiqueta: "Sitio", ayuda: "Dónde está y qué se ve detrás." },
  luz: { etiqueta: "Luz", ayuda: "Qué luz hay, sus sombras y su grano." },
};

const ORDEN: (keyof SeisCExtraidas)[] = ["camara", "ropa", "contexto", "luz"];

export function PanelExtraccion({
  deshabilitado,
  onUsar,
}: {
  deshabilitado?: boolean;
  /** Lo que el usuario ha revisado, junto en una frase, para llevarlo al campo de la escena. */
  onUsar: (texto: string) => void;
}) {
  const [fotos, setFotos] = useState<Medio[]>([]);
  const [campos, setCampos] = useState<SeisCExtraidas | null>(null);
  const [sinLeer, setSinLeer] = useState<string>("");
  const [confirmoEnvio, setConfirmoEnvio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leer = async () => {
    const foto = fotos[0];
    if (!foto) return;
    setOcupado(true);
    setError(null);
    const respuesta = await extraerCamposDeFoto(foto.id, confirmoEnvio);
    setOcupado(false);
    if (!respuesta.ok) {
      // La causa concreta la trae el servidor (qué servicio falta y dónde se añade): se enseña tal cual.
      setError(respuesta.error);
      return;
    }
    setCampos(respuesta.datos.campos);
    setSinLeer(respuesta.datos.aviso);
  };

  const usar = () => {
    if (!campos) return;
    const texto = ORDEN.map((campo) => campos[campo].trim())
      .filter((valor) => valor !== "")
      .join(". ");
    if (texto !== "") onUsar(texto);
  };

  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-elevada/40 p-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-texto">
          <ScanSearch className="size-5 text-acento" />
          Partir de una foto que te guste
        </h3>
        <p className="mt-1 text-sm text-texto-suave">
          Se leen de ella la cámara, la ropa, el sitio y la luz, y los puedes corregir antes de generar.{" "}
          <strong className="text-texto">No cuesta créditos</strong> y{" "}
          <strong className="text-texto">no se genera nada</strong> hasta que tú lo digas. De quién sale en la foto no
          se lee nada: eso viene de tu personaje.
        </p>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <SelectorMedios
        etiqueta="Foto de referencia"
        ayuda="Solo imágenes. Puedes subirla, arrastrarla o elegirla de tu biblioteca."
        tipos={["imagen"]}
        sinDocumentos
        valor={fotos}
        onCambio={setFotos}
      />

      {/*
        Leer campos **sube la foto** a un servicio externo. Se dice antes de pulsar y se confirma: el servidor
        no envía nada sin esto, y con la foto de un personaje real exige además la casilla de comprobación de parecido de su consentimiento.
      */}
      {fotos.length > 0 && (
        <div className="rounded-tarjeta border border-borde bg-superficie p-3">
          <Casilla
            etiqueta="Envía esta foto al servicio de percepción para leer sus campos"
            descripcion={`La imagen sale de aquí y se sube al servicio que tengas configurado. No se lee quién sale en ella. Si es la foto de un personaje tuyo, hace falta además que en su consentimiento esté marcada «${ETIQUETA_AUTORIZO_PARECIDO}».`}
            marcada={confirmoEnvio}
            onCambio={setConfirmoEnvio}
            deshabilitado={deshabilitado}
          />
        </div>
      )}

      <Boton
        variante="secundario"
        tamano="sm"
        className="self-start"
        cargando={ocupado}
        disabled={deshabilitado || fotos.length === 0 || !confirmoEnvio}
        onClick={() => void leer()}
      >
        Leer los campos de esta foto
      </Boton>

      {campos && (
        <div className="flex flex-col gap-4">
          {sinLeer !== "" && <Aviso tono="info">{sinLeer}</Aviso>}
          {ORDEN.map((campo) => (
            <Campo key={campo} etiqueta={ETIQUETAS[campo].etiqueta} ayuda={ETIQUETAS[campo].ayuda}>
              {(props) => (
                <EntradaTexto
                  {...props}
                  value={campos[campo]}
                  disabled={deshabilitado}
                  onChange={(e) => setCampos({ ...campos, [campo]: e.target.value })}
                />
              )}
            </Campo>
          ))}
          <Boton className="self-start" disabled={deshabilitado} onClick={usar}>
            Usar estos campos en la escena
          </Boton>
        </div>
      )}
    </section>
  );
}
