"use client";

import { ImagePlus, Sparkles } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Boton } from "../button";
import { AreaTexto, Campo } from "../field";

/**
 * **La primera imagen de un lugar o de un producto**: las dos maneras de ponérsela, bien a la vista. Se usa en el
 * paso que sigue al alta («Su primera imagen») y en el estado vacío de la ficha, para que nadie se quede delante de
 * un botón apagado sin saber qué hacer.
 *
 * - **Generarla** abre el diálogo de imagen generada de la ficha (el coste a la vista antes de confirmar, el mismo
 *   cobro que un fotograma). Se genera desde la descripción guardada.
 * - **Subir fotos** abre el selector de la biblioteca, donde también se suben archivos nuevos.
 */

/** Textos de cada opción, propios del lugar o del producto. */
export interface TextosPrimeraImagen {
  generar: string;
  subir: string;
}

function TarjetaOpcion({
  icono,
  titulo,
  texto,
  tono,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  texto: string;
  tono: "chispa" | "cian";
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde/60 bg-elevada/40 p-4 transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:border-acento hover:shadow-lg">
      <span
        aria-hidden
        className={`flex size-12 items-center justify-center rounded-full text-[#182032] shadow-md [&>svg]:size-6 ${
          tono === "chispa" ? "bg-degradado-chispa" : "bg-[color-mix(in_srgb,var(--color-v-cian)_75%,white)]"
        }`}
      >
        {icono}
      </span>
      <strong className="text-lg text-texto">{titulo}</strong>
      <p className="text-sm text-texto-suave">{texto}</p>
      <div className="mt-auto flex flex-col gap-2">{children}</div>
    </li>
  );
}

/**
 * Las dos opciones lado a lado. Si no se puede generar, el motivo se lee dentro de su tarjeta (no en letra pequeña
 * junto a un botón apagado); `completar` sustituye al botón de generar cuando el propio paso deja arreglarlo.
 */
export function OpcionesPrimeraImagen({
  textos,
  motivoSinGenerar,
  ocupado,
  completar,
  onGenerar,
  onSubir,
}: {
  textos: TextosPrimeraImagen;
  /** `null` = se puede generar; si no, por qué no. */
  motivoSinGenerar: string | null;
  ocupado: boolean;
  completar?: ReactNode;
  onGenerar: () => void;
  onSubir: () => void;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      <TarjetaOpcion icono={<Sparkles />} titulo="Genera su primera imagen" texto={textos.generar} tono="chispa">
        {completar ?? (
          <>
            {motivoSinGenerar !== null && (
              <p className="text-sm font-semibold text-texto" data-motivo-sin-generar>
                {motivoSinGenerar}
              </p>
            )}
            <Boton
              variante="chispa"
              icono={<Sparkles className="size-5" />}
              disabled={ocupado || motivoSinGenerar !== null}
              onClick={onGenerar}
              data-opcion="generar"
            >
              Genera su primera imagen
            </Boton>
          </>
        )}
      </TarjetaOpcion>
      <TarjetaOpcion icono={<ImagePlus />} titulo="Sube tus fotos" texto={textos.subir} tono="cian">
        <Boton
          variante="cian"
          icono={<ImagePlus className="size-5" />}
          disabled={ocupado}
          onClick={onSubir}
          data-opcion="subir"
        >
          Sube tus fotos
        </Boton>
      </TarjetaOpcion>
    </ul>
  );
}

/**
 * **El paso «Su primera imagen»**, justo después del alta. Si la descripción guardada es demasiado corta para
 * generar, se completa aquí mismo y se genera sin volver a la ficha.
 */
export function PasoPrimeraImagen({
  nombre,
  textos,
  descripcion,
  minimo,
  maximo,
  pista,
  ocupado,
  onGuardarDescripcion,
  onGenerar,
  onSubir,
  onDespues,
}: {
  nombre: string;
  textos: TextosPrimeraImagen;
  /** Descripción guardada: es desde la que se genera. */
  descripcion: string;
  minimo: number;
  maximo: number;
  /** Qué conviene contar en la descripción para que la imagen salga bien. */
  pista: string;
  ocupado: boolean;
  /** Guarda la descripción completada; `true` si se ha guardado (si no, el error se ve en la ficha). */
  onGuardarDescripcion: (descripcion: string) => Promise<boolean>;
  onGenerar: () => void;
  onSubir: () => void;
  onDespues: () => void;
}) {
  const idTitulo = useId();
  const [texto, setTexto] = useState(descripcion);
  const corta = descripcion.trim().length < minimo;
  const faltan = Math.max(0, minimo - texto.trim().length);

  const guardarYGenerar = async () => {
    if (await onGuardarDescripcion(texto.trim())) onGenerar();
  };

  const completar = corta ? (
    <>
      <Campo
        etiqueta="Descripción para generarla"
        ayuda={
          faltan > 0
            ? `Para generarla hace falta describirlo un poco más: faltan ${faltan} ${faltan === 1 ? "letra" : "letras"}. ${pista}`
            : pista
        }
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={texto}
            maxLength={maximo}
            disabled={ocupado}
            className="min-h-20"
            onChange={(e) => setTexto(e.target.value)}
          />
        )}
      </Campo>
      <Boton
        variante="chispa"
        icono={<Sparkles className="size-5" />}
        disabled={ocupado || faltan > 0}
        onClick={() => void guardarYGenerar()}
        data-opcion="guardar-y-generar"
      >
        Guardar y generar
      </Boton>
    </>
  ) : undefined;

  return (
    <section
      aria-labelledby={idTitulo}
      data-paso-primera-imagen
      className="flex flex-col gap-5 rounded-tarjeta border-2 border-acento/60 bg-superficie p-6 shadow-xl shadow-v-coral/10"
    >
      <div className="flex flex-col gap-1">
        <h2 id={idTitulo} className="text-3xl font-bold text-texto">
          Su primera imagen
        </h2>
        <p className="text-texto-suave">
          «{nombre}» ya está creado. Ahora dale una imagen: es lo que hace que salga igual en todas tus escenas. Elige
          cómo:
        </p>
      </div>
      <OpcionesPrimeraImagen
        textos={textos}
        motivoSinGenerar={null}
        ocupado={ocupado}
        completar={completar}
        onGenerar={onGenerar}
        onSubir={onSubir}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto-suave">Podrás hacerlo cuando quieras desde la sección de fotos de su ficha.</p>
        <Boton variante="fantasma" tamano="sm" onClick={onDespues} disabled={ocupado} data-opcion="despues">
          Lo haré después
        </Boton>
      </div>
    </section>
  );
}

/** **Estado vacío de las fotos de la ficha**: explica las dos maneras de poner la primera imagen. */
export function VacioPrimeraImagen({
  texto,
  textos,
  motivoSinGenerar,
  ocupado,
  onGenerar,
  onSubir,
}: {
  /** Qué pasa mientras no tenga ninguna imagen. */
  texto: string;
  textos: TextosPrimeraImagen;
  motivoSinGenerar: string | null;
  ocupado: boolean;
  onGenerar: () => void;
  onSubir: () => void;
}) {
  return (
    <div
      data-vacio-primera-imagen
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-dashed border-borde/60 px-4 py-6"
    >
      <div className="flex flex-col gap-1 text-center">
        <h3 className="text-xl font-bold text-texto">Todavía no tiene ninguna imagen</h3>
        <p className="mx-auto max-w-xl text-texto-suave">{texto} Tienes dos maneras de ponerle la primera:</p>
      </div>
      <OpcionesPrimeraImagen
        textos={textos}
        motivoSinGenerar={motivoSinGenerar}
        ocupado={ocupado}
        onGenerar={onGenerar}
        onSubir={onSubir}
      />
    </div>
  );
}
