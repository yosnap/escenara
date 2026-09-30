"use client";

import { useId, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import {
  controlesDeFotoDeLugar,
  encargarFotoDeLugar,
  estimacionDeFotoDeLugar,
} from "@/components/ui/lugares/api-lugares";
import { Dialogo } from "@/components/ui/overlay";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import { problemasDeMotivos } from "@/lib/llevar-al-problema";

const FALTA_DERECHOS = "Falta confirmar que puedes usar lo que se genere.";
const FALTA_AVISO_GASTO = "Falta aceptar el aviso de gasto.";

/** Qué se encarga: retirar a la gente de una foto del lugar, o un candidato del maestro de un lugar animado. */
export type EncargoDeFoto = { tipo: "retirar-personas"; referenciaId: string; medioId: string } | { tipo: "candidato" };

/**
 * **Foto generada de un lugar, con su coste confirmado.** Es una imagen, así que cuesta lo que un fotograma (unos 4
 * créditos con Nano Banana 2 Lite, medido el 2026-09-30) y pasa por la misma puerta: estimación con su fecha,
 * controles previos, casillas y aviso de gasto. El resultado entra en el lugar al terminar, como foto generada; no
 * sustituye a nada por su cuenta salvo a la maestra de la que se retiró la gente.
 */
export function DialogoFotoGenerada({
  lugarId,
  encargo,
  onCerrar,
  onEncargado,
}: {
  lugarId: string;
  encargo: EncargoDeFoto | null;
  onCerrar: () => void;
  onEncargado: (mensaje: string) => void;
}) {
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [controles, setControles] = useState<EvaluacionVista | null>(null);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [derechos, setDerechos] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const idCasilla = useId();

  const creditos = estimacion ? creditosAConfirmar(estimacion) : null;
  const firma = `${encargo?.tipo}|${estimacion?.sello ?? ""}|${creditos}|${firmaDeAvisos(confirmados)}`;
  const bloqueos = [
    ...(derechos ? [] : [FALTA_DERECHOS]),
    ...(estimacion?.superaUmbral && !avisoAceptado ? [FALTA_AVISO_GASTO] : []),
    ...(estimacion === null || estimacion.alcanza ? [] : ["Tu saldo del proveedor no llega para esta imagen."]),
    ...(controles ? bloqueosDeControles(controles, confirmados) : []),
  ];
  const problemas = problemasDeMotivos(bloqueos, {
    [FALTA_DERECHOS]: `${idCasilla}-derechos`,
    [FALTA_AVISO_GASTO]: `${idCasilla}-aviso-gasto`,
  });

  /** El coste se pide al abrir, no al cargar la ficha: mirar un lugar no consulta saldos. */
  const preparar = async () => {
    if (!encargo) return;
    setOcupado(true);
    setError(null);
    const precio = await estimacionDeFotoDeLugar(encargo.tipo === "candidato");
    if (!precio.ok) {
      setOcupado(false);
      setError(precio.error);
      return;
    }
    const previo = await controlesDeFotoDeLugar(
      encargo.tipo === "retirar-personas" ? encargo.medioId : null,
      precio.datos.modelo,
    );
    setOcupado(false);
    setEstimacion(precio.datos);
    if (previo.ok) setControles(previo.datos);
  };

  const encargar = async () => {
    if (!encargo || !estimacion || creditos === null) return;
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setOcupado(true);
    setError(null);
    const respuesta = await encargarFotoDeLugar(lugarId, {
      tipo: encargo.tipo,
      ...(encargo.tipo === "retirar-personas" ? { referenciaId: encargo.referenciaId } : {}),
      creditosConfirmados: creditos,
      derechos,
      claveIdempotencia: clave.current.valor,
      selloEstimacion: estimacion.sello,
      modelo: estimacion.modelo,
      avisoUmbralAceptado: avisoAceptado,
      avisosConfirmados: confirmados,
    });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onEncargado(
      encargo.tipo === "retirar-personas"
        ? "Encargado. La foto sin personas aparecerá en el lugar al terminar (recarga la página). Mírala antes de declarar: puede quedar gente pequeña al fondo."
        : "Encargado. El candidato aparecerá en el lugar al terminar (recarga la página). Si te gusta, márcalo como maestra.",
    );
  };

  const titulo = encargo?.tipo === "candidato" ? "Generar un candidato del lugar" : "Retirar a la gente de la foto";

  return (
    <Dialogo
      abierto={encargo !== null}
      onAbiertoCambio={(abierto) => {
        if (!abierto) onCerrar();
        else void preparar();
      }}
      titulo={titulo}
      descripcion={
        encargo?.tipo === "candidato"
          ? "Una imagen del lugar, vacía, desde su descripción y su estilo. Es una generación de imagen y se cobra."
          : "Una edición de imagen que quita a las personas y rehace lo que había detrás. Para hacerla, esta foto se envía tal cual, con las personas que salen en ella, a KIE y al proveedor del modelo que la edita. No se pixelan caras: el generador copiaría el pixelado."
      }
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Boton>
          {estimacion === null ? (
            <Boton variante="secundario" cargando={ocupado} onClick={() => void preparar()}>
              Ver lo que cuesta
            </Boton>
          ) : (
            <Boton cargando={ocupado} disabled={bloqueos.length > 0} onClick={() => void encargar()}>
              Encargar
            </Boton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Aviso tono="error">{error}</Aviso>}
        {estimacion && (
          <PanelCoste estimacion={estimacion}>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-texto-suave">
                Es una imagen:{" "}
                <strong className="text-texto">{creditos === null ? "—" : formatearCreditos(creditos)}</strong>.
              </p>
              <Casilla
                etiqueta="Puedo usar esta foto y lo que se genere con ella"
                marcada={derechos}
                requisito={`${idCasilla}-derechos`}
                onCambio={setDerechos}
                deshabilitado={ocupado}
              />
              {estimacion.superaUmbral && (
                <Casilla
                  etiqueta={`Sí, quiero gastar ${creditos === null ? "" : formatearCreditos(creditos)}`}
                  marcada={avisoAceptado}
                  requisito={`${idCasilla}-aviso-gasto`}
                  onCambio={setAvisoAceptado}
                  deshabilitado={ocupado}
                />
              )}
            </div>
          </PanelCoste>
        )}
        {controles && (
          <PanelAntesDeGenerar
            evaluacion={controles}
            confirmados={confirmados}
            deshabilitado={ocupado}
            onConfirmar={(regla, valor) =>
              setConfirmados((antes) => (valor ? [...new Set([...antes, regla])] : antes.filter((r) => r !== regla)))
            }
          />
        )}
        {estimacion && bloqueos.length > 0 && (
          <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={problemas} />
        )}
      </div>
    </Dialogo>
  );
}
