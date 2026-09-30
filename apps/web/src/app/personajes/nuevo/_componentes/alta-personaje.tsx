"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { GrupoOpciones } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { Paso } from "@/components/ui/paso";
import { anadirReferencias, crearPersonaje, registrarConsentimiento } from "@/components/ui/personajes/api-personajes";
import {
  bloqueosDeConsentimiento,
  CONSENTIMIENTO_INICIAL,
  type EstadoConsentimiento,
  FormularioConsentimiento,
} from "@/components/ui/personajes/formulario-consentimiento";
import { FotosRechazadas } from "@/components/ui/personajes/fotos-rechazadas";
import type { RechazoDeReferencia } from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import {
  DESCRIPCION_MAXIMA,
  ESPECIE_MAXIMA,
  ETIQUETA_TIPO_PERSONAJE,
  exigeDocumento,
  NOMBRE_MAXIMO,
  TIPOS_PERSONAJE,
  type TipoPersonaje,
} from "@/lib/personajes";

/**
 * Alta de un personaje en pasos: tipo, nombre, fotos de referencia, consentimiento y resumen. Es un solo
 * formulario con los pasos a la vista, no un asistente que esconda lo que viene después: así se ve de entrada
 * que el consentimiento es parte del alta y no un trámite posterior.
 *
 * El guardado va en tres peticiones (crear, añadir referencias, registrar consentimiento) porque son tres
 * operaciones distintas del servidor. Si alguna falla, el personaje ya creado se queda en borrador y se avisa
 * de qué ha fallado con un enlace a su ficha: nada se pierde y se puede terminar desde allí.
 */
/** Con qué se reanuda el alta después de que el control de calidad deje alguna foto fuera. */
interface OpcionesGuardar {
  /** Fotos marcadas que el usuario acepta usar igualmente. */
  deTodasFormas?: string[];
  /** Sigue sin tocar las fotos: las que entraron ya están y las rechazadas se quedan fuera. */
  omitirFotos?: boolean;
}

export function AltaPersonaje({ minimoReferencias }: { minimoReferencias: number }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPersonaje>("persona");
  const [nombre, setNombre] = useState("");
  const [especie, setEspecie] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<Medio[]>([]);
  const [consentimiento, setConsentimiento] = useState<EstadoConsentimiento>(CONSENTIMIENTO_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Personaje ya creado en un intento anterior. Guardarlo es lo que permite reintentar las fotos sin crear un
   * personaje repetido cada vez (y el nombre es único: el segundo intento daría un 409).
   */
  const [creadoId, setCreadoId] = useState<string | null>(null);
  /** Fotos que el control de calidad ha dejado fuera: se enseñan con su motivo y se pueden usar de todas formas. */
  const [rechazadas, setRechazadas] = useState<RechazoDeReferencia[]>([]);

  const nombreLimpio = nombre.trim();
  const bloqueos = [
    ...(nombreLimpio === "" ? ["Falta el nombre del personaje."] : []),
    ...(fotos.length >= minimoReferencias
      ? []
      : [`Faltan fotos de referencia: hacen falta ${minimoReferencias} y hay ${fotos.length}.`]),
    ...bloqueosDeConsentimiento(consentimiento),
  ];

  /**
   * Crea el personaje, le añade sus fotos y registra el consentimiento. Son tres operaciones del servidor, así
   * que se pueden reanudar: lo ya hecho no se repite.
   *
   * `deTodasFormas` son las fotos marcadas que el usuario acepta usar igualmente, y `omitirFotos` sigue sin las
   * que no se pueden añadir. Si el control de calidad deja alguna fuera, el alta **se detiene aquí** en vez de
   * llevarse el problema a la ficha: se dice qué pasa con cada foto y se decide.
   */
  const guardar = async ({ deTodasFormas = [], omitirFotos = false }: OpcionesGuardar = {}) => {
    setGuardando(true);
    setError(null);
    let id = creadoId;
    if (!id) {
      const creado = await crearPersonaje({ nombre: nombreLimpio, tipo, especie, descripcion });
      if (!creado.ok) {
        setGuardando(false);
        setError(creado.error);
        return;
      }
      id = creado.datos.id;
      setCreadoId(id);
    }
    if (!omitirFotos) {
      const conReferencias = await anadirReferencias(
        id,
        fotos.map((f) => f.id),
        deTodasFormas,
      );
      const rechazos = conReferencias.ok ? (conReferencias.datos.rechazos ?? []) : (conReferencias.rechazos ?? []);
      if (rechazos.length > 0) {
        setRechazadas(rechazos);
        setGuardando(false);
        return;
      }
      if (!conReferencias.ok) {
        setGuardando(false);
        setError(`El personaje se ha creado, pero sus fotos no: ${conReferencias.error} Termínalo desde su ficha.`);
        router.push(`/personajes/${id}`);
        return;
      }
    }
    setRechazadas([]);
    const registro = await registrarConsentimiento(id, {
      titular: consentimiento.titular,
      mayoriaDeEdad: consentimiento.mayoriaDeEdad,
      coherencia: consentimiento.coherencia,
      alcance: consentimiento.alcance,
      ...(exigeDocumento(consentimiento.titular) && consentimiento.documento[0]
        ? { documentoId: consentimiento.documento[0].id }
        : {}),
    });
    setGuardando(false);
    if (!registro.ok) {
      setError(`El personaje se ha creado, pero su consentimiento no: ${registro.error} Regístralo en su ficha.`);
    }
    router.push(`/personajes/${id}`);
  };

  return (
    <div className="flex flex-col gap-8">
      <Paso numero={1} titulo="¿Quién es?">
        <GrupoOpciones
          etiqueta="Tipo de personaje"
          opciones={TIPOS_PERSONAJE.map((t) => ({
            value: t,
            etiqueta: ETIQUETA_TIPO_PERSONAJE[t],
            descripcion:
              t === "persona"
                ? "Una persona real: tú o alguien que te haya dado su consentimiento por escrito."
                : "Un animal tuyo. No necesita documento firmado, pero sí tu declaración.",
          }))}
          valor={tipo}
          onCambio={(v) => setTipo(v as TipoPersonaje)}
        />
        <Campo etiqueta="Nombre" ayuda={`Cómo lo vas a reconocer en tu lista. Hasta ${NOMBRE_MAXIMO} caracteres.`}>
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_MAXIMO}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={tipo === "persona" ? "Lucía" : "Toby"}
            />
          )}
        </Campo>
        <Campo
          etiqueta={tipo === "animal" ? "Especie o raza (opcional)" : "Notas de identidad (opcional)"}
          ayuda={
            tipo === "animal"
              ? "«Gato siamés», «border collie»… Ayuda a describir escenas más adelante."
              : "Algún matiz que no sea descripción de escena, por ejemplo «gemela de Marta»."
          }
        >
          {(props) => (
            <EntradaTexto
              {...props}
              value={especie}
              maxLength={ESPECIE_MAXIMA}
              onChange={(e) => setEspecie(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Descripción (opcional)"
          ayuda="Se le pasa al modelo como contexto en cada fotograma y cada clip que hagas con él, así que describe lo que no debería cambiar entre escenas. Después puedes ampliarla en la pestaña «Ficha» del personaje."
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={DESCRIPCION_MAXIMA}
              onChange={(e) => setDescripcion(e.target.value)}
              className="min-h-24"
            />
          )}
        </Campo>
      </Paso>

      <Paso numero={2} titulo="Fotos de referencia">
        <SelectorMedios
          etiqueta={`Fotos del personaje (mínimo ${minimoReferencias})`}
          ayuda="Varias fotos de la misma persona o animal, con luces y ángulos distintos: es lo que mantiene la cara igual entre vídeos. Al generar se le envían varias, no una sola."
          tipos={["imagen"]}
          multiple
          sinDocumentos
          valor={fotos}
          onCambio={setFotos}
        />
      </Paso>

      <Paso numero={3} titulo="Consentimiento">
        <FormularioConsentimiento valor={consentimiento} onCambio={setConsentimiento} deshabilitado={guardando} />
      </Paso>

      <Paso numero={4} titulo="Resumen">
        <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ["Nombre", nombreLimpio || "Sin nombre"],
              ["Tipo", ETIQUETA_TIPO_PERSONAJE[tipo]],
              ["Fotos de referencia", `${fotos.length} de ${minimoReferencias} mínimas`],
              [
                "Consentimiento",
                exigeDocumento(consentimiento.titular)
                  ? "De otra persona: quedará en revisión hasta que se acepte el documento"
                  : "Tu declaración, con tu cuenta y la fecha",
              ],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-sm text-texto-suave">{etiqueta}</dt>
                <dd className="font-semibold text-texto">{valor}</dd>
              </div>
            ))}
          </dl>
          {bloqueos.length > 0 && (
            <Alerta
              tipo="bloqueo"
              compacta
              anuncio="ninguno"
              protege
              elementos={bloqueos.map((texto) => ({ texto }))}
            />
          )}
          {error && <Aviso tono="error">{error}</Aviso>}
          {creadoId && rechazadas.length > 0 && (
            <Aviso tono="info">
              El personaje ya está creado y su consentimiento se registrará en cuanto decidas qué hacer con las fotos de
              abajo.
            </Aviso>
          )}
          <FotosRechazadas
            rechazos={rechazadas}
            medios={fotos}
            ocupado={guardando}
            onUsarDeTodasFormas={(medioIds) => void guardar({ deTodasFormas: medioIds })}
            onSeguirSinEllas={() => void guardar({ omitirFotos: true })}
          />
          <Boton
            variante="chispa"
            icono={<Check className="size-5" />}
            className="self-start"
            cargando={guardando}
            disabled={bloqueos.length > 0}
            onClick={() => void guardar()}
          >
            {creadoId ? "Terminar el personaje" : "Crear el personaje"}
          </Boton>
        </div>
      </Paso>
    </div>
  );
}
