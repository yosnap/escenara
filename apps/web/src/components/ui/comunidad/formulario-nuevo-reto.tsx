"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TITULO_MAXIMO } from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { AreaTexto, Campo, EntradaTexto, SIN_GESTOR_CONTRASENAS } from "../field";
import { Selector } from "../select";
import { crearReto } from "./api-comunidad";

const SIN_PLANTILLA = "sin-plantilla";
const hoy = (dias = 0) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

/** Nuevo reto: título, periodo (de 00:00 del inicio a 23:59 del final) y, si se quiere, una plantilla sugerida. */
export function FormularioNuevoReto({
  plantillas,
  onCreado,
}: {
  plantillas: { id: string; nombre: string }[];
  onCreado: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy(14));
  const [plantilla, setPlantilla] = useState(SIN_PLANTILLA);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setOcupado(true);
    setError(null);
    const r = await crearReto({
      titulo,
      descripcion,
      desde: new Date(`${desde}T00:00:00`).toISOString(),
      hasta: new Date(`${hasta}T23:59:59`).toISOString(),
      plantilla: plantilla === SIN_PLANTILLA ? null : plantilla,
    });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onCreado();
  };

  return (
    <form
      className="grid gap-4 rounded-tarjeta border border-borde bg-superficie p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
    >
      <Campo etiqueta="Título del reto">
        {(p) => (
          <EntradaTexto
            {...p}
            {...SIN_GESTOR_CONTRASENAS}
            value={titulo}
            maxLength={TITULO_MAXIMO}
            onChange={(e) => setTitulo(e.target.value)}
          />
        )}
      </Campo>
      <Selector
        etiqueta="Plantilla sugerida (opcional)"
        valor={plantilla}
        onCambio={(v) => setPlantilla(v ?? SIN_PLANTILLA)}
        opciones={[
          { value: SIN_PLANTILLA, label: "Ninguna" },
          ...plantillas.map((p) => ({ value: p.id, label: p.nombre })),
        ]}
      />
      <Campo etiqueta="Empieza">
        {(p) => <EntradaTexto {...p} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />}
      </Campo>
      <Campo etiqueta="Termina">
        {(p) => <EntradaTexto {...p} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />}
      </Campo>
      <div className="md:col-span-2">
        <Campo etiqueta="Descripción (opcional)">
          {(p) => <AreaTexto {...p} rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
        </Campo>
      </div>
      {error && (
        <div className="md:col-span-2">
          <Alerta tipo="error" titulo="No se ha guardado el reto">
            {error}
          </Alerta>
        </div>
      )}
      <Boton type="submit" icono={<Plus className="size-4" />} cargando={ocupado} className="self-start">
        Crear reto
      </Boton>
    </form>
  );
}
