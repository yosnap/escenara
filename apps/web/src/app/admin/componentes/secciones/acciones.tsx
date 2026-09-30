import { Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Muestra, Seccion } from "../seccion";

export function SeccionAcciones() {
  return (
    <Seccion
      id="acciones"
      titulo="Botones"
      descripcion="«Chispa» es la llamada principal a crear. Los colores vivos reparten las acciones de una fila para que no pese: cobalto edita, cian duplica, fucsia consulta y mandarina retira. Mínimo 44 × 44 px y foco visible."
    >
      <div className="grid gap-4">
        <Muestra titulo="Variantes">
          <Boton variante="chispa" icono={<Sparkles className="size-5" />}>
            Crear personaje
          </Boton>
          <Boton icono={<Wand2 className="size-5" />}>Preparar escena</Boton>
          <Boton variante="secundario">Revisar</Boton>
          <Boton variante="fantasma">Cancelar</Boton>
          <Boton variante="peligro" icono={<Trash2 className="size-5" />}>
            Borrar personaje
          </Boton>
        </Muestra>
        <Muestra titulo="Colores para acciones frecuentes">
          <Boton variante="cobalto" tamano="sm">
            Editar
          </Boton>
          <Boton variante="cian" tamano="sm">
            Duplicar
          </Boton>
          <Boton variante="fucsia" tamano="sm">
            Ver versiones
          </Boton>
          <Boton variante="mandarina" tamano="sm">
            Caducar
          </Boton>
        </Muestra>
        <Muestra titulo="Tamaños y estados">
          <Boton tamano="sm">Pequeño</Boton>
          <Boton>Mediano</Boton>
          <Boton tamano="lg" variante="chispa">
            Grande
          </Boton>
          <Boton cargando>Generando</Boton>
          <Boton disabled>Deshabilitado</Boton>
        </Muestra>
        <Muestra titulo="Solo icono">
          <BotonIcono etiqueta="Añadir escena">
            <Plus className="size-5" />
          </BotonIcono>
          <BotonIcono etiqueta="Borrar escena">
            <Trash2 className="size-5" />
          </BotonIcono>
        </Muestra>
      </div>
    </Seccion>
  );
}
