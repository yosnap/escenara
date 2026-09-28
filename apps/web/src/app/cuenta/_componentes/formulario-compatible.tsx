"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { type ElementoOrdenable, ListaOrdenable } from "@/components/ui/lista-ordenable";
import { SelectorMultiple } from "@/components/ui/multi-select";
import {
  type CompatibleVista,
  categoriaDeModelo,
  MODELOS_MAXIMOS,
  NOMBRE_DE_CATEGORIA,
  PLANTILLAS,
} from "@/lib/compatible";
import { modelosDelServicioAccion } from "../acciones-compatibles";

/**
 * Alta o sustitución de un servicio compatible con la API de OpenAI. Es una **zona de claridad**: decide con qué
 * cuenta se va a consumir cuota, así que ni degradados ni animación.
 *
 * La clave se escribe entera siempre, también al sustituir: el servidor no la devuelve nunca.
 */
export interface DatosFormulario {
  nombre: string;
  urlBase: string;
  clave: string;
  modelos: string[];
  soloCuota: boolean;
}

export function FormularioCompatible({
  inicial,
  ocupado,
  error,
  onGuardar,
  onCancelar,
}: {
  /** Servicio que se está sustituyendo, o `undefined` al dar de alta uno nuevo. */
  inicial?: CompatibleVista;
  ocupado: boolean;
  error?: string;
  onGuardar: (datos: DatosFormulario) => Promise<boolean>;
  onCancelar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [urlBase, setUrlBase] = useState(inicial?.urlBase ?? "");
  const [modelos, setModelos] = useState<string[]>(inicial?.modelos ?? []);
  /** Modelos de texto que ofrece el servicio, cuando se han pedido; `null` mientras no se hayan cargado. */
  const [disponibles, setDisponibles] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [aMano, setAMano] = useState(false);
  const [clave, setClave] = useState("");
  // Un servicio ya guardado se guardó declarado como de cuota: es la única clase que se admite.
  const [soloCuota, setSoloCuota] = useState(Boolean(inicial));

  const aplicarPlantilla = (indice: number) => {
    const plantilla = PLANTILLAS[indice];
    if (!plantilla) return;
    setNombre(plantilla.nombre);
    setUrlBase(plantilla.urlBase);
    setModelos([...plantilla.modelos]);
    setSoloCuota(true);
  };

  const cargarModelos = async () => {
    setCargando(true);
    setErrorCarga("");
    const respuesta = await modelosDelServicioAccion({ urlBase, clave, id: inicial?.id });
    setCargando(false);
    if (!respuesta.ok) {
      setErrorCarga(respuesta.error);
      return;
    }
    // Los de imagen, vectores o reordenación no los usa Escenara: no se ofrecen.
    setDisponibles(respuesta.modelos.filter((m) => categoriaDeModelo(m) !== "otro").sort());
    setAMano(false);
  };

  const elegidos: ElementoOrdenable[] = modelos.map((modelo, indice) => ({
    clave: modelo,
    etiqueta: modelo,
    contenido: (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-16 shrink-0 text-sm text-texto-suave">{indice === 0 ? "Preferido" : `${indice + 1}.º`}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{modelo}</span>
        <span className="shrink-0 text-xs text-texto-suave">
          {NOMBRE_DE_CATEGORIA[categoriaDeModelo(modelo) as keyof typeof NOMBRE_DE_CATEGORIA] ?? ""}
        </span>
        <BotonIcono
          etiqueta={`Quitar ${modelo}`}
          disabled={ocupado}
          onClick={() => setModelos((lista) => lista.filter((m) => m !== modelo))}
        >
          <X className="size-4" />
        </BotonIcono>
      </div>
    ),
  }));

  const guardar = async () => {
    const ok = await onGuardar({
      nombre,
      urlBase,
      clave,
      modelos,
      soloCuota,
    });
    if (ok) setClave("");
  };

  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      {!inicial && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-texto-suave">Servicios ya comprobados:</span>
          {PLANTILLAS.map((plantilla, indice) => (
            <Boton
              key={plantilla.nombre}
              tamano="sm"
              variante="secundario"
              disabled={ocupado}
              onClick={() => aplicarPlantilla(indice)}
            >
              Rellenar con {plantilla.nombre}
            </Boton>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del servicio" ayuda="Es el nombre que verás en los avisos y en tu historial de gasto.">
          {(p) => (
            <EntradaTexto
              {...p}
              value={nombre}
              disabled={ocupado || Boolean(inicial)}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Dirección base"
          ayuda="La que termina en «/v1». Tiene que ser https y apuntar a un servidor público de internet."
        >
          {(p) => (
            <EntradaTexto
              {...p}
              inputMode="url"
              placeholder="https://api.nan.builders/v1"
              value={urlBase}
              disabled={ocupado}
              onChange={(e) => setUrlBase(e.target.value)}
            />
          )}
        </Campo>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-texto">Modelos</span>
          <Boton
            tamano="sm"
            variante="secundario"
            cargando={cargando}
            disabled={ocupado || urlBase.trim() === "" || (clave.trim() === "" && !inicial)}
            onClick={cargarModelos}
          >
            {disponibles ? "Volver a cargar la lista" : "Cargar modelos del servicio"}
          </Boton>
          <Boton tamano="sm" variante="fantasma" disabled={ocupado} onClick={() => setAMano((v) => !v)}>
            {aMano ? "Elegir de la lista" : "Escribirlos a mano"}
          </Boton>
        </div>
        <p className="text-sm text-texto-suave">
          {clave.trim() === "" && !inicial
            ? "Escribe la dirección y pega la clave para pedirle al servicio su lista de modelos (no consume cuota)."
            : `Los de texto se usan para traducir y escribir el guion, los de voz para leer diálogos y los de transcripción para los subtítulos; cada uno aparece en su apartado del mapa. Dentro de cada clase se prueban en el orden de abajo: arrástralos para cambiarlo. Como mucho ${MODELOS_MAXIMOS}.`}
        </p>
        {errorCarga && <p className="text-sm font-medium text-error">{errorCarga}</p>}

        {aMano ? (
          <Campo etiqueta="Modelos, uno por línea" ayuda="Para un modelo que el servicio atiende pero no lista.">
            {(p) => (
              <AreaTexto
                {...p}
                rows={4}
                className="font-mono"
                value={modelos.join("\n")}
                disabled={ocupado}
                onChange={(e) => setModelos(e.target.value.split("\n").map((m) => m.trim()))}
              />
            )}
          </Campo>
        ) : (
          disponibles && (
            <SelectorMultiple
              etiqueta={`Elige de los ${disponibles.length} modelos útiles del servicio (texto, voz y transcripción)`}
              opciones={disponibles.map((m) => ({
                value: m,
                label: m,
                descripcion: NOMBRE_DE_CATEGORIA[categoriaDeModelo(m) as keyof typeof NOMBRE_DE_CATEGORIA],
              }))}
              valor={modelos.filter((m) => disponibles.includes(m)).map((m) => ({ value: m, label: m }))}
              onCambio={(valor) => {
                const marcados = valor.map((o) => o.value);
                // Se conserva el orden ya elegido y lo nuevo va al final; lo que no está en la lista no se toca.
                setModelos((lista) => [
                  ...lista.filter((m) => marcados.includes(m) || !disponibles.includes(m)),
                  ...marcados.filter((m) => !lista.includes(m)),
                ]);
              }}
              marcador="Busca un modelo"
            />
          )
        )}

        {!aMano && modelos.filter((m) => m !== "").length > 0 && (
          <ListaOrdenable
            elementos={elegidos.filter((e) => e.clave !== "")}
            etiquetaLista="Orden de los modelos"
            deshabilitado={ocupado}
            className="flex flex-col gap-2"
            claseElemento="flex items-center gap-2 rounded-control border border-borde bg-elevada px-2 py-1"
            onOrden={async (claves) => {
              setModelos(claves);
              return null;
            }}
          />
        )}
      </div>

      <Casilla
        etiqueta="Este servicio cobra por cuota de mi plan, no por petición"
        descripcion="Escenara solo admite de momento servicios de cuota: sus llamadas se apuntan con 0 créditos y se pueden usar como reserva sin riesgo de un segundo cobro. Si el servicio cobra por petición (por ejemplo, la API de OpenAI de pago por uso), no lo añadas: Escenara no podría estimar ni confirmar lo que cuesta cada llamada."
        marcada={soloCuota}
        deshabilitado={ocupado}
        onCambio={setSoloCuota}
      />

      <Campo
        etiqueta="Clave de API"
        ayuda="Se guarda cifrada y no se vuelve a mostrar. Al guardar se comprueba con una llamada que no consume cuota."
        error={error}
      >
        {(p) => (
          <EntradaContrasena
            {...p}
            nombre="clave de API"
            value={clave}
            disabled={ocupado}
            onChange={(e) => setClave(e.target.value)}
          />
        )}
      </Campo>

      <div className="flex flex-wrap gap-3">
        <Boton cargando={ocupado} onClick={guardar}>
          {inicial ? "Guardar cambios" : "Añadir servicio"}
        </Boton>
        {onCancelar && (
          <Boton variante="fantasma" disabled={ocupado} onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
      </div>
    </div>
  );
}
