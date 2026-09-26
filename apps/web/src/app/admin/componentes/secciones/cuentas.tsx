"use client";

import { KeyRound } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { BotonProveedor, SeparadorO, TarjetaCuenta } from "@/components/ui/cuenta";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Muestra, Seccion } from "../seccion";

export function SeccionCuentas() {
  return (
    <Seccion
      id="cuentas"
      titulo="Cuentas"
      descripcion="Pantallas de acceso (zona de claridad): tarjeta de cuenta, contraseña con mostrar u ocultar, proveedores externos y separador."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Tarjeta de cuenta">
          <TarjetaCuenta
            titulo="Entrar"
            descripcion="Te damos la bienvenida de nuevo a tu estudio."
            pie={<span>¿No tienes cuenta? Crea una</span>}
          >
            <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
              <Campo etiqueta="Correo">
                {(p) => <EntradaTexto {...p} type="email" autoComplete="email" placeholder="tu@correo.com" />}
              </Campo>
              <Campo etiqueta="Contraseña">{(p) => <EntradaContrasena {...p} autoComplete="current-password" />}</Campo>
              <Boton type="submit">Entrar</Boton>
              <SeparadorO />
              <Boton variante="secundario" icono={<KeyRound className="size-4" />}>
                Entrar con passkey
              </Boton>
            </form>
          </TarjetaCuenta>
        </Muestra>
        <Muestra titulo="Proveedores externos">
          <div className="flex w-full max-w-sm flex-col gap-3">
            <BotonProveedor proveedor="google" />
            <BotonProveedor proveedor="github" />
            <SeparadorO texto="o con tu correo" />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
