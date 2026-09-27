"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const nombreLimpio = nombre.trim();
  const bloqueos = [
    ...(nombreLimpio === "" ? ["Falta el nombre del personaje."] : []),
    ...(fotos.length >= minimoReferencias
      ? []
      : [`Faltan fotos de referencia: hacen falta ${minimoReferencias} y hay ${fotos.length}.`]),
    ...bloqueosDeConsentimiento(consentimiento),
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const creado = await crearPersonaje({ nombre: nombreLimpio, tipo, especie, descripcion });
    if (!creado.ok) {
      setGuardando(false);
      setError(creado.error);
      return;
    }
    const id = creado.datos.id;
    const conReferencias = await anadirReferencias(
      id,
      fotos.map((f) => f.id),
    );
    if (!conReferencias.ok) {
      setGuardando(false);
      setError(`El personaje se ha creado, pero sus fotos no: ${conReferencias.error} Termínalo desde su ficha.`);
      router.push(`/personajes/${id}`);
      return;
    }
    const registro = await registrarConsentimiento(id, {
      titular: consentimiento.titular,
      mayoriaDeEdad: consentimiento.mayoriaDeEdad,
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
            <ul className="flex list-inside list-disc flex-col gap-1 text-texto-suave">
              {bloqueos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          )}
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton
            variante="chispa"
            icono={<Check className="size-5" />}
            className="self-start"
            cargando={guardando}
            disabled={bloqueos.length > 0}
            onClick={guardar}
          >
            Crear el personaje
          </Boton>
        </div>
      </Paso>
    </div>
  );
}
