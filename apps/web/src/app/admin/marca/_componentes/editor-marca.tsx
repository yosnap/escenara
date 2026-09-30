"use client";

import { Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Alerta, type TipoAlerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Campo } from "@/components/ui/field";
import { PreviaMarca } from "@/components/ui/previa-marca";
import type { Problema } from "@/lib/llevar-al-problema";
import { describirPar, revisarContraste } from "@/lib/marca-contraste";
import { type DocumentoMarca, type ErrorCampo, validarDocumentoMarca } from "@/lib/marca-esquema";
import { enJson, pedirMarca } from "@/lib/marca-peticion";
import {
  type ActivosDeVersion,
  type ActivoVista,
  type EstadoMarcaVista,
  type RolLogo,
  urlDeActivoMarca,
  type VersionMarcaVista,
} from "@/lib/marca-vista";
import { HistorialMarca } from "./historial-marca";
import { SeccionColores } from "./seccion-colores";
import { SeccionLogotipos } from "./seccion-logotipos";
import { SeccionTextos } from "./seccion-textos";
import { SeccionTipografia } from "./seccion-tipografia";

interface Mensaje {
  tipo: TipoAlerta;
  titulo: string;
  texto: string;
  elementos?: Problema[];
}

const problemas = (errores: readonly ErrorCampo[]): Problema[] =>
  errores.map((e) => ({ id: `marca-${e.campo}`, texto: `${e.campo}: ${e.mensaje}` }));

/** Copia el documento cambiando un valor por su ruta con puntos (`theme.dark.text`). */
function conValor(documento: DocumentoMarca, ruta: string, valor: unknown): DocumentoMarca {
  const copia = structuredClone(documento) as unknown as Record<string, unknown>;
  const partes = ruta.split(".");
  let nodo = copia;
  for (const parte of partes.slice(0, -1)) nodo = nodo[parte] as Record<string, unknown>;
  nodo[partes.at(-1) as string] = valor;
  return copia as unknown as DocumentoMarca;
}

/**
 * **Editor de la marca de la instalación**: por secciones (textos, colores, tipografía y logotipos), con la
 * previsualización de los dos temas a la vez, el contraste comprobado mientras se edita, y Guardar borrador, Publicar
 * y Revertir. El servidor vuelve a comprobarlo todo: lo que se ve aquí es para no llevarse sorpresas.
 */
export function EditorMarca({ estadoInicial }: { estadoInicial: EstadoMarcaVista }) {
  const router = useRouter();
  const [estado, setEstado] = useState(estadoInicial);
  const origen = estadoInicial.borrador ?? estadoInicial.publicada;
  const [documento, setDocumento] = useState<DocumentoMarca>(origen?.documento ?? estadoInicial.base);
  const [activos, setActivos] = useState<ActivosDeVersion>(origen?.activos ?? { logos: {}, fuentes: [] });
  const [catalogo, setCatalogo] = useState<Record<string, ActivoVista>>(estadoInicial.activos);
  const [notas, setNotas] = useState(estadoInicial.borrador?.notas ?? "");
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const validacion = useMemo(() => validarDocumentoMarca(documento), [documento]);
  const errores = useMemo(
    () => new Map((validacion.ok ? [] : validacion.errores).map((e) => [e.campo, e.mensaje])),
    [validacion],
  );
  // La previsualización se queda con la última marca válida mientras haya un campo a medio escribir (estado derivado
  // de renders anteriores: se actualiza durante el render, como recomienda React, sin efectos).
  const [ultimaValida, setUltimaValida] = useState<DocumentoMarca>(
    validacion.ok ? validacion.documento : estadoInicial.base,
  );
  if (validacion.ok && validacion.documento !== ultimaValida) setUltimaValida(validacion.documento);
  const contraste = useMemo(() => revisarContraste(ultimaValida), [ultimaValida]);

  const logosUrl = Object.fromEntries(
    Object.entries(activos.logos).map(([rol, id]) => [rol, urlDeActivoMarca(id)]),
  ) as Partial<Record<RolLogo, string>>;
  const fuentesCss = activos.fuentes.map((f) => ({ familia: f.familia, url: urlDeActivoMarca(f.activoId) }));
  const fuentesSubidas = Object.values(catalogo).filter((a) => a.familia !== null);

  async function recargar(): Promise<EstadoMarcaVista | null> {
    const r = await pedirMarca<EstadoMarcaVista>("/api/admin/marca");
    if (r.ok) setEstado(r.datos);
    return r.ok ? r.datos : null;
  }

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setMensaje(null);
    try {
      await accion();
    } finally {
      setOcupado(false);
    }
  }

  const guardarBorrador = () =>
    pedirMarca<{ borrador: VersionMarcaVista }>("/api/admin/marca", enJson("PUT", { documento, activos, notas }));

  const alGuardar = () =>
    ejecutar(async () => {
      const r = await guardarBorrador();
      if (!r.ok) {
        setMensaje({
          tipo: "error",
          titulo: "No se ha guardado el borrador",
          texto: r.error,
          elementos: problemas(r.errores),
        });
        return;
      }
      await recargar();
      setMensaje({
        tipo: "hecho",
        titulo: "Borrador guardado",
        texto: `Versión ${r.datos.borrador.version}, sin publicar: nadie más la ve todavía.`,
      });
    });

  const alPublicar = () =>
    ejecutar(async () => {
      const guardado = await guardarBorrador();
      if (!guardado.ok) {
        setMensaje({
          tipo: "error",
          titulo: "No se ha publicado",
          texto: guardado.error,
          elementos: problemas(guardado.errores),
        });
        return;
      }
      const r = await pedirMarca<{ publicada: VersionMarcaVista }>("/api/admin/marca/publicar", enJson("POST"));
      if (!r.ok) {
        setMensaje({
          tipo: r.bloqueos.length > 0 ? "bloqueo" : "error",
          titulo: "No se ha publicado",
          texto: r.error,
          elementos: [...problemas(r.errores), ...r.bloqueos.map((b) => ({ texto: describirPar(b) }))],
        });
        return;
      }
      await recargar();
      setNotas("");
      setMensaje({
        tipo: "hecho",
        titulo: "Marca publicada",
        texto: `La versión ${r.datos.publicada.version} ya es la de toda la instalación.`,
      });
      router.refresh();
    });

  const alDescartar = () =>
    ejecutar(async () => {
      const r = await pedirMarca<void>("/api/admin/marca", enJson("DELETE"));
      if (!r.ok) {
        setMensaje({ tipo: "error", titulo: "No se ha descartado", texto: r.error });
        return;
      }
      const nuevo = await recargar();
      const base = nuevo?.publicada;
      setDocumento(base?.documento ?? estadoInicial.base);
      setActivos(base?.activos ?? { logos: {}, fuentes: [] });
      setNotas("");
      setMensaje({ tipo: "hecho", titulo: "Borrador descartado", texto: "El editor vuelve a la marca publicada." });
    });

  const alRevertir = (version: VersionMarcaVista) =>
    ejecutar(async () => {
      const r = await pedirMarca<{ publicada: VersionMarcaVista } | { borrador: VersionMarcaVista; motivos: string[] }>(
        `/api/admin/marca/versiones/${version.id}/revertir`,
        enJson("POST"),
      );
      if (!r.ok) {
        setMensaje({ tipo: r.bloqueos.length > 0 ? "bloqueo" : "error", titulo: "No se ha revertido", texto: r.error });
        return;
      }
      await recargar();
      // Ya no cumple el contraste de hoy: vuelve como borrador para corregirla, sin publicar.
      if (r.datos && "borrador" in r.datos) {
        const { borrador, motivos } = r.datos;
        setDocumento(borrador.documento);
        setActivos(borrador.activos);
        setNotas(borrador.notas);
        setMensaje({
          tipo: "aviso",
          titulo: `Versión ${version.version} restaurada como borrador, sin publicar`,
          texto: `No cumple el contraste de hoy, así que no se ha publicado: ${motivos.join(" ")} Corrige esos colores en el editor y publícala; mientras, sigue la marca que había.`,
        });
        return;
      }
      setMensaje({
        tipo: "hecho",
        titulo: "Versión recuperada",
        texto: `Vuelve a estar publicada la versión ${version.version}.`,
      });
      router.refresh();
    });

  const alVolverAEscenara = () =>
    ejecutar(async () => {
      const r = await pedirMarca<void>("/api/admin/marca/retirar", enJson("POST"));
      if (!r.ok) {
        setMensaje({ tipo: "error", titulo: "No se ha retirado", texto: r.error });
        return;
      }
      await recargar();
      setMensaje({
        tipo: "hecho",
        titulo: "Marca de Escenara",
        texto: "La instalación vuelve a la marca de Escenara.",
      });
      router.refresh();
    });

  const alSubirActivo = (activo: ActivoVista) => setCatalogo((c) => ({ ...c, [activo.id]: activo }));

  return (
    <div className="flex flex-col gap-8">
      <Alerta tipo="info" anuncio="ninguno">
        {estado.publicada
          ? `Publicada: versión ${estado.publicada.version} (${estado.publicada.documento.identity.name}).`
          : "Sin marca publicada: la instalación usa la marca de Escenara."}{" "}
        {estado.borrador
          ? `Editando el borrador de la versión ${estado.borrador.version}.`
          : "Los cambios se guardan como un borrador nuevo."}
      </Alerta>

      <Bloque titulo="Previsualización" descripcion="Componentes reales con esta marca, en los dos temas a la vez.">
        <PreviaMarca documento={ultimaValida} logos={logosUrl} fuentes={validacion.ok ? fuentesCss : []} />
        {contraste.bloqueos.length > 0 && (
          <Alerta
            tipo="bloqueo"
            titulo="Hay textos que no se leen: así no se puede publicar"
            anuncio="ninguno"
            elementos={contraste.bloqueos.map((b) => ({ texto: describirPar(b) }))}
          />
        )}
        {contraste.avisos.length > 0 && (
          <Alerta
            tipo="aviso"
            titulo="Contraste justo en componentes o colores vibrantes"
            anuncio="ninguno"
            elementos={contraste.avisos.map((b) => ({ texto: describirPar(b) }))}
          >
            Se puede publicar, pero se verán peor los bordes, el foco o las pegatinas.
          </Alerta>
        )}
      </Bloque>

      <Bloque titulo="Textos" descripcion="Nombre, lema y descripción de la instalación.">
        <SeccionTextos
          documento={documento}
          errores={errores}
          onCambio={(ruta, v) => setDocumento((d) => conValor(d, ruta, v))}
        />
      </Bloque>

      <Bloque
        titulo="Colores"
        descripcion="Los tokens de los dos temas. Los de texto tienen que llegar a 4,5:1 sobre sus fondos."
      >
        <SeccionColores
          documento={documento}
          errores={errores}
          onCambio={(grupo, modo, clave, v) => setDocumento((d) => conValor(d, `${grupo}.${modo}.${clave}`, v))}
        />
      </Bloque>

      <Bloque titulo="Tipografía" descripcion="Familia de la interfaz: de serie o una fuente propia autoalojada.">
        <SeccionTipografia
          familiaActual={documento.typography.family}
          familiaDeEscenara={estado.base.typography.family}
          fuentes={fuentesSubidas}
          error={errores.get("typography.family")}
          onElegir={(familia, fuente) => {
            setDocumento((d) => conValor(d, "typography.family", familia));
            setActivos((a) => ({
              ...a,
              fuentes: fuente ? [{ activoId: fuente.id, familia: fuente.familia ?? "" }] : [],
            }));
          }}
          onSubida={alSubirActivo}
        />
      </Bloque>

      <Bloque
        titulo="Logotipos"
        descripcion="Horizontal y símbolo para cada tema. Al publicar se generan el favicon, los iconos y la imagen social."
      >
        <SeccionLogotipos
          documento={ultimaValida}
          logos={activos.logos}
          catalogo={catalogo}
          onCambio={(rol, activo) => {
            if (activo) alSubirActivo(activo);
            setActivos((a) => {
              const logos = { ...a.logos };
              if (activo) logos[rol] = activo.id;
              else delete logos[rol];
              return { ...a, logos };
            });
          }}
        />
      </Bloque>

      <Bloque titulo="Guardar y publicar" descripcion="Publicar es atómico: o cambia todo o no cambia nada.">
        <Campo etiqueta="Notas de esta versión (opcional)" ayuda="Qué cambia y por qué. Se ve en el historial.">
          {(props) => <AreaTexto {...props} value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />}
        </Campo>
        {!validacion.ok && (
          <Alerta
            tipo="bloqueo"
            titulo="Hay campos que no son válidos"
            anuncio="ninguno"
            elementos={problemas(validacion.errores)}
          >
            Corrígelos para guardar o publicar. La previsualización enseña la última marca válida.
          </Alerta>
        )}
        <div className="flex flex-wrap gap-3">
          <Boton
            type="button"
            variante="secundario"
            icono={<Save className="size-4" />}
            disabled={!validacion.ok || ocupado}
            onClick={alGuardar}
          >
            Guardar borrador
          </Boton>
          <Boton
            type="button"
            icono={<Send className="size-4" />}
            cargando={ocupado}
            disabled={!validacion.ok || contraste.bloqueos.length > 0}
            onClick={alPublicar}
          >
            Publicar
          </Boton>
          {estado.borrador && (
            <Boton
              type="button"
              variante="fantasma"
              icono={<Trash2 className="size-4" />}
              disabled={ocupado}
              onClick={alDescartar}
            >
              Descartar borrador
            </Boton>
          )}
        </div>
        {mensaje && (
          <Alerta tipo={mensaje.tipo} titulo={mensaje.titulo} elementos={mensaje.elementos}>
            {mensaje.texto}
          </Alerta>
        )}
      </Bloque>

      <Bloque
        titulo="Historial"
        descripcion="Cada versión publicada, con su fecha. Revertir la vuelve a publicar tal como era."
      >
        <HistorialMarca
          historial={estado.historial}
          hayPublicada={estado.publicada !== null}
          ocupado={ocupado}
          onRevertir={alRevertir}
          onVolverAEscenara={alVolverAEscenara}
        />
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde/50 bg-superficie p-5 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-texto">{titulo}</h2>
        <p className="text-texto-suave">{descripcion}</p>
      </div>
      {children}
    </section>
  );
}
