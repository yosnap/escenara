"use client";

import { ImagePlus, Sparkles, Star, Trash2, UserX } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { CargadorChispa } from "@/components/ui/chispa";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import {
  PasoPrimeraImagen,
  type TextosPrimeraImagen,
  VacioPrimeraImagen,
} from "@/components/ui/imagen-generada/primera-imagen";
import { LimiteDeCarga } from "@/components/ui/limite-de-carga";
import {
  anadirFotosALugar,
  borrarLugar,
  cambiarPapelDeFotoDeLugar,
  editarLugar,
  quitarFotoDeLugar,
  resumenDeBorradoDeLugar,
} from "@/components/ui/lugares/api-lugares";
import { DialogoSelectorMedios } from "@/components/ui/media/diferidos";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import {
  AYUDA_PAPEL_LUGAR,
  DESCRIPCION_LUGAR_MAXIMA,
  DESCRIPCION_MINIMA_PARA_GENERAR,
  type LugarVista,
  NOMBRE_LUGAR_MAXIMO,
  NOMBRE_PAPEL_LUGAR,
  PAPELES_LUGAR,
  type PapelLugar,
  queFaltaAlLugar,
} from "@/lib/lugares";
import type { ResumenBorradoLugar } from "@/server/lugares/borrado";
import { DeclaracionLugar } from "./declaracion-lugar";
import type { EncargoDeFoto } from "./dialogo-foto-generada";
import { acabadoEnPalabras } from "./lista-lugares";

/** El diálogo del coste (con el panel de controles) se descarga al pedir la primera foto generada, no con la ficha. */
const DialogoFotoGenerada = dynamic(() => import("./dialogo-foto-generada").then((m) => m.DialogoFotoGenerada), {
  ssr: false,
  loading: () => <CargadorChispa etiqueta="Cargando el coste" />,
});

/** Qué hace cada manera de poner la primera imagen, según el acabado del lugar. */
const textosPrimeraImagen = (animado: boolean): TextosPrimeraImagen => ({
  generar: animado
    ? "Una ilustración del lugar, vacía, creada desde su descripción y su estilo. Verás el coste antes de confirmar: hasta entonces no se cobra nada."
    : "Una foto realista del lugar, vacía, creada desde su descripción. Verás el coste antes de confirmar: hasta entonces no se cobra nada.",
  subir: animado
    ? "Elige ilustraciones de tu biblioteca o sube archivos nuevos. La primera que añadas será la maestra."
    : "Elige fotos del sitio de tu biblioteca o sube archivos nuevos. La primera que añadas será la maestra; si sale gente reconocible, mejor otra.",
});

const PISTA_DESCRIPCION_LUGAR = "Cuenta qué hay, los colores, los materiales y la luz.";

/**
 * Ficha de un lugar: sus datos, sus fotos con el papel de cada una (una sola maestra), su declaración, sus versiones
 * y su borrado. Sus imágenes también se pueden generar aquí, real o animado, desde la descripción y con el coste
 * confirmado. Las fotos se eligen con el **selector de medios de la biblioteca**: una foto de un lugar es una foto
 * del usuario como cualquier otra y quitarla de aquí no la borra.
 */
export function FichaLugar({
  inicial,
  primeraImagen = false,
}: {
  inicial: LugarVista;
  /** Recién creado: abre con el paso «Su primera imagen» en lugar de la ficha entera. */
  primeraImagen?: boolean;
}) {
  const router = useRouter();
  const [lugar, setLugar] = useState(inicial);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const [borrando, setBorrando] = useState<ResumenBorradoLugar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [encargo, setEncargo] = useState<EncargoDeFoto | null>(null);
  const [encargado, setEncargado] = useState("");
  const [paso, setPaso] = useState(primeraImagen);
  // Desde el primer encargo el diálogo se queda montado: al cerrarlo devuelve el foco al botón que lo abrió.
  const [dialogoCargado, setDialogoCargado] = useState(false);
  if (encargo && !dialogoCargado) setDialogoCargado(true);
  const faltas = queFaltaAlLugar(lugar);
  // Se genera desde la descripción **guardada**: con cambios sin guardar, el resultado no sería lo que se lee.
  const sinGuardar = nombre !== lugar.nombre || descripcion !== lugar.descripcion;
  const motivoSinGenerar =
    lugar.descripcion.trim().length < DESCRIPCION_MINIMA_PARA_GENERAR
      ? "Para generar, describe el lugar (qué hay, colores, luz) y guarda los cambios."
      : sinGuardar
        ? "Guarda los cambios antes de generar: se genera desde la descripción guardada."
        : null;
  const puedeGenerar = motivoSinGenerar === null;

  const aplicar = async (promesa: Promise<{ ok: true; datos: LugarVista } | { ok: false; error: string }>) => {
    setOcupado(true);
    setError("");
    const resultado = await promesa;
    setOcupado(false);
    if (resultado.ok) setLugar(resultado.datos);
    else setError(resultado.error);
  };

  /** Deja el paso y enseña la ficha entera; la dirección pierde el parámetro para que recargar no lo repita. */
  const salirDelPaso = () => {
    setPaso(false);
    window.history.replaceState(null, "", window.location.pathname);
  };

  /** Completar la descripción desde el paso: se guarda como en la ficha y el campo de la ficha la refleja. */
  const guardarDescripcion = async (nueva: string) => {
    setOcupado(true);
    setError("");
    const resultado = await editarLugar(lugar.id, { nombre: lugar.nombre, descripcion: nueva });
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return false;
    }
    setLugar(resultado.datos);
    setDescripcion(resultado.datos.descripcion);
    return true;
  };

  const textos = textosPrimeraImagen(lugar.acabado === "animado");

  const pedirBorrado = async () => {
    const resultado = await resumenDeBorradoDeLugar(lugar.id);
    if (resultado.ok) setBorrando(resultado.datos);
    else setError(resultado.error);
  };

  const confirmarBorrado = async () => {
    setOcupado(true);
    const resultado = await borrarLugar(lugar.id);
    setOcupado(false);
    setBorrando(null);
    if (resultado.ok) router.push("/lugares");
    else setError(resultado.error);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold text-texto">{lugar.nombre}</h1>
          <p className="mt-1 text-texto-suave">
            {acabadoEnPalabras(lugar)} · versión {lugar.version}
          </p>
        </div>
        <Boton variante="secundario" onClick={pedirBorrado} disabled={ocupado}>
          <Trash2 className="size-5" aria-hidden /> Borrar lugar
        </Boton>
      </div>

      {error !== "" && <Aviso tono="error">{error}</Aviso>}
      {encargado !== "" && <Aviso tono="correcto">{encargado}</Aviso>}
      {!paso && faltas.length > 0 && <Aviso tono="aviso">Para poder usarlo: {faltas.join(" ")}</Aviso>}

      {paso ? (
        <PasoPrimeraImagen
          nombre={lugar.nombre}
          textos={textos}
          descripcion={lugar.descripcion}
          minimo={DESCRIPCION_MINIMA_PARA_GENERAR}
          maximo={DESCRIPCION_LUGAR_MAXIMA}
          pista={PISTA_DESCRIPCION_LUGAR}
          ocupado={ocupado}
          onGuardarDescripcion={guardarDescripcion}
          onGenerar={() => setEncargo({ tipo: "candidato" })}
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
                  maxLength={NOMBRE_LUGAR_MAXIMO}
                  disabled={ocupado}
                  onChange={(e) => setNombre(e.target.value)}
                />
              )}
            </Campo>
            <Campo
              etiqueta="Descripción corta (en español)"
              ayuda="Es lo que ves tú de este lugar. Cambiarla crea una versión nueva y las escenas aprobadas que lo usan vuelven a borrador."
            >
              {(props) => (
                <AreaTexto
                  {...props}
                  value={descripcion}
                  maxLength={DESCRIPCION_LUGAR_MAXIMA}
                  disabled={ocupado}
                  className="min-h-20"
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              )}
            </Campo>
            <div className="flex justify-end">
              <Boton
                variante="secundario"
                onClick={() => aplicar(editarLugar(lugar.id, { nombre, descripcion }))}
                disabled={ocupado || nombre.trim() === ""}
              >
                Guardar cambios
              </Boton>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-texto">Fotos</h2>
              <Boton variante="chispa" onClick={() => setEligiendo(true)} disabled={ocupado}>
                <ImagePlus className="size-5" aria-hidden /> Añadir de la biblioteca
              </Boton>
            </div>
            <p className="text-texto-suave">
              La <strong className="text-texto">maestra</strong> es el plano general con la luz de referencia: es la
              única que se envía al generar y la que se compara con el resultado. Si sale gente reconocible, no la uses:
              sube otra.
            </p>
            {lugar.referencias.length === 0 ? (
              <VacioPrimeraImagen
                texto="Sin maestra, este lugar solo puede ir descrito con palabras."
                textos={textos}
                motivoSinGenerar={motivoSinGenerar}
                ocupado={ocupado}
                onGenerar={() => setEncargo({ tipo: "candidato" })}
                onSubir={() => setEligiendo(true)}
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {lugar.referencias.map((foto) => (
                  <li key={foto.id} className="flex gap-3 rounded-tarjeta border border-borde bg-elevada/40 p-3">
                    <span className="relative block size-20 shrink-0 overflow-hidden rounded-control border border-borde">
                      <MiniaturaMedio medio={foto.medio} />
                      {foto.papel === "maestra" && (
                        <Star className="absolute top-1 right-1 size-5 fill-acento text-acento" aria-label="Maestra" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Selector
                        etiqueta="Qué muestra"
                        valor={foto.papel}
                        deshabilitado={ocupado}
                        opciones={PAPELES_LUGAR.map((p) => ({
                          value: p,
                          label: NOMBRE_PAPEL_LUGAR[p],
                          descripcion: AYUDA_PAPEL_LUGAR[p],
                        }))}
                        onCambio={(v) => v && aplicar(cambiarPapelDeFotoDeLugar(lugar.id, foto.id, v as PapelLugar))}
                      />
                      {foto.generada && <span className="text-sm text-texto-suave">Generada o editada aquí.</span>}
                      {lugar.acabado === "realista" && !foto.generada && (
                        <Boton
                          variante="secundario"
                          tamano="sm"
                          className="self-start"
                          disabled={ocupado}
                          onClick={() =>
                            setEncargo({ tipo: "retirar-personas", referenciaId: foto.id, medioId: foto.medio.id })
                          }
                        >
                          <UserX className="size-4" aria-hidden /> Retirar personas
                        </Boton>
                      )}
                      {foto.medio.enPapelera && (
                        <span className="text-sm text-texto-suave">
                          Está en tu papelera: no se envía hasta que la restaures.
                        </span>
                      )}
                    </div>
                    <BotonIcono
                      etiqueta={`Quitar la foto ${foto.medio.titulo || foto.medio.nombre}`}
                      onClick={() => aplicar(quitarFotoDeLugar(lugar.id, foto.id))}
                      disabled={ocupado}
                    >
                      <Trash2 className="size-5" />
                    </BotonIcono>
                  </li>
                ))}
              </ul>
            )}
            {lugar.referencias.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Boton
                  variante="chispa"
                  disabled={ocupado || !puedeGenerar}
                  onClick={() => setEncargo({ tipo: "candidato" })}
                >
                  <Sparkles className="size-5" aria-hidden />{" "}
                  {lugar.acabado === "animado" ? "Generar un candidato" : "Generar una imagen"}
                </Boton>
                <span className="text-sm text-texto-suave">
                  {motivoSinGenerar ??
                    (lugar.acabado === "animado"
                      ? "Desde la descripción y el estilo, con el coste a la vista antes de confirmar. Marca como maestra el que apruebes, o sube una ilustración tuya."
                      : "Una foto realista del lugar desde su descripción, con el coste a la vista antes de confirmar. Entra marcada como generada; márcala como maestra si te gusta.")}
                </span>
              </div>
            )}
            <p className="text-sm text-texto-suave">
              Quitar una foto de aquí no la borra de tu biblioteca. Cambiar las fotos o la maestra crea una versión
              nueva y retira la declaración.
            </p>
          </section>

          <DeclaracionLugar key={lugar.declaracion?.id ?? "sin-declaracion"} lugar={lugar} onCambio={setLugar} />

          {lugar.versiones.length > 0 && (
            <section className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
              <h2 className="text-xl font-bold text-texto">Versiones</h2>
              <ul className="flex flex-col gap-1 text-sm text-texto-suave">
                {lugar.versiones.map((v) => (
                  <li key={v.numero}>
                    <strong className="text-texto">Versión {v.numero}</strong> · {v.cambios.join(", ")} ·{" "}
                    {new Date(v.creadaEn).toLocaleDateString("es-ES")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {dialogoCargado && (
        <LimiteDeCarga>
          <DialogoFotoGenerada
            key={encargo ? `${encargo.tipo}-${"referenciaId" in encargo ? encargo.referenciaId : ""}` : "ninguno"}
            lugarId={lugar.id}
            animado={lugar.acabado === "animado"}
            descripcion={lugar.descripcion}
            encargo={encargo}
            onCerrar={() => setEncargo(null)}
            onEncargado={(mensaje) => {
              setEncargo(null);
              setEncargado(mensaje);
              // Con la primera imagen encargada, el paso ha cumplido: se vuelve a la ficha con el aviso a la vista.
              if (paso) salirDelPaso();
            }}
          />
        </LimiteDeCarga>
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
          if (medios.length === 0) return;
          if (paso) salirDelPaso();
          // Sin maestra todavía, la primera que se añade lo es; las demás entran como plano general.
          void aplicar(
            anadirFotosALugar(
              lugar.id,
              medios.map((m, i) => ({ medioId: m.id, papel: !lugar.tieneMaestra && i === 0 ? "maestra" : "general" })),
            ),
          );
        }}
      />

      <Dialogo
        abierto={borrando !== null}
        onAbiertoCambio={(v) => !v && setBorrando(null)}
        titulo={`¿Borrar «${lugar.nombre}»?`}
        descripcion={
          borrando
            ? `Se borra su ficha, sus versiones y su declaración. Sus ${borrando.referencias} fotos siguen en tu biblioteca, y ${borrando.generados === 0 ? "no has generado nada con él" : `lo que generaste con él (${borrando.generados}) también se queda`}. ${borrando.escenas + borrando.proyectos === 0 ? "Ninguna escena ni proyecto lo usa." : "Las escenas y proyectos que lo usaban se quedan sin lugar, pero no se borran."}`
            : undefined
        }
        pie={
          <>
            <Boton variante="secundario" onClick={() => setBorrando(null)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={confirmarBorrado} disabled={ocupado}>
              {ocupado ? "Borrando…" : "Borrar el lugar"}
            </Boton>
          </>
        }
      />
    </div>
  );
}
