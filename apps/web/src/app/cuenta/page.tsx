import { Stamp } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { TIPOS_EN_USO } from "@/lib/mapa-modelos";
import { auth } from "@/server/auth/auth";
import { exigirSesion } from "@/server/auth/sesion";
import { bovedaDisponible } from "@/server/boveda/cifrado";
import { listarCompatibles } from "@/server/boveda/compatibles";
import { listarCredenciales } from "@/server/boveda/credenciales";
import { mapaVista, opcionesDe } from "@/server/mapa/mapa";
import { CabeceraApp } from "../_app/cabecera-app";
import { Bloque } from "./_componentes/bloque";
import { CambiarContrasena } from "./_componentes/cambiar-contrasena";
import { Compatibles } from "./_componentes/compatibles";
import { Credenciales } from "./_componentes/credenciales";
import { MapaDeModelos } from "./_componentes/mapa-de-modelos";
import { Passkeys } from "./_componentes/passkeys";
import { Perfil } from "./_componentes/perfil";
import { Preferencias } from "./_componentes/preferencias";
import { Sesiones } from "./_componentes/sesiones";

export const metadata: Metadata = { title: "Tu cuenta" };
export const dynamic = "force-dynamic";

export default async function PaginaCuenta() {
  const sesion = await exigirSesion("/cuenta");
  const cabeceras = await headers();
  const [passkeys, sesiones, cuentas, credenciales, compatibles] = await Promise.all([
    (await auth()).api.listPasskeys({ headers: cabeceras }),
    (await auth()).api.listSessions({ headers: cabeceras }),
    (await auth()).api.listUserAccounts({ headers: cabeceras }),
    listarCredenciales(sesion.user.id),
    listarCompatibles(sesion.user.id),
  ]);
  const tieneContrasena = cuentas.some((c) => c.providerId === "credential");
  // El mapa se lee después de las credenciales porque depende de ellas: una entrada sin clave válida no se puede
  // usar, y la pantalla lo tiene que decir en lugar de esconderla.
  const mapas = await Promise.all(
    TIPOS_EN_USO.map(async (tipo) => ({
      mapa: await mapaVista(sesion.user.id, tipo),
      opciones: await opcionesDe(sesion.user.id, tipo),
    })),
  );

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tu cuenta</h1>
          <p className="mt-2 text-texto-suave">Tus datos, tus preferencias y la seguridad de tu acceso.</p>
        </div>
        <Perfil nombre={sesion.user.name} email={sesion.user.email} verificado={sesion.user.emailVerified} />
        <Preferencias idioma={sesion.user.idioma === "en" ? "en" : "es"} />
        <Credenciales credenciales={credenciales} bovedaLista={bovedaDisponible()} />
        <Compatibles proveedores={compatibles} bovedaLista={bovedaDisponible()} />
        <MapaDeModelos mapas={mapas} />
        <Bloque
          titulo="Tu kit de marca"
          descripcion="Tu logotipo en una esquina de tus exportaciones. Solo tuyo."
          icono={<Stamp />}
        >
          <Link href="/cuenta/kit" className={claseBoton("secundario")}>
            Editar tu kit de marca
          </Link>
        </Bloque>
        {tieneContrasena && <CambiarContrasena />}
        <Passkeys
          passkeys={passkeys.map((p) => ({
            id: p.id,
            nombre: p.name ?? "Passkey",
            creada: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          }))}
        />
        <Sesiones
          actual={sesion.session.id}
          sesiones={sesiones.map((s) => ({
            id: s.id,
            agente: s.userAgent ?? "",
            ip: s.ipAddress ?? "",
            creada: new Date(s.createdAt).toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
