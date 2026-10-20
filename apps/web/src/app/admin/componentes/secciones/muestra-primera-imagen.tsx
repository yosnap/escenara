"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import { PasoPrimeraImagen, VacioPrimeraImagen } from "@/components/ui/imagen-generada/primera-imagen";

const TEXTOS = {
  generar: "Una foto realista del lugar, vacía, creada desde su descripción. Verás el coste antes de confirmar.",
  subir: "Elige fotos del sitio de tu biblioteca o sube archivos nuevos. La primera que añadas será la maestra.",
};

/**
 * Muestra de **la primera imagen de una ficha**: el paso que sigue al alta de un lugar o un producto (aquí con la
 * descripción corta, para ver cómo se completa) y el estado vacío de sus fotos. Las opciones solo dicen qué harían:
 * desde el catálogo no se genera ni se sube nada.
 */
export function MuestraPrimeraImagen() {
  const [hecho, setHecho] = useState("");
  return (
    <div className="flex w-full flex-col gap-4">
      {hecho !== "" && <Aviso tono="info">{hecho}</Aviso>}
      <PasoPrimeraImagen
        nombre="Patio de la abuela"
        textos={TEXTOS}
        descripcion="Patio"
        minimo={12}
        maximo={400}
        pista="Cuenta qué hay, los colores, los materiales y la luz."
        ocupado={false}
        onGuardarDescripcion={async () => true}
        onGenerar={() => setHecho("Abriría el diálogo del coste con la descripción guardada.")}
        onSubir={() => setHecho("Abriría la biblioteca para elegir o subir fotos.")}
        onDespues={() => setHecho("Dejaría en la ficha.")}
      />
      <VacioPrimeraImagen
        texto="Sin maestra, este lugar solo puede ir descrito con palabras."
        textos={TEXTOS}
        motivoSinGenerar="Para generar, describe el lugar (qué hay, colores, luz) y guarda los cambios."
        generandose={false}
        ocupado={false}
        onGenerar={() => setHecho("Abriría el diálogo del coste.")}
        onSubir={() => setHecho("Abriría la biblioteca para elegir o subir fotos.")}
      />
    </div>
  );
}
