"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla, GrupoOpciones } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { declararLugar, revocarDeclaracionDeLugar } from "@/components/ui/lugares/api-lugares";
import { Selector } from "@/components/ui/select";
import {
  AVISO_INTERIOR,
  ESPACIOS_LUGAR,
  type LugarVista,
  NOMBRE_ESPACIO,
  NOMBRE_ORIGEN_FOTOS,
  NOMBRE_PERSONAS_VISIBLES,
  ORIGENES_FOTOS_LUGAR,
  RECHAZO_MENORES,
  RECHAZO_RECONOCIBLES,
  RESPONSABILIDAD_DECLARACION,
  RESPUESTAS_PERSONAS,
} from "@/lib/lugares";

/**
 * **Declaración de derechos del lugar.** Sin ella no se genera con el lugar. Es del usuario: la aplicación no
 * juzga si algo es legal, pero no acepta lo que esta versión no admite y lo dice **antes** de enviar, con la causa
 * y qué hacer: gente reconocible (se retira o se cambia la foto; no se pixela, porque el generador copia el
 * pixelado), menores (nunca) y un interior sin permiso de quien lo gestiona.
 */
export function DeclaracionLugar({ lugar, onCambio }: { lugar: LugarVista; onCambio: (lugar: LugarVista) => void }) {
  const vigente = lugar.declaracion;
  const [origenFotos, setOrigenFotos] = useState<string>(vigente?.origenFotos ?? "propias");
  const [alcance, setAlcance] = useState<string>(vigente?.alcance ?? "personal");
  const [espacio, setEspacio] = useState<string>(vigente?.espacio ?? "exterior");
  const [permiso, setPermiso] = useState(vigente?.permisoDelLugar ?? false);
  const [personas, setPersonas] = useState<string>(vigente?.personasVisibles ?? "ninguna");
  const [marcas, setMarcas] = useState(vigente?.marcasVisibles ?? false);
  const [sinMenores, setSinMenores] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const reconocibles = personas === "reconocibles";
  const faltaPermiso = espacio === "interior" && !permiso;
  const puedeDeclarar = lugar.fotos > 0 && sinMenores && !reconocibles && !faltaPermiso;

  const enviar = async (promesa: ReturnType<typeof declararLugar>) => {
    setOcupado(true);
    setError("");
    const resultado = await promesa;
    setOcupado(false);
    if (resultado.ok) onCambio(resultado.datos);
    else setError(resultado.error);
  };

  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-texto">
        <ShieldCheck className="size-6 text-acento" aria-hidden /> Declaración de derechos
      </h2>
      <Aviso tono="info">{RESPONSABILIDAD_DECLARACION}</Aviso>
      {vigente ? (
        <Aviso tono="correcto">
          Declarada el {new Date(vigente.declaradaEn).toLocaleDateString("es-ES")}. Si cambias las fotos o la maestra se
          retira sola y tendrás que volver a declararla.
        </Aviso>
      ) : (
        <Aviso tono="aviso">Sin declaración vigente no se genera con este lugar.</Aviso>
      )}

      <Selector
        etiqueta="¿De dónde son las fotos?"
        valor={origenFotos}
        deshabilitado={ocupado}
        opciones={ORIGENES_FOTOS_LUGAR.map((o) => ({ value: o, label: NOMBRE_ORIGEN_FOTOS[o] }))}
        onCambio={(v) => v && setOrigenFotos(v)}
      />
      <GrupoOpciones
        etiqueta="¿Qué tipo de sitio es?"
        valor={espacio}
        onCambio={setEspacio}
        opciones={ESPACIOS_LUGAR.map((e) => ({ value: e, etiqueta: NOMBRE_ESPACIO[e] }))}
      />
      {espacio === "interior" && (
        <Casilla
          etiqueta="Tengo permiso de quien gestiona este sitio para grabar y usar estas imágenes"
          descripcion={AVISO_INTERIOR}
          marcada={permiso}
          deshabilitado={ocupado}
          onCambio={setPermiso}
        />
      )}
      <GrupoOpciones
        etiqueta="¿Sale gente en las fotos?"
        valor={personas}
        onCambio={setPersonas}
        opciones={RESPUESTAS_PERSONAS.map((p) => ({ value: p, etiqueta: NOMBRE_PERSONAS_VISIBLES[p] }))}
      />
      {reconocibles && <Aviso tono="error">{RECHAZO_RECONOCIBLES}</Aviso>}
      <Selector
        etiqueta="Uso"
        valor={alcance}
        deshabilitado={ocupado}
        opciones={[
          { value: "personal", label: "Personal", descripcion: "Para tus redes, sin anunciar nada." },
          { value: "comercial", label: "Comercial", descripcion: "En un anuncio o para una marca." },
        ]}
        onCambio={(v) => v && setAlcance(v)}
      />
      <Casilla
        etiqueta="Se ve alguna marca o rótulo"
        descripcion="Solo para avisarte: el filtro del proveedor puede rechazar una marca ajena, y entonces no se cobra nada."
        marcada={marcas}
        deshabilitado={ocupado}
        onCambio={setMarcas}
      />
      <Casilla
        etiqueta="En estas fotos no sale ningún menor, ni al fondo"
        descripcion={RECHAZO_MENORES}
        marcada={sinMenores}
        deshabilitado={ocupado}
        onCambio={setSinMenores}
      />
      {lugar.fotos === 0 && <Aviso tono="info">Añade al menos una foto antes de declarar.</Aviso>}
      {error !== "" && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-wrap justify-end gap-3">
        {vigente && (
          <Boton
            variante="secundario"
            disabled={ocupado}
            onClick={() => enviar(revocarDeclaracionDeLugar(lugar.id, "Revocada desde la ficha del lugar."))}
          >
            Revocar
          </Boton>
        )}
        <Boton
          variante="chispa"
          disabled={ocupado || !puedeDeclarar}
          onClick={() =>
            enviar(
              declararLugar(lugar.id, {
                origenFotos,
                alcance,
                espacio,
                permisoDelLugar: permiso,
                personasVisibles: personas,
                marcasVisibles: marcas,
                sinMenores,
              }),
            )
          }
        >
          {vigente ? "Volver a declarar" : "Declarar"}
        </Boton>
      </div>
    </section>
  );
}
