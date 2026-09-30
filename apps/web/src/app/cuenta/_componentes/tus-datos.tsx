"use client";

import { Database, History, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { DialogoBorrarCuenta } from "@/components/ui/datos/dialogo-borrar-cuenta";
import { Bloque } from "./bloque";

/**
 * «Tus datos» en la cuenta: el historial de todo lo hecho y gastado, y borrar la cuenta. Tras volver a entrar para
 * borrarla (`?borrar=1`), el diálogo se abre solo.
 */
export function TusDatos({ abrirBorrado = false }: { abrirBorrado?: boolean }) {
  const [borrar, setBorrar] = useState(abrirBorrado);
  return (
    <Bloque
      titulo="Tus datos"
      descripcion="Tu historial, llevarte tus proyectos y borrar tu cuenta."
      icono={<Database />}
    >
      <p className="text-sm text-texto-suave">
        Cada proyecto se exporta en ZIP desde su pantalla, sin claves ni credenciales. Borrar la cuenta lo borra todo,
        tras un periodo de gracia en el que puedes arrepentirte.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/cuenta/historial" className={claseBoton("secundario")}>
          <History className="size-4" aria-hidden /> Ver tu historial y tu gasto
        </Link>
        <Boton variante="peligro" icono={<UserX className="size-4" />} onClick={() => setBorrar(true)}>
          Borrar mi cuenta
        </Boton>
      </div>
      <DialogoBorrarCuenta
        abierto={borrar}
        onAbiertoCambio={setBorrar}
        onProgramado={() => window.location.assign("/cuenta/borrado")}
      />
    </Bloque>
  );
}
