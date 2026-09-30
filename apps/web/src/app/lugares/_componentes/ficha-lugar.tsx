"use client";

import { ImagePlus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
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
  type LugarVista,
  NOMBRE_LUGAR_MAXIMO,
  NOMBRE_PAPEL_LUGAR,
  PAPELES_LUGAR,
  type PapelLugar,
  queFaltaAlLugar,
} from "@/lib/lugares";
import type { ResumenBorradoLugar } from "@/server/lugares/borrado";
import { DeclaracionLugar } from "./declaracion-lugar";
import { acabadoEnPalabras } from "./lista-lugares";

/**
 * Ficha de un lugar: sus datos, sus fotos con el papel de cada una (una sola maestra), su declaración, sus versiones
 * y su borrado. Las fotos se eligen con el **selector de medios de la biblioteca**: una foto de un lugar es una foto
 * del usuario como cualquier otra y quitarla de aquí no la borra.
 */
export function FichaLugar({ inicial }: { inicial: LugarVista }) {
  const router = useRouter();
  const [lugar, setLugar] = useState(inicial);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const [borrando, setBorrando] = useState<ResumenBorradoLugar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const faltas = queFaltaAlLugar(lugar);

  const aplicar = async (promesa: Promise<{ ok: true; datos: LugarVista } | { ok: false; error: string }>) => {
    setOcupado(true);
    setError("");
    const resultado = await promesa;
    setOcupado(false);
    if (resultado.ok) setLugar(resultado.datos);
    else setError(resultado.error);
  };

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
      {faltas.length > 0 && <Aviso tono="aviso">Para poder usarlo: {faltas.join(" ")}</Aviso>}

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
          La <strong className="text-texto">maestra</strong> es el plano general con la luz de referencia: es la única
          que se envía al generar y la que se compara con el resultado. Si sale gente reconocible, no la uses: sube
          otra.
        </p>
        {lugar.referencias.length === 0 ? (
          <Aviso tono="aviso">Este lugar no tiene fotos: sin maestra solo puede ir descrito con palabras.</Aviso>
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
                  {foto.generada && <span className="text-sm text-texto-suave">Editada aquí (sin personas).</span>}
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
        <p className="text-sm text-texto-suave">
          Quitar una foto de aquí no la borra de tu biblioteca. Cambiar las fotos o la maestra crea una versión nueva y
          retira la declaración.
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
