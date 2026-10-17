"use client";

import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { CargadorChispa } from "@/components/ui/chispa";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import {
  PasoPrimeraImagen,
  type TextosPrimeraImagen,
  VacioPrimeraImagen,
} from "@/components/ui/imagen-generada/primera-imagen";
import { LimiteDeCarga } from "@/components/ui/limite-de-carga";
import { DialogoSelectorMedios } from "@/components/ui/media/diferidos";
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
import type { Medio } from "@/lib/media/tipos";
import {
  AYUDA_DESCRIPCION_PRODUCTO,
  AYUDA_PAPEL_REFERENCIA,
  DESCRIPCION_MINIMA_PARA_GENERAR,
  DESCRIPCION_PRODUCTO_MAXIMA,
  DESCRIPCION_TIPO_PRODUCTO,
  MAXIMO_REFERENCIAS_PRODUCTO,
  NOMBRE_PAPEL_REFERENCIA,
  NOMBRE_PRODUCTO_MAXIMO,
  NOMBRE_TIPO_PRODUCTO,
  PAPELES_POR_TIPO,
  type PapelReferencia,
  type ProductoVista,
  TIPOS_PRODUCTO,
  type TipoProducto,
} from "@/lib/productos";
import type { ResumenBorradoProducto } from "@/server/productos/borrado";
import { DialogoPapelesFotos } from "./dialogo-papeles-fotos";

/** El diálogo del coste (con el panel de controles) se descarga al pedir la primera imagen, no con la ficha. */
const DialogoVistaGenerada = dynamic(() => import("./dialogo-vista-generada").then((m) => m.DialogoVistaGenerada), {
  ssr: false,
  loading: () => <CargadorChispa etiqueta="Cargando el coste" />,
});

/** Qué hace cada manera de poner la primera imagen de un producto. */
const TEXTOS_PRIMERA_IMAGEN: TextosPrimeraImagen = {
  generar:
    "Una vista del producto (la frontal con la etiqueta, el envase entero, un detalle) creada desde su descripción. Eliges la vista y ves el coste antes de confirmar: hasta entonces no se cobra nada.",
  subir:
    "Elige fotos del producto de tu biblioteca o sube archivos nuevos, y di qué muestra cada una. La frontal con la etiqueta es la que más ayuda.",
};

const PISTA_DESCRIPCION_PRODUCTO = "Cuenta qué es, su forma, sus colores y lo que pone en la etiqueta.";

/**
 * Ficha de un producto: sus datos, sus fotos con el papel de cada una y su borrado.
 *
 * Las fotos se eligen con el **selector de medios de la biblioteca**, el mismo de los personajes y de «Crear»:
 * no hay una subida propia de productos, porque una foto de producto es una foto del usuario como cualquier
 * otra y tiene que poder reutilizarse.
 *
 * El papel se pide **al añadir** (cada foto parte del papel neutro de su tipo, nunca de la etiqueta) y se puede
 * cambiar después. Se pide entonces y no antes porque es cuando se está mirando la foto: decidir «esta es la de la
 * etiqueta» sin verla es adivinar.
 *
 * Las imágenes de referencia también se pueden **generar aquí** desde la descripción guardada, eligiendo la vista,
 * con el coste confirmado como cualquier fotograma; entran marcadas como generadas.
 */
export function FichaProducto({
  inicial,
  primeraImagen = false,
}: {
  inicial: ProductoVista;
  /** Recién creado: abre con el paso «Su primera imagen» en lugar de la ficha entera. */
  primeraImagen?: boolean;
}) {
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

  const [porAnadir, setPorAnadir] = useState<Medio[]>([]);
  const [errorAlAnadir, setErrorAlAnadir] = useState("");
  const [generando, setGenerando] = useState(false);
  // Cada apertura es un encargo nuevo: el diálogo se rehace y no arrastra casillas ni la clave del anterior.
  const [apertura, setApertura] = useState(0);
  const [encargado, setEncargado] = useState("");
  const [paso, setPaso] = useState(primeraImagen);
  // Desde el primer encargo el diálogo se queda montado: al cerrarlo devuelve el foco al botón que lo abrió.
  const [dialogoCargado, setDialogoCargado] = useState(false);
  if (generando && !dialogoCargado) setDialogoCargado(true);

  const papeles = PAPELES_POR_TIPO[producto.tipo];
  // Se genera desde la descripción **guardada**: con cambios sin guardar, el resultado no sería lo que se lee.
  const sinGuardar = descripcion !== producto.descripcion || tipo !== producto.tipo;
  const motivoSinGenerar =
    producto.fotos.length >= MAXIMO_REFERENCIAS_PRODUCTO
      ? `Este producto ya tiene ${MAXIMO_REFERENCIAS_PRODUCTO} fotos, el máximo: quita alguna para generar otra.`
      : producto.descripcion.trim().length < DESCRIPCION_MINIMA_PARA_GENERAR
        ? "Para generar, describe el producto (qué es, forma, colores, etiqueta) y guarda los cambios."
        : sinGuardar
          ? "Guarda los cambios antes de generar: se genera desde la descripción guardada."
          : null;

  /** Abre el diálogo de generar como un encargo nuevo (sin casillas ni clave del anterior). */
  const abrirGenerar = () => {
    setApertura((n) => n + 1);
    setGenerando(true);
  };

  /** Deja el paso y enseña la ficha entera; la dirección pierde el parámetro para que recargar no lo repita. */
  const salirDelPaso = () => {
    setPaso(false);
    window.history.replaceState(null, "", window.location.pathname);
  };

  /** Completar la descripción desde el paso: se guarda como en la ficha y el campo de la ficha la refleja. */
  const guardarDescripcion = async (nueva: string) => {
    setGuardando(true);
    setError("");
    const resultado = await editarProducto(producto.id, {
      nombre: producto.nombre,
      descripcion: nueva,
      tipo: producto.tipo,
      marcaVisible: producto.marcaVisible,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return false;
    }
    setProducto(resultado.datos);
    setDescripcion(resultado.datos.descripcion);
    return true;
  };

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
      {encargado !== "" && <Aviso tono="correcto">{encargado}</Aviso>}

      {paso ? (
        <PasoPrimeraImagen
          nombre={producto.nombre}
          textos={TEXTOS_PRIMERA_IMAGEN}
          descripcion={producto.descripcion}
          minimo={DESCRIPCION_MINIMA_PARA_GENERAR}
          maximo={DESCRIPCION_PRODUCTO_MAXIMA}
          pista={PISTA_DESCRIPCION_PRODUCTO}
          ocupado={ocupado || guardando}
          onGuardarDescripcion={guardarDescripcion}
          onGenerar={abrirGenerar}
          onSubir={() => setEligiendo(true)}
          onDespues={salirDelPaso}
        />
      ) : (
        <>
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
              {/* Sin ninguna foto, las dos maneras de poner la primera las explica el estado vacío. */}
              {producto.fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundario" onClick={abrirGenerar} disabled={ocupado || motivoSinGenerar !== null}>
                    <Sparkles className="size-5" aria-hidden /> Generar una imagen
                  </Boton>
                  <Boton variante="chispa" onClick={() => setEligiendo(true)} disabled={ocupado}>
                    <ImagePlus className="size-5" aria-hidden /> Añadir de la biblioteca
                  </Boton>
                </div>
              )}
            </div>
            {producto.fotos.length > 0 && (
              <p className="text-sm text-texto-suave">
                {motivoSinGenerar ??
                  "«Generar una imagen» crea una vista del producto (la frontal, el envase, un detalle) desde su descripción guardada, con el coste a la vista antes de confirmar."}
              </p>
            )}
            <p className="text-texto-suave">
              Di para qué sirve cada una. La frontal con la etiqueta es la que se compara con el resultado, y el detalle
              del mecanismo es la que hace falta para abrir la tapa.
            </p>

            {producto.fotos.length === 0 ? (
              <VacioPrimeraImagen
                texto="Sin fotos, el modelo no sabe qué aspecto tiene este producto."
                textos={TEXTOS_PRIMERA_IMAGEN}
                motivoSinGenerar={motivoSinGenerar}
                ocupado={ocupado}
                onGenerar={abrirGenerar}
                onSubir={() => setEligiendo(true)}
              />
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
                      {foto.generada && <span className="text-sm text-texto-suave">Generada aquí con IA.</span>}
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
        </>
      )}

      <DialogoSelectorMedios
        abierto={eligiendo}
        onAbiertoCambio={setEligiendo}
        multiple
        tipos={["imagen"]}
        sinDocumentos
        inicial={[]}
        onConfirmar={(medios) => {
          setEligiendo(false);
          // Antes de añadirlas se dice qué muestra cada una: parten del papel neutro del tipo, no de la etiqueta.
          setPorAnadir(medios);
        }}
      />

      <DialogoPapelesFotos
        key={porAnadir.map((m) => m.id).join(",")}
        medios={porAnadir}
        tipo={producto.tipo}
        ocupado={ocupado}
        error={errorAlAnadir}
        onCancelar={() => {
          setPorAnadir([]);
          setErrorAlAnadir("");
        }}
        onAnadir={async (fotos) => {
          // Si el alta falla, el diálogo sigue abierto con la causa: no hay que volver a elegir las fotos.
          setOcupado(true);
          setErrorAlAnadir("");
          const resultado = await anadirFotosAProducto(producto.id, fotos);
          setOcupado(false);
          if (!resultado.ok) {
            setErrorAlAnadir(resultado.error);
            return;
          }
          setProducto(resultado.datos);
          setPorAnadir([]);
          // Con las primeras fotos puestas, el paso ha cumplido: se vuelve a la ficha.
          if (paso) salirDelPaso();
        }}
      />

      {dialogoCargado && (
        <LimiteDeCarga>
          <DialogoVistaGenerada
            key={`${producto.tipo}-${apertura}`}
            productoId={producto.id}
            tipo={producto.tipo}
            descripcion={producto.descripcion}
            abierto={generando}
            onCerrar={() => setGenerando(false)}
            onEncargado={(mensaje) => {
              setGenerando(false);
              setEncargado(mensaje);
              // Con la primera imagen encargada, el paso ha cumplido: se vuelve a la ficha con el aviso a la vista.
              if (paso) salirDelPaso();
            }}
          />
        </LimiteDeCarga>
      )}

      <Dialogo
        abierto={borrando !== null}
        onAbiertoCambio={(v) => !v && setBorrando(null)}
        titulo={`¿Borrar «${producto.nombre}»?`}
        descripcion={
          borrando
            ? `Se borra su ficha y se sueltan sus ${borrando.referencias} ${borrando.referencias === 1 ? "foto asociada" : "fotos asociadas"}. ${borrando.generados === 0 ? "Todavía no has generado nada con él." : `${borrando.generados} ${borrando.generados === 1 ? "vídeo o fotograma generado" : "vídeos y fotogramas generados"} con él se quedan en tu biblioteca: solo dejan de estar ligados al producto.`} ${borrando.escenas === 0 ? "Ninguna escena lo usa." : `${borrando.escenas} ${borrando.escenas === 1 ? "escena se queda" : "escenas se quedan"} sin producto, pero no se borran.`} Tus fotos de la biblioteca no se tocan.`
            : undefined
        }
        pie={
          <>
            <Boton variante="secundario" onClick={() => setBorrando(null)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={confirmarBorrado} disabled={ocupado}>
              {ocupado ? "Borrando…" : "Borrar el producto"}
            </Boton>
          </>
        }
      />
    </div>
  );
}
