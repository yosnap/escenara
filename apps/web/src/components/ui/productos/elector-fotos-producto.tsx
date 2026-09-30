"use client";

import { useEffect, useState } from "react";
import {
  AVISO_SIN_LA_FRONTAL,
  alternarFoto,
  type CupoDeFotos,
  type FotoElegible,
  fotosQueCaben,
  fotosQueViajan,
  textoFotosQueCaben,
} from "@/lib/fotos-del-producto";
import { NOMBRE_PAPEL_REFERENCIA, type ProductoVista, type ReferenciaProducto } from "@/lib/productos";
import { Boton } from "../button";
import { Casilla } from "../choice";
import { Aviso } from "../feedback";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { obtenerProducto } from "./api-productos";

/**
 * **Elegir qué fotos del producto viajan con el clip** cuando no caben todas (mínimo viable).
 *
 * Sin elección el servidor envía las primeras por prioridad —la frontal con la etiqueta, siempre la primera—, así
 * que este elector solo aparece cuando **sobran fotos**, y marca de entrada exactamente las que se enviarían. Lo
 * que se elige no cambia lo que cuesta el clip ni las confirmaciones: solo cuáles de las fotos que ya caben van.
 *
 * El navegador limita la elección a lo que cabe, pero no es él quien manda: el servidor vuelve a comprobar que
 * las fotos son de ese producto, que no están en la papelera y que no pasan del tope.
 */

const fotoElegible = (f: ReferenciaProducto): FotoElegible => ({ medioId: f.medio.id, papel: f.papel, orden: f.orden });

/** Las fotos del producto que el servidor podría enviar: las que no están en la papelera. */
const vigentesDe = (producto: ProductoVista): ReferenciaProducto[] => producto.fotos.filter((f) => !f.medio.enPapelera);

export function ElectorFotosProducto({
  nombre,
  fotos,
  caben,
  marcadas,
  deshabilitado,
  onAlternar,
  onRestablecer,
}: {
  nombre: string;
  fotos: readonly ReferenciaProducto[];
  /** Cuántas caben con el modelo del clip. */
  caben: number;
  /** Las que se envían ahora, en orden de prioridad. */
  marcadas: readonly string[];
  deshabilitado?: boolean;
  onAlternar: (medioId: string) => void;
  /** Presente cuando hay una elección guardada: vuelve a las fotos de por defecto. */
  onRestablecer?: () => void;
}) {
  const frontal = fotos.find((f) => f.papel === "etiqueta");
  const sinFrontal = frontal !== undefined && !marcadas.includes(frontal.medio.id);
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-fondo/60 p-3">
      <p className="text-sm font-semibold text-texto">Fotos del producto que se envían</p>
      <p className="text-sm text-texto-suave">{textoFotosQueCaben(nombre, fotos.length, caben)}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {fotos.map((foto) => {
          const marcada = marcadas.includes(foto.medio.id);
          return (
            <li key={foto.id} className="flex items-center gap-3">
              <span className="block size-16 shrink-0 overflow-hidden rounded-control border border-borde">
                <MiniaturaMedio medio={foto.medio} alt={NOMBRE_PAPEL_REFERENCIA[foto.papel]} />
              </span>
              <Casilla
                etiqueta={NOMBRE_PAPEL_REFERENCIA[foto.papel]}
                marcada={marcada}
                // Con el cupo lleno solo se pueden quitar; y la última marcada no se quita: sin ninguna, el
                // servidor volvería a las de por defecto y lo que se ve no sería lo que se envía.
                deshabilitado={
                  deshabilitado || (!marcada && marcadas.length >= caben) || (marcada && marcadas.length <= 1)
                }
                onCambio={() => onAlternar(foto.medio.id)}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-sm font-medium text-texto" aria-live="polite">
        Se envían {marcadas.length} de {caben} posibles.
      </p>
      {sinFrontal && <Aviso tono="info">{AVISO_SIN_LA_FRONTAL}</Aviso>}
      {onRestablecer && (
        <Boton variante="secundario" tamano="sm" type="button" disabled={deshabilitado} onClick={onRestablecer}>
          Volver a las de por defecto
        </Boton>
      )}
    </div>
  );
}

/**
 * El elector conectado al producto elegido: lee sus fotos, calcula cuántas caben y **mantiene la elección
 * coherente** cuando algo cambia (otro modelo con menos hueco, una foto que se ha borrado): la recorta o la
 * quita en lugar de dejar que el servidor la rechace al generar.
 *
 * No se pinta nada si caben todas las fotos o si no cabe ninguna: en el segundo caso ya hay un aviso propio.
 */
export function FotosQueViajan({
  productoId,
  nombre,
  accion,
  cupo,
  elegidas,
  deshabilitado,
  onCambio,
}: {
  productoId: string;
  nombre: string;
  accion: string;
  /** Con qué se produce el clip: de ahí sale cuántas fotos del producto caben. */
  cupo: CupoDeFotos;
  /** Elección guardada en el clip; ausente = las de por defecto. */
  elegidas: readonly string[] | undefined;
  deshabilitado?: boolean;
  /** `undefined` = volver a las de por defecto. */
  onCambio: (medioIds: string[] | undefined) => void;
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
      else setError(`No se han podido leer las fotos del producto: ${r.error}`);
    });
    return () => {
      vigente = false;
    };
  }, [productoId]);

  const vigentes = producto ? vigentesDe(producto) : [];
  const caben = fotosQueCaben(cupo, vigentes.length);
  // Sobran fotos, o ya hay una elección guardada: con ella hecha se sigue enseñando, para ver qué se envía y poder
  // cambiarlo o volver a las de por defecto, aunque ahora quepan todas.
  const hayQueElegir = producto !== null && caben > 0 && (vigentes.length > caben || (elegidas?.length ?? 0) > 0);
  const marcadas = fotosQueViajan(vigentes.map(fotoElegible), accion, caben, elegidas);

  useEffect(() => {
    // En una escena el servidor recorta y avisa, y lo guardado no se toca desde aquí.
    if (!cupo.estricta || !producto || !elegidas || elegidas.length === 0 || !hayQueElegir) return;
    // Solo las elegidas que siguen siendo del producto y no están en la papelera, y sin pasar de lo que cabe. Si no
    // queda ninguna, no hay elección: no se guardan las de por defecto como si las hubiera elegido la persona.
    const ids = new Set(vigentes.map((f) => f.medio.id));
    const validas = fotosQueViajan(
      vigentes.map(fotoElegible),
      accion,
      caben,
      elegidas.filter((id) => ids.has(id)),
    );
    const conservadas = elegidas.some((id) => ids.has(id)) ? validas : [];
    // Se compara como conjunto: el orden depende de la acción y no es motivo para tocar lo que se eligió.
    if (conservadas.length === elegidas.length && conservadas.every((id) => elegidas.includes(id))) return;
    onCambio(conservadas.length > 0 ? conservadas : undefined);
  }, [cupo.estricta, producto, elegidas, hayQueElegir, caben, accion, vigentes, onCambio]);

  if (error !== "") return <Aviso tono="error">{error}</Aviso>;
  if (!hayQueElegir) return null;
  return (
    <ElectorFotosProducto
      nombre={nombre}
      fotos={ordenadasParaMostrar(vigentes, accion)}
      caben={caben}
      marcadas={marcadas}
      deshabilitado={deshabilitado}
      onAlternar={(medioId) => onCambio(alternarFoto(vigentes.map(fotoElegible), accion, caben, marcadas, medioId))}
      onRestablecer={elegidas && elegidas.length > 0 ? () => onCambio(undefined) : undefined}
    />
  );
}

/** Se enseñan en el mismo orden de prioridad con el que el servidor las envía: la frontal la primera. */
function ordenadasParaMostrar(fotos: readonly ReferenciaProducto[], accion: string): ReferenciaProducto[] {
  const orden = fotosQueViajan(fotos.map(fotoElegible), accion, fotos.length);
  return orden.flatMap((id) => fotos.filter((f) => f.medio.id === id));
}
