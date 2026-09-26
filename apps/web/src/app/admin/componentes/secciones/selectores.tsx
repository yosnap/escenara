"use client";

import { Dumbbell, Heart, Palmtree, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Buscador } from "@/components/ui/combobox";
import { SelectorMultiple } from "@/components/ui/multi-select";
import type { Opcion } from "@/components/ui/options";
import { Selector } from "@/components/ui/select";
import { Muestra, Seccion } from "../seccion";

const ESPECIALIDADES: Opcion[] = [
  { value: "turismo", label: "Turismo y viajes", icono: <Palmtree className="size-4 text-v-cian" /> },
  { value: "producto", label: "Producto y comercio", icono: <ShoppingBag className="size-4 text-v-coral" /> },
  { value: "gastronomia", label: "Gastronomía", icono: <UtensilsCrossed className="size-4 text-v-mandarina" /> },
  { value: "belleza", label: "Belleza y autocuidado", icono: <Heart className="size-4 text-v-fucsia" /> },
  { value: "deporte", label: "Deporte y bienestar", icono: <Dumbbell className="size-4 text-v-cobalto" /> },
];

const FORMATOS: Opcion[] = [
  { value: "anuncio", label: "Anuncio", descripcion: "Producto o servicio con llamada a la acción" },
  { value: "tutorial", label: "Tutorial", descripcion: "Paso a paso" },
  { value: "resena", label: "Reseña", descripcion: "Opinión en primera persona" },
  { value: "itinerario", label: "Itinerario", descripcion: "Recorrido por lugares" },
  { value: "explicativo", label: "Vídeo explicativo", deshabilitada: true },
];

const IDIOMAS: Opcion[] = [
  "Español (España)",
  "Español (México)",
  "Inglés (Reino Unido)",
  "Inglés (Estados Unidos)",
  "Francés",
  "Alemán",
  "Italiano",
  "Portugués (Portugal)",
  "Portugués (Brasil)",
  "Catalán",
  "Euskera",
  "Gallego",
].map((l) => ({ value: l.toLowerCase(), label: l }));

export function SeccionSelectores() {
  const [formato, setFormato] = useState<string | null>("anuncio");
  const [plataformas, setPlataformas] = useState<Opcion[]>([ESPECIALIDADES[0] as Opcion]);
  return (
    <Seccion
      id="selectores"
      titulo="Selectores"
      descripcion="Sustituyen siempre al selector nativo del navegador: selección única, múltiple en caja con chips y única con búsqueda. Teclado, lectores de pantalla y móvil incluidos."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Muestra titulo="Selección única">
          <div className="flex w-full flex-col gap-4">
            <Selector etiqueta="Formato" opciones={FORMATOS} valor={formato} onCambio={setFormato} />
            <p className="text-sm text-texto-suave">
              Valor: <code className="font-mono">{formato ?? "ninguno"}</code>
            </p>
            <Selector etiqueta="Especialidad" opciones={ESPECIALIDADES} marcador="Elige especialidad" />
            <Selector etiqueta="Deshabilitado" opciones={FORMATOS} valorInicial="tutorial" deshabilitado />
          </div>
        </Muestra>
        <Muestra titulo="Selección múltiple (caja)">
          <div className="flex w-full flex-col gap-4">
            <SelectorMultiple
              etiqueta="Especialidades"
              opciones={ESPECIALIDADES}
              valor={plataformas}
              onCambio={setPlataformas}
            />
            <p className="text-sm text-texto-suave">
              Elegidas: <code className="font-mono">{plataformas.map((p) => p.value).join(", ") || "ninguna"}</code>
            </p>
          </div>
        </Muestra>
        <Muestra titulo="Única con búsqueda">
          <div className="flex w-full flex-col gap-4">
            <Buscador etiqueta="Idioma y acento" opciones={IDIOMAS} valorInicial={IDIOMAS[0] as Opcion} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
