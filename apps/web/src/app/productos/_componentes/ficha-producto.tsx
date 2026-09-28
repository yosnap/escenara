"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { DialogoSelectorMedios } from "@/components/ui/media/dialogo-selector-medios";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import {
  anadirFotosAProducto,
  borrarProducto,
  cambiarPapelDeFoto,
  editarProducto,
  quitarFotoDeProducto,
  resumenDeBorrado,
} from "@/components/ui/productos/api-productos";
import { Selector } from "@/components/ui/select";
import {
  AYUDA_DESCRIPCION_PRODUCTO,
  AYUDA_PAPEL_REFERENCIA,
  DESCRIPCION_PRODUCTO_MAXIMA,
  DESCRIPCION_TIPO_PRODUCTO,
  NOMBRE_PAPEL_REFERENCIA,
  NOMBRE_PRODUCTO_MAXIMO,
  NOMBRE_TIPO_PRODUCTO,
  PAPELES_POR_TIPO,
  type PapelReferencia,
  PRODUCTO_SIN_FOTOS,
  type ProductoVista,
  TIPOS_PRODUCTO,
  type TipoProducto,
} from "@/lib/productos";
import type { ResumenBorradoProducto } from "@/server/productos/borrado";

/**
 * Ficha de un producto: sus datos, sus fotos con el papel de cada una y su borrado.
 *
 * Las fotos se eligen con el **selector de medios de la biblioteca**, el mismo de los personajes y de «Crear»:
 * no hay una subida propia de productos, porque una foto de producto es una foto del usuario como cualquier
 * otra y tiene que poder reutilizarse.
 *
 * El papel se pide **al añadir** y se puede cambiar después. Se pide entonces y no antes porque es cuando se
 * está mirando la foto: decidir «esta es la de la etiqueta» sin verla es adivinar.
 */
export function FichaProducto({ inicial }: { inicial: ProductoVista }) {
  const router = useRouter();
  const [producto, setProducto] = useState(inicial);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [tipo, setTipo] = useState<TipoProducto>(inicial.tipo);
  const [marcaVisible, setMarcaVisible] = useState(inicial.marcaVisible);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const [borrando, setBorrando] = useState<ResumenBorradoProducto | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const papeles = PAPELES_POR_TIPO[producto.tipo];
  /** Papel de fábrica al añadir: el primero del tipo, que es el que casi siempre toca. */
  const papelPorDefecto: PapelReferencia = papeles[0] ?? "envase";

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const resultado = await editarProducto(producto.id, { nombre, descripcion, tipo, marcaVisible });
    setGuardando(false);
    if (resultado.ok) setProducto(resultado.datos);
    else setError(resultado.error);
  };

  const aplicar = async (promesa: Promise<{ ok: true; datos: ProductoVista } | { ok: false; error: string }>) => {
    setOcupado(true);
    setError("");
    const resultado = await promesa;
    setOcupado(false);
    if (resultado.ok) setProducto(resultado.datos);
    else setError(resultado.error);
  };

  const pedirBorrado = async () => {
    const resultado = await resumenDeBorrado(producto.id);
    if (resultado.ok) setBorrando(resultado.datos);
    else setError(resultado.error);
  };

  const confirmarBorrado = async () => {
    setOcupado(true);
    const resultado = await borrarProducto(producto.id);
    setOcupado(false);
    setBorrando(null);
    if (resultado.ok) router.push("/productos");
    else setError(resultado.error);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-4xl font-bold text-texto">{producto.nombre}</h1>
        <Boton variante="secundario" onClick={pedirBorrado} disabled={ocupado}>
          <Trash2 className="size-5" aria-hidden /> Borrar producto
        </Boton>
      </div>

      {error !== "" && <Aviso tono="error">{error}</Aviso>}

      <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
        <h2 className="text-xl font-bold text-texto">Qué es</h2>
        <Campo etiqueta="Nombre">
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_PRODUCTO_MAXIMO}
              disabled={guardando}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Descripción corta (en español)" ayuda={AYUDA_DESCRIPCION_PRODUCTO}>
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={DESCRIPCION_PRODUCTO_MAXIMA}
              disabled={guardando}
              className="min-h-20"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          )}
        </Campo>
        <Selector
          etiqueta="Tipo"
          valor={tipo}
          deshabilitado={guardando}
          opciones={TIPOS_PRODUCTO.map((t) => ({
            value: t,
            label: NOMBRE_TIPO_PRODUCTO[t],
            descripcion: DESCRIPCION_TIPO_PRODUCTO[t],
          }))}
          onCambio={(v) => v && setTipo(v as TipoProducto)}
        />
        <Casilla
          etiqueta="En las fotos se ve una marca o un logotipo"
          descripcion="Solo para avisarte: el filtro del proveedor puede rechazar una marca ajena, y entonces no se cobra nada y se te dice por qué."
          marcada={marcaVisible}
          deshabilitado={guardando}
          onCambio={setMarcaVisible}
        />
        <div className="flex justify-end">
          <Boton variante="secundario" onClick={guardar} disabled={guardando || nombre.trim() === ""}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Boton>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-texto">Fotos de referencia</h2>
          <Boton variante="chispa" onClick={() => setEligiendo(true)} disabled={ocupado}>
            <ImagePlus className="size-5" aria-hidden /> Añadir de la biblioteca
          </Boton>
        </div>
        <p className="text-texto-suave">
          Di para qué sirve cada una. La frontal con la etiqueta es la que se compara con el resultado, y el detalle del
          mecanismo es la que hace falta para abrir la tapa.
        </p>

        {producto.fotos.length === 0 ? (
          <Aviso tono="info">{PRODUCTO_SIN_FOTOS}</Aviso>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {producto.fotos.map((foto) => (
              <li key={foto.id} className="flex gap-3 rounded-tarjeta border border-borde bg-elevada/40 p-3">
                <span className="block size-20 shrink-0 overflow-hidden rounded-control border border-borde">
                  <MiniaturaMedio medio={foto.medio} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Selector
                    etiqueta="Para qué sirve"
                    valor={foto.papel}
                    deshabilitado={ocupado}
                    opciones={papeles.map((p) => ({
                      value: p,
                      label: NOMBRE_PAPEL_REFERENCIA[p],
                      descripcion: AYUDA_PAPEL_REFERENCIA[p],
                    }))}
                    onCambio={(v) => v && aplicar(cambiarPapelDeFoto(producto.id, foto.id, v as PapelReferencia))}
                  />
                  {foto.medio.enPapelera && (
                    <span className="text-sm text-texto-suave">
                      Esta foto está en tu papelera: no describe nada hasta que la restaures.
                    </span>
                  )}
                </div>
                <BotonIcono
                  etiqueta={`Quitar la foto ${foto.medio.titulo || foto.medio.nombre}`}
                  onClick={() => aplicar(quitarFotoDeProducto(producto.id, foto.id))}
                  disabled={ocupado}
                >
                  <Trash2 className="size-5" />
                </BotonIcono>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-texto-suave">
          Quitar una foto de aquí no la borra de tu biblioteca: lo que desaparece es que este producto la use.
        </p>
      </section>

      <DialogoSelectorMedios
        abierto={eligiendo}
        onAbiertoCambio={setEligiendo}
        multiple
        tipos={["imagen"]}
        sinDocumentos
        inicial={[]}
        onConfirmar={(medios) => {
          setEligiendo(false);
          if (medios.length === 0) return;
          // Todas entran con el papel de fábrica del tipo y se corrige en la lista, que es donde se ven.
          void aplicar(
            anadirFotosAProducto(
              producto.id,
              medios.map((m) => ({ medioId: m.id, papel: papelPorDefecto })),
            ),
          );
        }}
      />

      <Dialogo
        abierto={borrando !== null}
        onAbiertoCambio={(v) => !v && setBorrando(null)}
        titulo={`¿Borrar «${producto.nombre}»?`}
        descripcion={
          borrando
            ? `Se borran ${borrando.derivados} ${borrando.derivados === 1 ? "medio generado" : "medios generados"} con él y sus ${borrando.referencias} ${borrando.referencias === 1 ? "foto asociada" : "fotos asociadas"}. ${borrando.escenas === 0 ? "Ninguna escena lo usa." : `${borrando.escenas} ${borrando.escenas === 1 ? "escena se queda" : "escenas se quedan"} sin producto, pero no se borran.`} Tus fotos de la biblioteca no se tocan.`
            : undefined
        }
        pie={
          <>
            <Boton variante="secundario" onClick={() => setBorrando(null)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={confirmarBorrado} disabled={ocupado}>
              {ocupado ? "Borrando…" : "Borrar de todas formas"}
            </Boton>
          </>
        }
      />
    </div>
  );
}
