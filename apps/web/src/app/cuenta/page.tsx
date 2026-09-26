import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Logotipo } from "@/components/ui/logotipo";
import { SelectorTema } from "@/components/ui/theme-toggle";
import { auth } from "@/server/auth/auth";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { CambiarContrasena } from "./_componentes/cambiar-contrasena";
import { CerrarSesion } from "./_componentes/cerrar-sesion";
import { Passkeys } from "./_componentes/passkeys";
import { Perfil } from "./_componentes/perfil";
import { Preferencias } from "./_componentes/preferencias";
import { Sesiones } from "./_componentes/sesiones";

export const metadata: Metadata = { title: "Tu cuenta · Escenara" };
export const dynamic = "force-dynamic";

export default async function PaginaCuenta() {
  const sesion = await exigirSesion("/cuenta");
  const cabeceras = await headers();
  const [passkeys, sesiones, cuentas] = await Promise.all([
    auth().api.listPasskeys({ headers: cabeceras }),
    auth().api.listSessions({ headers: cabeceras }),
    auth().api.listUserAccounts({ headers: cabeceras }),
  ]);
  const tieneContrasena = cuentas.some((c) => c.providerId === "credential");

  return (
    <div className="min-h-dvh bg-fondo">
      <header className="border-b border-borde/40">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-3 md:px-8">
          <Link href="/" className="text-texto" aria-label="Escenara, volver a la portada">
            <Logotipo />
          </Link>
          <nav aria-label="Cuenta" className="flex flex-wrap items-center gap-2">
            {esAdmin(sesion) && (
              <Link
                href="/admin/componentes"
                className="rounded-full px-4 py-2 text-sm font-semibold text-texto-suave hover:bg-elevada hover:text-texto"
              >
                Admin
              </Link>
            )}
            <SelectorTema />
            <CerrarSesion />
          </nav>
        </div>
      </header>
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tu cuenta</h1>
          <p className="mt-2 text-texto-suave">Tus datos, tus preferencias y la seguridad de tu acceso.</p>
        </div>
        <Perfil nombre={sesion.user.name} email={sesion.user.email} verificado={sesion.user.emailVerified} />
        <Preferencias idioma={sesion.user.idioma === "en" ? "en" : "es"} />
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
