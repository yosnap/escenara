import { Casilla, GrupoOpciones, Interruptor } from "@/components/ui/choice";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Muestra, Seccion } from "../seccion";

export function SeccionFormularios() {
  return (
    <Seccion
      id="formularios"
      titulo="Campos y opciones"
      descripcion="Etiqueta, ayuda y error siempre asociados al control."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Texto">
          <div className="flex w-full flex-col gap-4">
            <Campo etiqueta="Nombre del personaje" ayuda="Así lo verás en tu biblioteca.">
              {(p) => <EntradaTexto {...p} placeholder="Lucía viajera" />}
            </Campo>
            <Campo etiqueta="Llamada a la acción" error="Escribe una llamada a la acción de 60 caracteres como máximo.">
              {(p) => (
                <EntradaTexto
                  {...p}
                  defaultValue="¡Reserva ya tu escapada con un 20 % de descuento este fin de semana!"
                />
              )}
            </Campo>
            <Campo etiqueta="Guion">{(p) => <AreaTexto {...p} placeholder="Hola, soy Lucía y hoy te enseño…" />}</Campo>
          </div>
        </Muestra>
        <Muestra titulo="Casillas, interruptores y opciones">
          <div className="flex w-full flex-col gap-2">
            <Casilla etiqueta="Tengo derechos sobre estas fotos" descripcion="Obligatorio para crear el personaje." />
            <Casilla etiqueta="Etiquetar como contenido sintético" marcadaInicial />
            <Casilla etiqueta="Opción no disponible" deshabilitado />
            <Interruptor etiqueta="Subtítulos automáticos" descripcion="Se generan a partir de la voz." activoInicial />
            <Interruptor etiqueta="Música de fondo" />
            <GrupoOpciones
              etiqueta="Duración"
              valorInicial="reel"
              opciones={[
                { value: "breve", etiqueta: "Escena breve", descripcion: "Hasta 8 s" },
                { value: "reel", etiqueta: "Reel", descripcion: "De 15 a 60 s" },
                { value: "multi", etiqueta: "Composición multiescena", descripcion: "Duración editable" },
              ]}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
