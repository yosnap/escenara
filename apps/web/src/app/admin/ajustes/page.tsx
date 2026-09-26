import type { Metadata } from "next";
import { leerAjustes } from "@/server/ajustes";
import { proveedoresActivos } from "@/server/auth/auth";
import { FormularioAjustes } from "./formulario-ajustes";

export const metadata: Metadata = { title: "Ajustes · Admin · Escenara" };

/** Ajustes de la instalación (el layout del admin ya exige el rol). */
export default async function PaginaAjustes() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Ajustes</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          La configuración de Escenara se cambia aquí. En el archivo <code className="font-mono">.env</code> solo quedan
          la conexión a la base de datos y al almacenamiento, y el secreto que firma las sesiones.
        </p>
      </div>
      <FormularioAjustes inicial={await leerAjustes()} proveedores={proveedoresActivos()} />
    </main>
  );
}
