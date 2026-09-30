"use client";

import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { fechaLarga } from "@/lib/fechas";
import { FRASE_BORRADO_CUENTA } from "@/lib/tus-datos";
import { estadoBorradoCuenta, pedirBorradoCuenta, type ResumenBorradoCuenta } from "./api-datos";
import { ExportarProyecto } from "./exportar-proyecto";

/**
 * Diálogo de **borrar la cuenta**. Es irreversible, así que antes de dejar confirmar: enumera todo lo que desaparece
 * con las cifras del servidor, ofrece exportar cada proyecto, dice qué se conserva (anónimo y agregado), explica el
 * periodo de gracia y pide escribir la frase. La sesión reciente la exige el servidor; si falta, se ofrece volver a
 * entrar sin perder el sitio.
 */

const n = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`;
const megas = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

export function lineasBorradoCuenta(r: ResumenBorradoCuenta): string[] {
  return [
    `${n(r.proyectos.length, "proyecto", "proyectos")} con sus escenas, montajes, revisiones y paquetes.`,
    `${n(r.personajes, "personaje", "personajes")}, ${n(r.productos, "producto", "productos")} y ${n(r.lugares, "lugar", "lugares")}.`,
    `${n(r.medios, "archivo", "archivos")} de tu biblioteca (${megas(r.bytes)}), también del almacenamiento.`,
    `${n(r.credenciales, "clave de proveedor", "claves de proveedor")} de tu bóveda, ${n(r.passkeys, "passkey", "passkeys")} y ${n(r.sesiones, "sesión abierta", "sesiones abiertas")}.`,
    "Tu presupuesto, tu historial de trabajos y tus apuntes de gasto, tu kit de marca y tus ajustes.",
  ];
}

export function DialogoBorrarCuenta({
  abierto,
  onAbiertoCambio,
  onProgramado,
}: {
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onProgramado: () => void;
}) {
  const [resumen, setResumen] = useState<ResumenBorradoCuenta | null>(null);
  const [frase, setFrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sesionAntigua, setSesionAntigua] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setResumen(null);
    setError(null);
    setSesionAntigua(false);
    setFrase("");
    estadoBorradoCuenta().then((r) => {
      if (r.ok) setResumen(r.datos.resumen);
      else setError(r.error);
    });
  }, [abierto]);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    const r = await pedirBorradoCuenta(frase);
    setEnviando(false);
    if (!r.ok) {
      setSesionAntigua(r.estado === 403);
      setError(r.error);
      return;
    }
    onAbiertoCambio(false);
    onProgramado();
  };

  const volverAEntrar = async () => {
    const { authCliente } = await import("@/lib/auth-cliente");
    await authCliente.signOut();
    window.location.assign(`/entrar?volver=${encodeURIComponent("/cuenta?borrar=1")}`);
  };

  const fraseCorrecta = frase.trim().toLowerCase() === FRASE_BORRADO_CUENTA;
  const bloqueado = resumen?.unicoAdministrador === true;
  const cuando = resumen ? fechaLarga(new Date(Date.now() + resumen.diasGracia * 24 * 3600_000)) : "";

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      tamano="xl"
      titulo="¿Borrar tu cuenta?"
      descripcion="Se borra todo lo tuyo de esta instalación. No se puede deshacer una vez pasado el periodo de gracia."
      pie={
        <>
          <Boton variante="fantasma" onClick={() => onAbiertoCambio(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            cargando={enviando}
            disabled={resumen === null || bloqueado || !fraseCorrecta}
            onClick={confirmar}
          >
            Programar el borrado
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {resumen === null && !error && <p className="text-texto-suave">Comprobando qué hay en tu cuenta…</p>}
        {bloqueado && (
          <Aviso tono="error">
            Eres el único administrador de esta instalación: si borras tu cuenta, nadie podrá gestionarla. Antes tiene
            que haber otra cuenta con el rol de administrador.
          </Aviso>
        )}
        {resumen && (
          <>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-texto">Desaparece:</p>
              <ul className="flex list-inside list-disc flex-col gap-1.5 text-texto">
                {/* alerta-permitida: lo que se borra, no un problema */}
                {lineasBorradoCuenta(resumen).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-texto">Se conserva, sin nada que te identifique:</p>
              <p className="text-texto-suave">
                El gasto sumado por mes, proveedor y modelo (para cuadrar las cuentas de la instalación) y una prueba
                mínima de cada consentimiento y declaración de derechos que hiciste: tipo, alcance, versión del texto y
                fecha. Sin tu nombre, sin nombres de personas ni de lugares, sin fotos y sin tu correo.
              </p>
            </div>
            {resumen.proyectos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-texto">Antes, llévate tus proyectos:</p>
                <ul className="flex flex-col gap-3">
                  {resumen.proyectos.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 rounded-tarjeta border border-borde p-3">
                      <span className="font-semibold text-texto">{p.titulo || "Sin título"}</span>
                      <ExportarProyecto proyectoId={p.id} compacto />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Aviso tono="aviso">
              Tienes {n(resumen.diasGracia, "día", "días")} para arrepentirte: hasta el {cuando} tu cuenta queda
              desactivada (solo podrás entrar para cancelar el borrado) y tus demás sesiones se cierran. Después se
              borra todo y ya no hay vuelta atrás.
            </Aviso>
            <Campo etiqueta={`Escribe «${FRASE_BORRADO_CUENTA}» para confirmar`}>
              {(props) => (
                <EntradaTexto {...props} value={frase} onChange={(e) => setFrase(e.target.value)} autoComplete="off" />
              )}
            </Campo>
          </>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
        {sesionAntigua && (
          <div>
            <Boton variante="secundario" tamano="sm" icono={<LogIn className="size-4" />} onClick={volverAEntrar}>
              Volver a entrar y seguir aquí
            </Boton>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
