"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { authCliente } from "@/lib/auth-cliente";

export function CerrarSesion() {
  const [saliendo, setSaliendo] = useState(false);
  return (
    <Boton
      variante="fantasma"
      tamano="sm"
      icono={<LogOut className="size-4" />}
      cargando={saliendo}
      onClick={async () => {
        setSaliendo(true);
        await authCliente.signOut();
        window.location.assign("/entrar?aviso=cerrada");
      }}
    >
      Cerrar sesión
    </Boton>
  );
}
