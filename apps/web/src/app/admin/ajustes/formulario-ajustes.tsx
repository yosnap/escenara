"use client";

import { Coins, HardDrive, Mail, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import type { ClaveSecreta, SecretoVista } from "@/server/boveda/secretos";
import { enviarCorreoPruebaAccion, guardarAjustesAccion } from "./acciones";
import { guardarSecretoAccion, quitarSecretoAccion } from "./acciones-secretos";
import { SeccionAccesoSocial } from "./seccion-acceso-social";
import { Seccion } from "./seccion-ajustes";
import { SeccionAnuncio } from "./seccion-anuncio";
import { SeccionAsistente } from "./seccion-asistente";
import { SeccionCalidad } from "./seccion-calidad";
import { SeccionCanto } from "./seccion-canto";
import { SeccionCoherencia } from "./seccion-coherencia";
import { SeccionControles } from "./seccion-controles";
import { SeccionDosPersonajes } from "./seccion-dos-personajes";
import { SeccionMontaje } from "./seccion-montaje";
import { SeccionPresupuesto } from "./seccion-presupuesto";
import { SeccionRevision } from "./seccion-revision";
import { SeccionSombra } from "./seccion-sombra";
import { SeccionVoz } from "./seccion-voz";

export interface DatosAjustes {
  inicial: Ajustes;
  secretos: SecretoVista[];
  proveedores: string[];
  redirecciones: Record<"google" | "github", string>;
  bovedaLista: boolean;
  /** Variables de `.env` que ya no hacen nada porque su proveedor está configurado en el panel. */
  variablesSobrantes: string[];
}

export function FormularioAjustes({
  inicial,
  secretos: secretosIniciales,
  proveedores,
  redirecciones,
  bovedaLista,
  variablesSobrantes,
}: DatosAjustes) {
  const [valores, setValores] = useState(inicial);
  const [secretos, setSecretos] = useState(secretosIniciales);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; campo?: keyof Ajustes } | null>(null);
  const [errorSecreto, setErrorSecreto] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probando, setProbando] = useState(false);

  const cambiar = <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => {
    setValores((v) => ({ ...v, [clave]: valor }));
    setResultado(null);
  };
  const errorDe = (campo: keyof Ajustes) =>
    resultado && !resultado.ok && resultado.campo === campo ? resultado.texto : undefined;

  const pista = (clave: ClaveSecreta) => secretos.find((s) => s.clave === clave)?.pista ?? null;

  const guardarSecreto = async (clave: ClaveSecreta, valor: string) => {
    setErrorSecreto(null);
    const r = await guardarSecretoAccion(clave, valor);
    if (!r.ok) {
      setErrorSecreto(r.error);
      return false;
    }
    setSecretos(r.secretos);
    return true;
  };

  const quitarSecreto = async (clave: ClaveSecreta) => {
    setErrorSecreto(null);
    const r = await quitarSecretoAccion(clave);
    if (r.ok) setSecretos(r.secretos);
    else setErrorSecreto(r.error);
  };

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
      {variablesSobrantes.length > 0 && (
        <Aviso tono="info">
          Estas variables de <code className="font-mono">.env</code> ya no se usan (la configuración está en este
          panel): <code className="font-mono">{variablesSobrantes.join(", ")}</code>. Puedes borrarlas.
        </Aviso>
      )}
      {errorSecreto && <Aviso tono="error">{errorSecreto}</Aviso>}

      <Seccion titulo="Registro" descripcion="Quién puede crear una cuenta." icono={<UserPlus />}>
        <Interruptor
          etiqueta="Registro abierto"
          descripcion="Si lo cierras, nadie más podrá crear una cuenta (la tuya ya existe)."
          activo={valores.registroAbierto}
          onCambio={(v) => cambiar("registroAbierto", v)}
        />
      </Seccion>

      <Seccion titulo="Trends" descripcion="Disponibilidad de las plantillas de formato corto." icono={<ShieldCheck />}>
        <Interruptor
          etiqueta="Mostrar trends vigentes"
          descripcion="Ocultarlos impide elegirlos y generarlos hasta volver a activar esta opción."
          activo={valores.trendsVisibles}
          onCambio={(v) => cambiar("trendsVisibles", v)}
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
        titulo="Personajes"
        descripcion="Cuántas fotos de referencia necesita un personaje para poder usarse al generar."
        icono={<UsersRound />}
      >
        <Campo
          etiqueta="Fotos de referencia mínimas por personaje"
          ayuda="Con menos fotos la identidad se pierde entre fotogramas. Un personaje por debajo del mínimo no puede generar, aunque tenga el consentimiento registrado."
          error={errorDe("minimoReferenciasPersonaje")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              max={10}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.minimoReferenciasPersonaje) ? "" : valores.minimoReferenciasPersonaje}
              onChange={(e) =>
                cambiar("minimoReferenciasPersonaje", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
              className="max-w-48"
            />
          )}
        </Campo>
      </Seccion>

      <SeccionCalidad valores={valores} errorDe={errorDe} onCambio={cambiar} />

      <Seccion
        titulo="Generación"
        descripcion="Avisos de gasto al generar con la clave de cada usuario."
        icono={<Coins />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Avisar por encima de (créditos)"
            ayuda="Un trabajo que pase de esta cifra exige un aviso extra antes de gastar. 0 = avisar siempre."
            error={errorDe("avisoCreditos")}
          >
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={Number.isNaN(valores.avisoCreditos) ? "" : valores.avisoCreditos}
                onChange={(e) => cambiar("avisoCreditos", e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
            )}
          </Campo>
          <Campo
            etiqueta="Euros por crédito de KIE (aproximado)"
            ayuda="Solo para mostrar la estimación en euros. KIE vende 1.000 créditos por unos 5 USD."
            error={errorDe("eurosPorCreditoKie")}
          >
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={0}
                step={0.0001}
                inputMode="decimal"
                value={Number.isNaN(valores.eurosPorCreditoKie) ? "" : valores.eurosPorCreditoKie}
                onChange={(e) =>
                  cambiar("eurosPorCreditoKie", e.target.value === "" ? Number.NaN : Number(e.target.value))
                }
              />
            )}
          </Campo>
          <Campo
            etiqueta="Euros por crédito de Google (aproximado)"
            ayuda="Solo para mostrar la estimación en euros. Déjalo en 0 mientras no lo hayas medido."
            error={errorDe("eurosPorCreditoGoogle")}
          >
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={0}
                step={0.0001}
                inputMode="decimal"
                value={Number.isNaN(valores.eurosPorCreditoGoogle) ? "" : valores.eurosPorCreditoGoogle}
                onChange={(e) =>
                  cambiar("eurosPorCreditoGoogle", e.target.value === "" ? Number.NaN : Number(e.target.value))
                }
              />
            )}
          </Campo>
          <Campo
            etiqueta="Euros por crédito de ElevenLabs (aproximado)"
            ayuda="Solo para mostrar la estimación en euros. Depende del plan contratado: mídelo antes de ponerlo."
            error={errorDe("eurosPorCreditoElevenlabs")}
          >
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={0}
                step={0.0001}
                inputMode="decimal"
                value={Number.isNaN(valores.eurosPorCreditoElevenlabs) ? "" : valores.eurosPorCreditoElevenlabs}
                onChange={(e) =>
                  cambiar("eurosPorCreditoElevenlabs", e.target.value === "" ? Number.NaN : Number(e.target.value))
                }
              />
            )}
          </Campo>
        </div>
      </Seccion>

      <SeccionAsistente valores={valores} errorDe={errorDe} onCambio={cambiar} />

      <SeccionAnuncio valores={valores} onCambio={cambiar} />

      <SeccionDosPersonajes valores={valores} onCambio={cambiar} />

      <SeccionControles valores={valores} errorDe={errorDe} onCambio={cambiar} />

      <SeccionRevision valores={valores} errorDe={errorDe} onCambio={cambiar} />

      <SeccionCoherencia
        valores={valores}
        errorDe={errorDe}
        onCambio={cambiar}
        pistaTypesafe={pista("typesafeApiKey")}
        bovedaLista={bovedaLista}
        onGuardarSecreto={(valor) => guardarSecreto("typesafeApiKey", valor)}
        onQuitarSecreto={() => quitarSecreto("typesafeApiKey")}
      />
      <SeccionSombra valores={valores} errorDe={errorDe} onCambio={cambiar} />
      <SeccionVoz valores={valores} errorDe={errorDe} onCambio={cambiar} />
      <SeccionCanto valores={valores} errorDe={errorDe} onCambio={cambiar} />

      {/* Después de la voz: montar es lo último del recorrido de un proyecto (0.32.0). */}
      <SeccionMontaje valores={valores} errorDe={errorDe} onCambio={cambiar} />

      <SeccionPresupuesto
        valores={valores}
        pista={pista}
        bovedaLista={bovedaLista}
        errorDe={errorDe}
        onCambio={cambiar}
        onGuardarSecreto={guardarSecreto}
        onQuitarSecreto={quitarSecreto}
      />

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
          <CampoSecreto
            etiqueta="Contraseña del servidor"
            pista={pista("smtpContrasena")}
            vacio="Se guarda cifrada y no se vuelve a mostrar. Vacía si el servidor no la pide."
            deshabilitado={!bovedaLista}
            tituloQuitar="¿Quitar la contraseña del correo?"
            descripcionQuitar="Si el servidor la pide, dejarán de salir los correos de confirmación y recuperación."
            onGuardar={(valor) => guardarSecreto("smtpContrasena", valor)}
            onQuitar={() => quitarSecreto("smtpContrasena")}
          />
        </div>
        {pista("smtpContrasena") !== null && valores.smtpUsuario.trim() === "" && (
          <Aviso tono="error">
            Hay una contraseña guardada, pero el usuario está vacío: no se enviará con la conexión. Escribe el usuario
            del servidor o quita la contraseña.
          </Aviso>
        )}
        <Interruptor
          etiqueta="Conexión segura directa (TLS, puerto 465)"
          descripcion="Desactivado: se usa STARTTLS si el servidor lo ofrece."
          activo={valores.smtpSeguro}
          onCambio={(v) => cambiar("smtpSeguro", v)}
        />
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

      <SeccionAccesoSocial
        valores={valores}
        activos={proveedores}
        redirecciones={redirecciones}
        pista={pista}
        bovedaLista={bovedaLista}
        errorDe={errorDe}
        onCambio={cambiar}
        onGuardarSecreto={guardarSecreto}
        onQuitarSecreto={quitarSecreto}
      />

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie/95 p-4 shadow-lg backdrop-blur">
        <Boton type="submit" cargando={guardando}>
          Guardar ajustes
        </Boton>
        {resultado && <Aviso tono={resultado.ok ? "correcto" : "error"}>{resultado.texto}</Aviso>}
      </div>
    </form>
  );
}
