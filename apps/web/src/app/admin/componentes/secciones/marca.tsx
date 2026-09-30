import { PreviaKit } from "@/components/ui/previa-kit";
import { PreviaMarca } from "@/components/ui/previa-marca";
import { documentoBase } from "@/lib/marca-base";
import { Muestra, Seccion } from "../seccion";

/** Componentes del branding editable: la previsualización de la marca en los dos temas y la del kit del creador. */
export function SeccionMarca() {
  return (
    <Seccion
      id="marca"
      titulo="Marca y kit"
      descripcion="PreviaMarca pinta componentes reales con una marca en claro y en oscuro a la vez (/admin/marca). PreviaKit enseña el logotipo del creador sobre un fotograma, sin tapar nunca la etiqueta de contenido generado con IA (/cuenta/kit)."
    >
      <div className="grid gap-4">
        <Muestra titulo="PreviaMarca · marca de Escenara">
          <div className="w-full">
            <PreviaMarca documento={documentoBase()} />
          </div>
        </Muestra>
        <Muestra titulo="PreviaKit · la esquina elegida cae en la franja de la etiqueta y el logotipo pasa a la contraria">
          <div className="grid w-full gap-4 sm:grid-cols-2">
            <PreviaKit fotograma="/escaparate/lucia.webp" logo="/icon.svg" esquina="abajo-derecha" etiqueta="abajo" />
            <PreviaKit
              fotograma="/escaparate/marco.webp"
              logo="/icon.svg"
              esquina="arriba-izquierda"
              etiqueta="abajo"
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
