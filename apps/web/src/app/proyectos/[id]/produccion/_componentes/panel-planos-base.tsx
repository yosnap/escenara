"use client";

import { Check, Clapperboard, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import type { EstadoPlanoBase, PlanosBaseVista } from "@/lib/continuidad";
import { soloFecha } from "@/lib/fechas";
import { formatearCreditos } from "@/lib/generacion";
import { aprobarPlanoBase, type ConfirmacionEnvio, consultarPlanosBase, pedirPlanosBase } from "./api-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";

const TEXTO_ESTADO: Record<EstadoPlanoBase, string> = {
  sin_pedir: "Sin pedir",
  en_marcha: "Generándose",
  listo: "Listo: míralo y dalo por bueno",
  aprobado: "Aprobado: sus escenas arrancan de él",
  fallido: "No ha salido",
};

/**
 * **Planos base** de un vídeo completo: un fotograma por personaje, situado en el lugar con su ropa fija, del que
 * arrancan todos los clips de ese plano. Así la cara, la ropa, el sitio y la luz no cambian de un corte a otro.
 *
 * Zona de claridad: lo que cuestan los planos que faltan va delante, con su fecha de precio, y se confirma una vez
 * por el total. Darlo por bueno no cuesta nada y lo hace una persona: el fotograma no se aprueba solo.
 */
export function PanelPlanosBase({
  proyectoId,
  inicial,
  umbral,
  onCambio,
}: {
  proyectoId: string;
  inicial: PlanosBaseVista;
  /** Umbral del aviso de gasto alto de Admin › Ajustes. */
  umbral: number;
  /** Se llama tras aprobar un plano: la rejilla tiene que releer sus fotogramas aprobados. */
  onCambio: () => void;
}) {
  const [vista, setVista] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const firma = vista.planos.map((p) => `${p.personajeId}:${p.estado}`).join(",");

  const ejecutar = async (
    accion: () => Promise<{ ok: true; datos: PlanosBaseVista } | { ok: false; error: string }>,
  ) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await accion();
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setVista(resultado.datos);
    onCambio();
  };

  const pedir = async (confirmacion: ConfirmacionEnvio) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await pedirPlanosBase(proyectoId, confirmacion);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setVista(resultado.datos.vista);
    if (resultado.datos.fallo) setAviso(resultado.datos.fallo);
  };

  const coste = vista.coste;
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-texto">
            <Clapperboard className="size-5 text-acento" aria-hidden />
            Planos base
          </h2>
          <p className="mt-1 text-sm text-texto-suave">
            Un fotograma por personaje, en el lugar y con su ropa fija. Todos los clips de ese plano arrancan de él, así
            que la cara, la ropa y el sitio no cambian entre cortes.
          </p>
        </div>
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<RefreshCw className="size-4" />}
          disabled={ocupado}
          onClick={() => void ejecutar(() => consultarPlanosBase(proyectoId))}
        >
          Actualizar
        </Boton>
      </div>

      {!vista.combinado && vista.planos.length > 0 && (
        <Aviso tono="info">
          De momento los clips no arrancan de su plano base: falta confirmar que la voz registrada se oye bien con la
          imagen. Hasta entonces, el lugar y la ropa viajan descritos en cada clip.
        </Aviso>
      )}
      {vista.motivo && <Aviso tono="info">{vista.motivo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="aviso">{aviso}</Aviso>}

      {vista.planos.length === 0 ? (
        <p className="text-sm text-texto-suave">Este vídeo no necesita planos base.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {vista.planos.map((plano) => (
            <li key={plano.personajeId} className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde p-3">
              <p className="font-semibold text-texto">{plano.nombre}</p>
              <p className="text-sm text-texto-suave">
                {plano.escenas.length === 1 ? "Escena" : "Escenas"} {plano.escenas.join(", ")} ·{" "}
                {TEXTO_ESTADO[plano.estado]}
              </p>
              {plano.medio && (
                // biome-ignore lint/performance/noImgElement: imagen de la biblioteca servida por la propia app.
                <img
                  src={plano.medio.url}
                  alt={`Plano base de ${plano.nombre}`}
                  className="aspect-[9/16] w-full max-w-48 rounded-control border-2 border-borde object-cover"
                />
              )}
              {plano.motivo && <Aviso tono="error">{plano.motivo}</Aviso>}
              {plano.estado === "listo" && (
                <Boton
                  tamano="sm"
                  icono={<Check className="size-4" />}
                  disabled={ocupado}
                  onClick={() => void ejecutar(() => aprobarPlanoBase(proyectoId, plano.personajeId))}
                >
                  Usarlo en sus escenas
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      {vista.sinPlano.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-texto-suave">
          {vista.sinPlano.map((s) => (
            <li key={s.orden}>
              Escena {s.orden}: {s.motivo}
            </li>
          ))}
        </ul>
      )}

      {coste === null && vista.motivo === null && (
        <Aviso tono="error">
          No hay ningún modelo de imagen con precio en tu mapa, así que no se puede estimar el plano base. Revisa tu
          mapa de modelos en «Tu cuenta».
        </Aviso>
      )}
      {coste && coste.porPedir > 0 && vista.motivo === null && (
        <ConfirmacionGasto
          titulo={
            coste.porPedir === 1 ? "Preparar el plano base que falta" : `Preparar los ${coste.porPedir} planos base`
          }
          explicacion={`${formatearCreditos(coste.creditosPorPlano)} por plano × ${coste.porPedir}, precio comprobado el ${soloFecha(coste.comprobado)}. Antes se registra con su voz, sin coste, a quien no lo esté. Cada plano aparta su importe por separado.`}
          creditos={coste.total}
          umbral={umbral}
          sello={coste.sello}
          etiqueta={coste.porPedir === 1 ? "Preparar el plano base" : `Preparar ${coste.porPedir} planos base`}
          firma={`planos-base|${firma}`}
          bloqueos={[]}
          avisosConfirmados={[]}
          ocupado={ocupado}
          onEnviar={(confirmacion) => void pedir(confirmacion)}
        />
      )}
    </section>
  );
}
