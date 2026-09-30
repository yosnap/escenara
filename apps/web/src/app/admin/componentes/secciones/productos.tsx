"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import { CabeceraGrupo } from "@/components/ui/direccion/cabecera-grupo";
import { SelectorModelo } from "@/components/ui/modelo";
import { AvisoFotoDeProducto } from "@/components/ui/productos/aviso-foto-de-producto";
import { ElectorAccionProducto } from "@/components/ui/productos/elector-accion-producto";
import { ElectorFotosProducto } from "@/components/ui/productos/elector-fotos-producto";
import { DefinicionesPictogramaProducto } from "@/components/ui/productos/pictogramas-producto";
import type { ModeloElegible } from "@/lib/catalogo";
import type { OpcionDireccion } from "@/lib/direccion";
import { alternarFoto, fotosQueViajan } from "@/lib/fotos-del-producto";
import type { Medio } from "@/lib/media/tipos";
import type { PapelReferencia, ReferenciaProducto } from "@/lib/productos";
import { Muestra, Seccion } from "../seccion";

/**
 * **Producto y acción** (0.26.0, cabeceras y lista única en 0.33.2). El bloque completo trae los productos del
 * usuario de la base de datos, y en el catálogo no hay ninguno; por eso aquí se enseña lo que sí es de
 * presentación: la cabecera del bloque y la elección de la acción, con sus datos de ejemplo.
 *
 * La acción es **una sola elección** entre todas las familias. Moda y cuidado de la piel van plegadas en «Más
 * acciones» porque el producto no dice si es ropa o cosmética; el bloque se abre solo si la acción elegida es de
 * ellas y no se cierra mientras siga elegida. Es el mismo componente que se usa en «Crear» y en la escena de un proyecto.
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

/** Modelos de clip de ejemplo: uno lleva la foto del producto como referencia y el otro no. */
const CLIP_SIN_FOTO: ModeloElegible = {
  modelo: "ejemplo-veo",
  nombre: "Veo 3.1 Lite",
  conVoz: true,
  unidad: "vídeo de 4 s",
  estado: "validado",
  creditos: 60,
  precioPublicado: false,
  duracionesConCoste: [{ segundos: 4, creditos: 60, unidad: "vídeo de 4 s", publicado: false }],
  duraciones: [4],
  maximoReferencias: 2,
  admiteFotoDeProducto: false,
};
const CLIP_CON_FOTO: ModeloElegible = {
  ...CLIP_SIN_FOTO,
  modelo: "ejemplo-minimax",
  nombre: "MiniMax H3",
  conVoz: false,
  admiteFotoDeProducto: true,
};

/** Miniatura de ejemplo: un cuadrado de color, para no depender de ninguna foto real en el catálogo. */
const miniatura = (id: string, color: string): Medio => ({
  id,
  tipo: "imagen",
  nombre: `${id}.svg`,
  mime: "image/svg+xml",
  tamano: 1,
  ancho: 96,
  alto: 96,
  duracion: null,
  titulo: "",
  altEs: "",
  altEn: "",
  url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/></svg>`)}`,
  creadoEn: "2026-09-30T00:00:00.000Z",
  actualizadoEn: "2026-09-30T00:00:00.000Z",
  enPapelera: false,
  origen: null,
  documento: false,
  permisos: { editarImagen: false, borrarDefinitivo: false },
});

const referencia = (id: string, papel: PapelReferencia, orden: number, color: string): ReferenciaProducto => ({
  id: `ref-${id}`,
  papel,
  orden,
  medio: miniatura(id, color),
});

/** La caja de ejemplo tiene cinco fotos y en el clip solo caben tres. */
const FOTOS_DE_LA_CAJA = [
  referencia("frontal", "etiqueta", 1, "#2f9e6e"),
  referencia("envase", "envase", 2, "#e0a030"),
  referencia("tapa", "mecanismo", 3, "#3d6bff"),
  referencia("suelta-1", "suelto", 4, "#c2417a"),
  referencia("suelta-2", "suelto", 5, "#7a5cff"),
];
const CABEN_DE_LA_CAJA = 3;

export function SeccionProductos() {
  const [marcadas, setMarcadas] = useState(() =>
    fotosQueViajan(
      FOTOS_DE_LA_CAJA.map((f) => ({ medioId: f.medio.id, papel: f.papel, orden: f.orden })),
      "",
      CABEN_DE_LA_CAJA,
    ),
  );
  const [accion, setAccion] = useState("");
  const [modelo, setModelo] = useState(CLIP_SIN_FOTO.modelo);
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
        <Muestra titulo="Aviso junto al selector: el modelo del clip no admite la foto del producto">
          <AvisoFotoDeProducto
            foto={{ modelo: CLIP_SIN_FOTO.nombre, admite: false, alternativas: [CLIP_CON_FOTO.nombre] }}
            referencias={2}
          />
        </Muestra>
        <Muestra titulo="El mismo aviso cuando ningún modelo activo la admite">
          <AvisoFotoDeProducto
            foto={{ modelo: CLIP_SIN_FOTO.nombre, admite: false, alternativas: [] }}
            referencias={2}
          />
        </Muestra>
        <Muestra titulo="Selector de modelo con un producto elegido: cada modelo dice si lleva la foto">
          <SelectorModelo
            etiqueta="Modelo del clip"
            modelos={[CLIP_SIN_FOTO, CLIP_CON_FOTO]}
            valor={modelo}
            onCambio={setModelo}
            conProducto
          />
        </Muestra>
        <Muestra titulo="Elegir qué fotos del producto viajan: sobran fotos y solo caben tres (la frontal va marcada)">
          <ElectorFotosProducto
            nombre="Caja Huerta Valenciana"
            fotos={FOTOS_DE_LA_CAJA}
            caben={CABEN_DE_LA_CAJA}
            marcadas={marcadas}
            onAlternar={(id) =>
              setMarcadas((actuales) =>
                alternarFoto(
                  FOTOS_DE_LA_CAJA.map((f) => ({ medioId: f.medio.id, papel: f.papel, orden: f.orden })),
                  "",
                  CABEN_DE_LA_CAJA,
                  actuales,
                  id,
                ),
              )
            }
          />
        </Muestra>
        <Muestra titulo="Con una acción de moda ya elegida: «Más acciones» se abre solo">
          <ElectorAccionProducto acciones={ACCIONES} accion={otra} onCambio={setOtra} />
        </Muestra>
      </div>
    </Seccion>
  );
}
