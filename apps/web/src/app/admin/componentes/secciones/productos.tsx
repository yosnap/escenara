"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import { CabeceraGrupo } from "@/components/ui/direccion/cabecera-grupo";
import { ElectorAccionProducto } from "@/components/ui/productos/elector-accion-producto";
import { DefinicionesPictogramaProducto } from "@/components/ui/productos/pictogramas-producto";
import type { OpcionDireccion } from "@/lib/direccion";
import { Muestra, Seccion } from "../seccion";

/**
 * **Producto y acción** (0.26.0, cabeceras y lista única en 0.33.2). El bloque completo trae los productos del
 * usuario de la base de datos, y en el catálogo no hay ninguno; por eso aquí se enseña lo que sí es de
 * presentación: la cabecera del bloque y la elección de la acción, con sus datos de ejemplo.
 *
 * La acción es **una sola elección** entre todas las familias. Moda y cuidado de la piel van plegadas en «Más
 * acciones» porque el producto no dice si es ropa o cosmética; el bloque se abre solo si la acción elegida es de
 * ellas. Es el mismo componente que se usa en «Crear» y en la escena de un proyecto.
 */

const ACCIONES: OpcionDireccion[] = [
  {
    clave: "sostenerlo",
    nombre: "Sostenerlo",
    descripcion: "Lo tiene en la mano, a la vista, sin taparlo con los dedos.",
  },
  { clave: "abrirlo", nombre: "Abrirlo", descripcion: "Lo abre delante de la cámara." },
  {
    clave: "ensenarlo-a-camara",
    nombre: "Enseñarlo a cámara",
    descripcion: "Lo gira hacia la cámara con la etiqueta de frente.",
  },
  {
    clave: "moda-giro-360",
    nombre: "Giro de 360 grados",
    descripcion: "La prenda gira sobre sí misma para verla por todos los lados.",
  },
  { clave: "moda-pasarela", nombre: "Pasarela", descripcion: "Camina hacia la cámara con la prenda puesta." },
  { clave: "skincare-extender", nombre: "Extender el producto", descripcion: "Lo extiende sobre la piel." },
  { clave: "skincare-masajear", nombre: "Masajear", descripcion: "Masajea la zona con suavidad." },
];

export function SeccionProductos() {
  const [accion, setAccion] = useState("");
  const [otra, setOtra] = useState("moda-giro-360");
  return (
    <Seccion
      id="productos"
      titulo="Producto y acción"
      descripcion="La cabecera del bloque del producto y la elección de qué se hace con él: una sola lista con partes, un resumen «Elegida» y las familias de nicho plegadas."
    >
      <DefinicionesPictogramaProducto />
      <div className="flex flex-col gap-8">
        <Muestra titulo="Cabecera del bloque">
          <CabeceraGrupo
            como="h3"
            icono={Package}
            titulo="El producto"
            descripcion="El producto que sale en el clip y qué hace el personaje con él."
            tono="producto"
          />
        </Muestra>
        <Muestra titulo="Acción con el producto: «Más acciones» cerrado por defecto">
          <ElectorAccionProducto acciones={ACCIONES} accion={accion} onCambio={setAccion} />
        </Muestra>
        <Muestra titulo="Con una acción de moda ya elegida: «Más acciones» se abre solo">
          <ElectorAccionProducto acciones={ACCIONES} accion={otra} onCambio={setOtra} />
        </Muestra>
      </div>
    </Seccion>
  );
}
