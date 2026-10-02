"use client";

import { BadgeCheck, Mail, RotateCcw, ShieldCheck, ShieldOff, Trash, Trash2 } from "lucide-react";
import {
  type ComponentType,
  createContext,
  type ReactElement,
  type ReactNode,
  useActionState,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonIcono } from "@/components/ui/button";
import { estiloCampoAdmin } from "../estilos-admin";
import { gestionarUsuario } from "./acciones";

const NOMBRES = {
  activar: "Verificar correo",
  correo: "Reenviar verificación",
  bloquear: "Deshabilitar",
  desbloquear: "Habilitar",
  eliminar: "Enviar a eliminados",
  restaurar: "Restaurar",
  definitivo: "Eliminar definitivamente",
} as const;
type Accion = keyof typeof NOMBRES;
const ICONOS = {
  activar: BadgeCheck,
  correo: Mail,
  bloquear: ShieldOff,
  desbloquear: ShieldCheck,
  eliminar: Trash2,
  restaurar: RotateCcw,
  definitivo: Trash,
};
type Cuenta = {
  id: string;
  email: string;
  verificado: boolean;
  bloqueado: boolean;
  borrado: boolean;
  eliminado: boolean;
  definitivo: boolean;
  elegibleEn: string | null;
};
type Seleccion = { cuenta: Cuenta; accion: Accion; operacion: string };
const AbrirAccion = createContext<(cuenta: Cuenta, accion: Accion) => void>(() => {});
type PropsAyuda = { texto: string; children: ReactElement };
const AyudaInicial = ({ children }: PropsAyuda) => children;

export function GestorAccionesUsuario({ children }: { children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  useEffect(() => {
    if (seleccion) dialogo.current?.showModal();
  }, [seleccion]);
  return (
    <AbrirAccion.Provider value={(cuenta, accion) => setSeleccion({ cuenta, accion, operacion: crypto.randomUUID() })}>
      {children}
      <dialog
        ref={dialogo}
        aria-label="Confirmar acción de usuario"
        onClose={() => {
          if (document.activeElement === document.body) document.querySelector<HTMLElement>("#contenido")?.focus();
        }}
        className="m-auto max-h-[90dvh] w-[min(94vw,36rem)] overflow-y-auto rounded-control bg-superficie p-5 text-texto backdrop:bg-black/50"
      >
        {seleccion && (
          <Confirmacion key={seleccion.operacion} seleccion={seleccion} cerrar={() => dialogo.current?.close()} />
        )}
      </dialog>
    </AbrirAccion.Provider>
  );
}

export function AccionesFila({
  id,
  email,
  verificado,
  bloqueado,
  borrado,
  eliminado,
  definitivo,
  elegibleEn,
  soloPapelera = false,
}: Cuenta & { soloPapelera?: boolean }) {
  const abrir = useContext(AbrirAccion);
  const contenedor = useRef<HTMLDivElement>(null);
  const enfocado = useRef<string | null>(null);
  const [Ayuda, setAyuda] = useState<ComponentType<PropsAyuda>>(() => AyudaInicial);
  useEffect(() => {
    if (soloPapelera) return;
    let vigente = true;
    // El tooltip compartido se descarga después de hidratar, sin cargar diálogos ni pestañas en la entrada.
    import("@/components/ui/overlay")
      .then((modulo) => {
        if (!vigente) return;
        if (contenedor.current?.contains(document.activeElement))
          enfocado.current = document.activeElement?.getAttribute("aria-label") ?? null;
        setAyuda(() => modulo.Ayuda);
      })
      .catch(() => {}); // Los botones conservan su título nativo si falla la descarga.
    return () => {
      vigente = false;
    };
  }, [soloPapelera]);
  useLayoutEffect(() => {
    if (Ayuda === AyudaInicial) return;
    if (enfocado.current) {
      const boton = Array.from(contenedor.current?.querySelectorAll("button") ?? []).find(
        (b) => b.getAttribute("aria-label") === enfocado.current,
      );
      boton?.focus();
      enfocado.current = null;
    }
  }, [Ayuda]);
  const acciones: Accion[] = eliminado
    ? definitivo
      ? []
      : ["restaurar", "definitivo"]
    : borrado
      ? []
      : [
          ...(!soloPapelera ? ([bloqueado ? "desbloquear" : "bloquear"] as Accion[]) : []),
          ...(!soloPapelera ? (["correo", "activar"] as const) : []),
          "eliminar",
        ];
  const disponible = !elegibleEn || new Date(elegibleEn).getTime() <= Date.now();
  return (
    <div ref={contenedor} className={soloPapelera ? "flex flex-wrap gap-2" : "flex min-w-44 items-center gap-1"}>
      {acciones.map((a) => {
        const correo = a === "correo" || a === "activar";
        const inhabilitado = (a === "definitivo" && !disponible) || (correo && (verificado || bloqueado));
        const etiqueta = a === "eliminar" && !soloPapelera ? "Eliminar" : NOMBRES[a];
        const ayuda =
          correo && verificado
            ? "Correo ya verificado"
            : correo && bloqueado
              ? "Habilita la cuenta antes de verificar el correo"
              : a === "eliminar"
                ? "Eliminar: mover a Eliminados"
                : a === "definitivo" && !disponible
                  ? `Disponible desde ${elegibleEn}`
                  : etiqueta;
        const Icono = ICONOS[a];
        const ejecutar = () => {
          if (!inhabilitado) abrir({ id, email, verificado, bloqueado, borrado, eliminado, definitivo, elegibleEn }, a);
        };
        if (!soloPapelera)
          return (
            <Ayuda key={a} texto={ayuda}>
              <BotonIcono
                etiqueta={etiqueta}
                aria-disabled={inhabilitado || undefined}
                onClick={ejecutar}
                title={ayuda}
                className={`shrink-0 rounded-control border border-borde aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${a === "eliminar" || a === "definitivo" ? "text-error hover:bg-error/10" : "hover:border-acento"}`}
              >
                <Icono className="size-4" aria-hidden />
              </BotonIcono>
            </Ayuda>
          );
        return (
          <Boton
            key={a}
            type="button"
            variante={a === "definitivo" || a === "eliminar" ? "peligro" : "secundario"}
            tamano="sm"
            disabled={inhabilitado}
            onClick={ejecutar}
          >
            {NOMBRES[a]}
          </Boton>
        );
      })}
      {eliminado && !disponible && <p className="text-xs">Borrado definitivo disponible desde {elegibleEn}.</p>}
      {definitivo && <p>Borrado definitivo autorizado; pendiente del worker.</p>}
    </div>
  );
}

function Confirmacion({ seleccion, cerrar }: { seleccion: Seleccion; cerrar: () => void }) {
  const {
    cuenta: { id, email },
    accion: elegida,
    operacion,
  } = seleccion;
  const [resultado, enviar, pendiente] = useActionState(gestionarUsuario, { ok: false, mensaje: "" });
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">{elegida && NOMBRES[elegida]}</h2>
        <Boton type="button" variante="fantasma" disabled={pendiente} onClick={cerrar}>
          Cerrar
        </Boton>
      </div>
      <form key={elegida} action={enviar} className="space-y-4">
        <input type="hidden" name="usuario" value={id} />
        <input type="hidden" name="accion" value={elegida ?? ""} />
        <input type="hidden" name="operacion" value={operacion} />
        <p className="break-all">
          Destinatario: <strong>{email}</strong>
        </p>
        {elegida === "activar" && (
          <p>Marca el correo como verificado directamente. Confirma que has comprobado la identidad.</p>
        )}
        {elegida === "eliminar" && (
          <p>
            Desactiva la cuenta y revoca sesiones. Conserva sus datos en Eliminados hasta autorizar el borrado
            definitivo.
          </p>
        )}
        {elegida === "definitivo" && (
          <p>Autoriza un borrado irreversible por el worker, con conciliación y limpieza de archivos.</p>
        )}
        <label className="flex flex-col gap-1">
          Motivo (sin datos privados)
          <input required name="motivo" minLength={3} maxLength={300} className={estiloCampoAdmin} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="confirmar" required />
          Confirmo la cuenta destinataria y esta acción.
        </label>
        <Boton
          type="submit"
          disabled={resultado.ok}
          cargando={pendiente}
          variante={elegida === "definitivo" ? "peligro" : "primario"}
        >
          Confirmar acción
        </Boton>
        {resultado.mensaje && <Alerta tipo={resultado.ok ? "hecho" : "error"}>{resultado.mensaje}</Alerta>}
      </form>
    </>
  );
}
