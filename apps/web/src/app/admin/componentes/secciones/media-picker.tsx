import { ImagePlus } from "lucide-react";
import { EstadoVacio } from "@/components/ui/feedback";
import { Seccion } from "../seccion";

export function SeccionMediaPicker() {
  return (
    <Seccion
      id="media-picker"
      titulo="Selector de medios"
      descripcion="Componente reutilizable para elegir fotos, vídeos y audios. Su comportamiento lo definirá el propietario del producto."
    >
      <EstadoVacio
        icono={<ImagePlus />}
        titulo="Pendiente de especificación"
        texto="Este hueco se reserva para el media picker. Se implementará cuando esté definida su especificación."
      />
    </Seccion>
  );
}
