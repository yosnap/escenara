"use client";

import Link from "next/link";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import type { ModeloElegible } from "@/lib/catalogo";
import { animaEstasMedidas } from "@/lib/formatos";
import type { Medio } from "@/lib/media/tipos";

/**
 * Aviso del paso del clip cuando **la imagen de partida no está en ninguna proporción que el modelo de vídeo elegido
 * sepa animar** (0.41.0), por ejemplo un fotograma 4:5 con un modelo que solo hace 9:16 y 16:9.
 *
 * Escenara no recorta la imagen por su cuenta, así que aquí se ofrecen las dos salidas que hay en «Crear», antes de
 * confirmar nada: pasar a uno de los modelos que sí la animan (con un botón por modelo) o recortarla en la biblioteca
 * y animar la copia. El servidor dice lo mismo si llega a pedirse igual, y no reserva nada.
 */
export function AvisoProporcionDelFotograma({
  origen,
  modelos,
  modeloElegido,
  deshabilitado,
  onModelo,
}: {
  origen: Medio;
  modelos: readonly ModeloElegible[];
  modeloElegido: string;
  deshabilitado?: boolean;
  onModelo: (modelo: string) => void;
}) {
  const medidas = { ancho: origen.ancho, alto: origen.alto };
  const elegido = modelos.find((m) => m.modelo === modeloElegido);
  if (!elegido || animaEstasMedidas(elegido.proporciones ?? [], medidas)) return null;
  const alternativas = modelos.filter(
    (m) => m.modelo !== modeloElegido && animaEstasMedidas(m.proporciones ?? [], medidas),
  );
  const admitidas = (elegido.proporciones ?? []).join(" o ");
  return (
    <Aviso tono="aviso">
      <span className="flex flex-col gap-2">
        <span>
          Esta imagen ({origen.ancho} × {origen.alto}) no está en ninguna proporción que {elegido.nombre} sepa animar (
          {admitidas}), y Escenara no la recorta por su cuenta. No se ha reservado nada.
        </span>
        {alternativas.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <span>Anímala con otro modelo:</span>
            {alternativas.map((m) => (
              <Boton
                key={m.modelo}
                variante="secundario"
                tamano="sm"
                disabled={deshabilitado}
                onClick={() => onModelo(m.modelo)}
              >
                Usar {m.nombre}
              </Boton>
            ))}
          </span>
        )}
        <span>
          O recórtala a {elegido.proporciones?.[0] ?? "9:16"} en tu biblioteca («Editar imagen») y elige esa copia como
          imagen de partida.{" "}
          <Link href="/biblioteca" className={claseBoton("secundario", "sm")}>
            Ir a la biblioteca
          </Link>
        </span>
      </span>
    </Aviso>
  );
}
