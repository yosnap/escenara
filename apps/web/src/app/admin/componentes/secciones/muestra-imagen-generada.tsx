"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { DialogoImagenGenerada } from "@/components/ui/imagen-generada/dialogo-imagen-generada";

/**
 * Muestra del **diálogo de imagen generada desde una ficha** (lugares y productos). «Ver lo que cuesta» pide la
 * estimación de verdad, que no cobra; «Encargar» apunta a un producto que no existe y responde con su error, así que
 * desde el catálogo no se encarga nada.
 */
export function MuestraImagenGenerada() {
  const [abierto, setAbierto] = useState(false);
  const [apertura, setApertura] = useState(0);
  return (
    <>
      <Boton
        variante="chispa"
        onClick={() => {
          setApertura((n) => n + 1);
          setAbierto(true);
        }}
      >
        <Sparkles className="size-5" aria-hidden /> Generar una imagen
      </Boton>
      <DialogoImagenGenerada
        key={apertura}
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        onEncargado={() => setAbierto(false)}
        pedido={{
          url: "/api/productos/catalogo/generacion",
          medioId: null,
          cuerpo: { papel: "envase" },
          titulo: "Generar una imagen del producto",
          descripcion: "Muestra del catálogo: el coste es real y no se cobra; encargar responde con un error.",
          etiquetaDerechos: "Puedo usar lo que se genere",
          mensajeEncargado: "Encargado.",
        }}
      />
    </>
  );
}
