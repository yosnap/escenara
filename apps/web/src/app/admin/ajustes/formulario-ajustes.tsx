"use client";

import { HardDrive, KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { enviarCorreoPruebaAccion, guardarAjustesAccion } from "./acciones";

function Seccion({
  titulo,
  descripcion,
  icono,
  children,
}: {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento/12 text-acento [&>svg]:size-5"
        >
          {icono}
        </span>
        <div>
          <h2 className="text-xl font-bold text-texto">{titulo}</h2>
          <p className="text-sm text-texto-suave">{descripcion}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function FormularioAjustes({ inicial, proveedores }: { inicial: Ajustes; proveedores: string[] }) {
  const [valores, setValores] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; campo?: keyof Ajustes } | null>(null);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probando, setProbando] = useState(false);

  const cambiar = <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => {
    setValores((v) => ({ ...v, [clave]: valor }));
    setResultado(null);
  };
  const errorDe = (campo: keyof Ajustes) =>
    resultado && !resultado.ok && resultado.campo === campo ? resultado.texto : undefined;

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setGuardando(true);
    const r = await guardarAjustesAccion(valores);
    setGuardando(false);
    if (r.ok) {
      setValores(r.ajustes);
      setResultado({ ok: true, texto: "Ajustes guardados." });
    } else setResultado({ ok: false, texto: r.error, campo: r.campo });
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5">
      <Seccion titulo="Registro" descripcion="Quién puede crear una cuenta." icono={<UserPlus />}>
        <Interruptor
          etiqueta="Registro abierto"
          descripcion="Si lo cierras, nadie más podrá crear una cuenta (la tuya ya existe)."
          activo={valores.registroAbierto}
          onCambio={(v) => cambiar("registroAbierto", v)}
        />
      </Seccion>

      <Seccion
        titulo="Almacenamiento"
        descripcion="Espacio para fotos, vídeos y audios de cada usuario."
        icono={<HardDrive />}
      >
        <Campo
          etiqueta="Espacio por usuario (MB)"
          ayuda="0 = sin límite. Quien administra no tiene límite."
          error={errorDe("cuotaMb")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.cuotaMb) ? "" : valores.cuotaMb}
              onChange={(e) => cambiar("cuotaMb", e.target.value === "" ? Number.NaN : Number(e.target.value))}
              className="max-w-48"
            />
          )}
        </Campo>
      </Seccion>

      <Seccion
        titulo="Correo"
        descripcion="Servidor con el que se envían la confirmación de cuenta y la recuperación de contraseña."
        icono={<Mail />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Remitente"
            ayuda="Por ejemplo: Escenara <hola@tudominio.com>"
            error={errorDe("correoRemitente")}
          >
            {(p) => (
              <EntradaTexto
                {...p}
                value={valores.correoRemitente}
                onChange={(e) => cambiar("correoRemitente", e.target.value)}
              />
            )}
          </Campo>
          <Campo etiqueta="Servidor SMTP" error={errorDe("smtpHost")}>
            {(p) => (
              <EntradaTexto {...p} value={valores.smtpHost} onChange={(e) => cambiar("smtpHost", e.target.value)} />
            )}
          </Campo>
          <Campo etiqueta="Puerto" error={errorDe("smtpPuerto")}>
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={1}
                max={65535}
                inputMode="numeric"
                value={Number.isNaN(valores.smtpPuerto) ? "" : valores.smtpPuerto}
                onChange={(e) => cambiar("smtpPuerto", e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
            )}
          </Campo>
          <Campo etiqueta="Usuario" ayuda="Vacío si el servidor no pide autenticación." error={errorDe("smtpUsuario")}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={valores.smtpUsuario}
                onChange={(e) => cambiar("smtpUsuario", e.target.value)}
              />
            )}
          </Campo>
        </div>
        <Interruptor
          etiqueta="Conexión segura directa (TLS, puerto 465)"
          descripcion="Desactivado: se usa STARTTLS si el servidor lo ofrece."
          activo={valores.smtpSeguro}
          onCambio={(v) => cambiar("smtpSeguro", v)}
        />
        <p className="text-sm text-texto-suave">
          La contraseña del servidor de correo se podrá guardar aquí, cifrada, con la bóveda de secretos (versión
          0.9.0).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Boton
            variante="secundario"
            cargando={probando}
            onClick={async () => {
              setProbando(true);
              setPrueba(await enviarCorreoPruebaAccion());
              setProbando(false);
            }}
          >
            Enviar correo de prueba
          </Boton>
          <span className="text-sm text-texto-suave">Usa los datos ya guardados.</span>
        </div>
        {prueba && <Aviso tono={prueba.ok ? "correcto" : "error"}>{prueba.mensaje}</Aviso>}
      </Seccion>

      <Seccion titulo="Seguridad" descripcion="Límite de intentos por dirección IP." icono={<ShieldCheck />}>
        <Campo
          etiqueta="Cabecera con la IP real"
          ayuda="Solo si publicas detrás de un proxy propio que la escriba (p. ej. x-real-ip). Vacío en local."
          error={errorDe("cabecerasIp")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              placeholder="x-real-ip"
              value={valores.cabecerasIp}
              onChange={(e) => cambiar("cabecerasIp", e.target.value)}
            />
          )}
        </Campo>
      </Seccion>

      <Seccion titulo="Acceso con Google y GitHub" descripcion="Proveedores externos para entrar." icono={<KeyRound />}>
        <p className="text-texto">
          {proveedores.length > 0
            ? `Activos: ${proveedores.map((p) => (p === "google" ? "Google" : "GitHub")).join(" y ")}.`
            : "Ninguno activo."}
        </p>
        <p className="text-sm text-texto-suave">
          Sus claves son secretas: pasarán a este panel, cifradas, con la bóveda de secretos (versión 0.9.0). Hasta
          entonces se configuran en <code className="font-mono">.env</code>.
        </p>
      </Seccion>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie/95 p-4 shadow-lg backdrop-blur">
        <Boton type="submit" cargando={guardando}>
          Guardar ajustes
        </Boton>
        {resultado && (
          <span
            role={resultado.ok ? "status" : "alert"}
            className={resultado.ok ? "font-medium text-correcto" : "font-medium text-error"}
          >
            {resultado.texto}
          </span>
        )}
      </div>
    </form>
  );
}
