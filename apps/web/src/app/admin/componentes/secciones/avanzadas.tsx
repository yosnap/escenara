"use client";

import { useState } from "react";
import { PanelCoste } from "@/components/ui/coste";
import { SelectorModelo } from "@/components/ui/modelo";
import { GeneradoCon, OpcionesAvanzadas } from "@/components/ui/opciones-avanzadas";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Estimacion } from "@/lib/generacion";
import { Muestra, Seccion } from "../seccion";

/** Modelos de ejemplo, escritos a mano para ver el componente sin tocar la base de datos. */
const MODELOS: ModeloElegible[] = [
  {
    modelo: "veo3_lite",
    nombre: "Veo 3.1 Lite",
    conVoz: true,
    unidad: "vídeo de 4 s",
    estado: "validado",
    creditos: 60,
    precioPublicado: false,
    duracionesConCoste: [{ segundos: 4, creditos: 60, unidad: "vídeo de 4 s", publicado: false }],
    duraciones: [4, 8],
    maximoReferencias: 2,
  },
  {
    modelo: "hailuo/2-3-image-to-video-standard",
    nombre: "Hailuo 2.3 Standard",
    conVoz: false,
    unidad: "vídeo de 6 s",
    estado: "compatible",
    creditos: 30,
    precioPublicado: false,
    duracionesConCoste: [{ segundos: 6, creditos: 30, unidad: "vídeo de 6 s", publicado: false }],
    duraciones: [6],
    maximoReferencias: 1,
  },
];

const ESTIMACION: Estimacion = {
  tipo: "animacion",
  modelo: "veo3_lite",
  nombreModelo: "Veo 3.1 Lite",
  conVoz: true,
  unidad: "vídeo de 4 s",
  creditos: 60,
  euros: 0.3,
  saldo: 148,
  alcanza: true,
  superaUmbral: false,
  umbral: 200,
  fuente: "Medido en el prototipo 0.3.0",
  comprobado: "2026-09-27",
  precioAntiguo: false,
  traduccion: null,
  segundos: 4,
  duraciones: [{ segundos: 4, creditos: 60, unidad: "vídeo de 4 s", publicado: false }],
  sinReferencia: false,
  sello: "kie:veo3_lite:vídeo de 4 s@v1",
};

/**
 * **Opciones avanzadas**: el plegable de cada vídeo donde viven los nombres de modelo, su selector, su precio por
 * modelo y «Generado con…». Fuera de él, el usuario normal solo ve duración y créditos.
 */
export function SeccionAvanzadas() {
  const [elegido, setElegido] = useState(MODELOS[0]?.modelo ?? "");
  return (
    <Seccion
      id="avanzadas"
      titulo="Opciones avanzadas"
      descripcion="Plegadas por defecto y recordadas abiertas o cerradas por vídeo durante la sesión (no en la base de datos). Son el único sitio de las pantallas de usuario donde se nombra un modelo; el proveedor sí se nombra fuera, porque es la clave que paga. Botón con aria-expanded, foco visible y borde completo: nunca una franja lateral."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Opciones avanzadas de un clip">
          <div className="flex w-full flex-col gap-4">
            <OpcionesAvanzadas clave="catalogo:clip" resumen="Modelo del clip y su precio">
              <SelectorModelo etiqueta="Modelo del clip" modelos={MODELOS} valor={elegido} onCambio={setElegido} />
            </OpcionesAvanzadas>
          </div>
        </Muestra>
        <Muestra titulo="Con un requisito pendiente dentro">
          <div className="flex w-full flex-col gap-4">
            <OpcionesAvanzadas clave="catalogo:pendiente" resumen="Modelo de la imagen" forzarAbierto>
              <p className="text-sm text-texto">
                Se abre solo y no se deja cerrar mientras falte elegir algo aquí dentro, para que «llevar al problema»
                encuentre el control.
              </p>
            </OpcionesAvanzadas>
          </div>
        </Muestra>
        <Muestra titulo="Compactas, para listas: «Generado con…»">
          <div className="flex w-full flex-col gap-2">
            <p className="text-sm text-texto">Clip listo · 60 créditos según el proveedor</p>
            <GeneradoCon clave="catalogo:trabajo" modelo="veo3_lite" />
          </div>
        </Muestra>
        <Muestra titulo="Coste fuera y dentro de las avanzadas">
          <div className="flex w-full flex-col gap-4">
            <PanelCoste estimacion={ESTIMACION} />
            <OpcionesAvanzadas clave="catalogo:coste" resumen="Precio por modelo">
              <PanelCoste estimacion={ESTIMACION} mostrarModelo />
            </OpcionesAvanzadas>
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
