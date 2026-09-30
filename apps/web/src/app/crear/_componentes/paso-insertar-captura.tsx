"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { obtenerProducto } from "@/components/ui/productos/api-productos";
import type { Estimacion } from "@/lib/generacion";
import {
  DESCRIPCION_PASO_DIGITAL,
  DIGITAL_SIN_CAPTURA,
  NOMBRE_PASO_DIGITAL,
  type ProductoVista,
} from "@/lib/productos";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import type { ConfirmacionCoste } from "./panel-generar";
import type { Controles } from "./use-controles";

/**
 * **Segundo paso del producto digital en «Crear»**: meter tu captura dentro de la pantalla apagada del
 * fotograma que acabas de generar.
 *
 * Es una generación aparte con su propio coste y su propia confirmación, y se ve como tal: aquí se enseña la
 * captura que se va a insertar, para que nadie pague por insertar otra cosa. Solo aparece cuando el producto
 * elegido es digital; con uno físico no hay pantalla donde insertar nada.
 *
 * Si el producto no tiene ninguna captura se dice **con su causa** y no se ofrece el botón: no hay nada que
 * insertar y el servidor lo rechazaría igual.
 */
export function PasoInsertarCaptura({
  productoId,
  controles,
  estimacion,
  firma,
  enviando,
  onGenerar,
}: {
  productoId: string;
  controles: Controles;
  estimacion: Estimacion;
  firma: string;
  enviando: boolean;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  const [producto, setProducto] = useState<ProductoVista | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    setProducto(null);
    setError("");
    obtenerProducto(productoId).then((r) => {
      if (!vigente) return;
      if (r.ok) setProducto(r.datos);
      else setError(`No se ha podido leer el producto: ${r.error}`);
    });
    return () => {
      vigente = false;
    };
  }, [productoId]);

  if (error !== "") return <Aviso tono="error">{error}</Aviso>;
  // Con un producto físico no hay segundo paso: no hay ninguna pantalla en la que insertar nada.
  if (producto?.tipo !== "digital") return null;

  const captura = producto.fotos.find((f) => f.papel === "captura_pantalla") ?? null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-texto-suave">{DESCRIPCION_PASO_DIGITAL.insertar_captura}</p>
      {captura ? (
        <>
          <div className="flex items-center gap-3">
            <span className="block size-16 shrink-0 overflow-hidden rounded-control border border-borde">
              <MiniaturaMedio medio={captura.medio} />
            </span>
            <p className="text-sm text-texto-suave">Esta es la captura que se va a insertar en la pantalla.</p>
          </div>
          <BloqueConfirmacion
            controles={controles}
            estimacion={estimacion}
            etiqueta={NOMBRE_PASO_DIGITAL.insertar_captura}
            firma={firma}
            bloqueos={[]}
            envio="insercion"
            paso="fotograma"
            conProducto
            enviando={enviando}
            onGenerar={onGenerar}
          />
        </>
      ) : (
        <Aviso tono="info">{DIGITAL_SIN_CAPTURA}</Aviso>
      )}
    </div>
  );
}
