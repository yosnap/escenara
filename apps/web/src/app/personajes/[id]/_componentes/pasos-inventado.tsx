"use client";

import type { Etapa } from "@/components/ui/feedback";
import { ProgresoEtapas } from "@/components/ui/feedback";
import { vistasPorGenerar } from "@/lib/captura-personaje";
import { CAMPOS_FICHA } from "@/lib/ficha-personaje";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Guía del alta de un personaje **inventado** (0.22.1). Acabar de crearlo deja al usuario con una ficha vacía
 * y cuatro sitios donde tocar; esto dice en qué orden y cuál toca ahora:
 *
 * 1. generar sus retratos (o añadir imágenes hechas con IA);
 * 2. elegir cuál es su cara;
 * 3. completar la ficha con IA;
 * 4. generar las vistas que le falten.
 *
 * El estado **se deduce** de lo que el servidor devuelve del personaje: no hay ninguna columna de progreso que
 * pueda quedarse desfasada, y un paso que se hizo a mano cuenta igual que uno hecho desde aquí.
 */
export function PasosInventado({ personaje, retratos }: { personaje: PersonajeVista; retratos: number }) {
  const tieneCara = personaje.totalReferencias + personaje.totalGeneradas > 0;
  const fichaEscrita = CAMPOS_FICHA.some((campo) => personaje.ficha[campo].trim() !== "");
  const faltanVistas = personaje.cobertura ? vistasPorGenerar(personaje.cobertura).length : 0;

  // El primero en curso es el que toca; los de después quedan pendientes aunque ya se pudieran hacer.
  const hechas = [tieneCara || retratos > 0, tieneCara, fichaEscrita, tieneCara && faltanVistas === 0];
  const enCurso = hechas.indexOf(false);
  const estadoDe = (indice: number): Etapa["estado"] =>
    hechas[indice] ? "hecha" : indice === enCurso ? "en-curso" : "pendiente";

  const etapas: Etapa[] = [
    { nombre: "Generar sus retratos o añadir imágenes hechas con IA", estado: estadoDe(0) },
    { nombre: "Elegir cuál es su cara", estado: estadoDe(1) },
    { nombre: "Completar la ficha con IA", estado: estadoDe(2) },
    {
      nombre:
        faltanVistas > 0 ? `Generar las ${faltanVistas} vistas que le faltan` : "Generar las vistas que le falten",
      estado: estadoDe(3),
    },
  ];

  return (
    <section
      aria-label="Pasos para terminar este personaje"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-5"
    >
      <div>
        <h2 className="text-xl font-bold text-texto">Para terminar a «{personaje.nombre}»</h2>
        <p className="mt-1 text-texto-suave">
          Es un personaje inventado: con el nombre y la descripción basta, y el resto sale de aquí en este orden.
        </p>
      </div>
      <ProgresoEtapas etapas={etapas} etiqueta="Pasos para terminar este personaje" />
    </section>
  );
}
