import type { Metadata } from "next";
import { Aviso } from "@/components/ui/feedback";
import { SoloEnCliente } from "@/components/ui/solo-en-cliente";
import { leerAjustes } from "@/server/ajustes";
import { proveedoresActivos, urlRedireccion } from "@/server/auth/auth";
import { AVISO_BOVEDA_ADMIN, bovedaDisponible } from "@/server/boveda/cifrado";
import { importarClavesDelEntorno } from "@/server/boveda/importar-entorno";
import { listarSecretos } from "@/server/boveda/secretos";
import { FormularioAjustes } from "./formulario-ajustes";

export const metadata: Metadata = { title: "Ajustes · Admin" };

const NOMBRE_PROVEEDOR = { google: "Google", github: "GitHub" } as const;

/** Ajustes de la instalación (el layout del admin ya exige el rol). */
export default async function PaginaAjustes() {
  const bovedaLista = bovedaDisponible();
  // Primero la importación desde `.env`: puede rellenar los ajustes y los secretos que se leen después.
  const entorno = await importarClavesDelEntorno();
  const [ajustes, secretos, activos] = await Promise.all([leerAjustes(), listarSecretos(), proveedoresActivos()]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Ajustes</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          La configuración de Escenara se cambia aquí, incluidas las claves secretas: se guardan cifradas con la clave
          maestra del servidor. En el archivo <code className="font-mono">.env</code> solo quedan la conexión a la base
          de datos y al almacenamiento, el secreto que firma las sesiones y esa clave maestra.
        </p>
      </div>
      {!bovedaLista && <Aviso tono="error">{AVISO_BOVEDA_ADMIN}</Aviso>}
      <SoloEnCliente
        reserva={
          <p role="status" className="rounded-tarjeta border-2 border-borde bg-superficie p-6 text-texto-suave">
            Cargando los ajustes…
          </p>
        }
      >
        <FormularioAjustes
          inicial={ajustes}
          secretos={secretos}
          proveedores={activos.map((p) => NOMBRE_PROVEEDOR[p])}
          redirecciones={{ google: urlRedireccion("google"), github: urlRedireccion("github") }}
          bovedaLista={bovedaLista}
          variablesSobrantes={entorno.variables}
        />
      </SoloEnCliente>
    </main>
  );
}
