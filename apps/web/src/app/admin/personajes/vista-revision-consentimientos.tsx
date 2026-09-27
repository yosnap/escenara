"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import { revisarConsentimiento } from "@/components/ui/personajes/api-personajes";
import { ETIQUETA_ALCANCE, ETIQUETA_TIPO_PERSONAJE, MOTIVO_MAXIMO, type PersonajeVista } from "@/lib/personajes";

/**
 * Revisión humana de los consentimientos de terceros. Es la contrapartida de la decisión de la fase 13: un
 * documento firmado no vale por estar subido, lo mira una persona.
 *
 * Aquí se ve el documento con su enlace temporal firmado. Es un dato personal delicado: solo se abre desde
 * esta pantalla, solo para administradores y solo para decidir.
 */
export function VistaRevisionConsentimientos({
  pendientes,
  total,
  pagina,
  porPagina,
}: {
  pendientes: PersonajeVista[];
  total: number;
  pagina: number;
  porPagina: number;
}) {
  const [lista, setLista] = useState(pendientes);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const resolver = async (personaje: PersonajeVista, aceptado: boolean) => {
    const nota = (notas[personaje.id] ?? "").trim();
    if (!aceptado && nota === "") {
      setError("Escribe por qué se rechaza: quien lo pidió tiene que poder entenderlo.");
      return;
    }
    setOcupado(personaje.id);
    setError(null);
    const respuesta = await revisarConsentimiento(personaje.id, aceptado, nota);
    setOcupado(null);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setLista((actual) => actual.filter((p) => p.id !== personaje.id));
    setHecho(`«${personaje.nombre}»: consentimiento ${aceptado ? "aceptado" : "rechazado"}.`);
  };

  if (lista.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {hecho && <Aviso tono="correcto">{hecho}</Aviso>}
        <EstadoVacio
          titulo="No hay consentimientos pendientes"
          texto="Cuando alguien registre un personaje con la imagen de otra persona, su documento firmado aparecerá aquí para que lo revises."
          icono={<ShieldCheck />}
        />
      </div>
    );
  }

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="flex flex-col gap-6">
      {hecho && <Aviso tono="correcto">{hecho}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <p className="text-sm text-texto-suave">
        {total} {total === 1 ? "consentimiento pendiente" : "consentimientos pendientes"}
        {paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
      </p>
      {lista.map((personaje) => (
        <article
          key={personaje.id}
          className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold text-texto">{personaje.nombre}</h2>
            <p className="text-sm text-texto-suave">
              {ETIQUETA_TIPO_PERSONAJE[personaje.tipo]} · {personaje.totalReferencias}{" "}
              {personaje.totalReferencias === 1 ? "foto" : "fotos"} ·{" "}
              {personaje.consentimiento ? ETIQUETA_ALCANCE[personaje.consentimiento.alcance] : "sin alcance"} · de{" "}
              {personaje.propietario?.nombre ?? "cuenta desconocida"}
            </p>
          </div>

          {personaje.consentimiento?.documento ? (
            <VisorMedio medio={personaje.consentimiento.documento} alturaMaxima="26rem" />
          ) : (
            <Aviso tono="error">
              El documento ya no está disponible (lo han borrado de la biblioteca). Sin documento no se puede aceptar:
              rechaza el consentimiento indicándolo.
            </Aviso>
          )}

          <Campo etiqueta="Nota de la revisión" ayuda="La ve quien pidió el personaje. Obligatoria si lo rechazas.">
            {(props) => (
              <EntradaTexto
                {...props}
                value={notas[personaje.id] ?? ""}
                maxLength={MOTIVO_MAXIMO}
                onChange={(e) => setNotas((actual) => ({ ...actual, [personaje.id]: e.target.value }))}
                placeholder="Documento legible, firmado y con fecha."
              />
            )}
          </Campo>

          <div className="flex flex-wrap gap-3">
            <Boton
              icono={<Check className="size-4" />}
              cargando={ocupado === personaje.id}
              disabled={!personaje.consentimiento?.documento}
              onClick={() => resolver(personaje, true)}
            >
              Aceptar
            </Boton>
            <Boton
              variante="peligro"
              icono={<X className="size-4" />}
              cargando={ocupado === personaje.id}
              onClick={() => resolver(personaje, false)}
            >
              Rechazar y bloquear
            </Boton>
          </div>
        </article>
      ))}
      {paginas > 1 && (
        <nav aria-label="Páginas de la revisión" className="flex flex-wrap gap-2">
          {pagina > 1 && (
            <Link href={`/admin/personajes?pagina=${pagina - 1}`} className={claseBoton("secundario", "sm")}>
              Anterior
            </Link>
          )}
          {pagina < paginas && (
            <Link href={`/admin/personajes?pagina=${pagina + 1}`} className={claseBoton("secundario", "sm")}>
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
