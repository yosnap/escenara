"use client";

import dynamic from "next/dynamic";
import { CargadorChispa } from "../chispa";
import type { DialogoSelectorMediosProps } from "./dialogo-selector-medios";
import type { EditorImagen as EditorImagenCompleto } from "./editor-imagen";

/**
 * **Lo pesado del selector de medios se carga al abrirlo**, no con la página: el editor de imagen (con la librería de
 * recorte) y el diálogo con la biblioteca completa. El selector está en casi todas las pantallas y casi nunca se
 * abre, así que con ellos dentro cada página cargaba de más.
 *
 * Mientras llega el trozo se ve el cargador de la chispa. Cerrado, no se monta nada: el diálogo se desmonta al
 * cerrarse, y al volver a abrirlo empieza como nuevo, igual que antes.
 */

const EditorImagenBajoDemanda = dynamic(() => import("./editor-imagen").then((m) => m.EditorImagen), {
  ssr: false,
  loading: () => <CargadorChispa etiqueta="Cargando el editor" />,
});

const DialogoBajoDemanda = dynamic(() => import("./dialogo-selector-medios").then((m) => m.DialogoSelectorMedios), {
  ssr: false,
  loading: () => <CargadorChispa etiqueta="Cargando tu biblioteca" />,
});

type PropsEditor = Parameters<typeof EditorImagenCompleto>[0];

/** El editor de imagen, que solo se descarga cuando hay una imagen que editar. */
export function EditorImagen(props: PropsEditor) {
  return props.fuente ? <EditorImagenBajoDemanda {...props} /> : null;
}

/** El diálogo para elegir de la biblioteca, que solo se descarga al abrirlo. */
export function DialogoSelectorMedios(props: DialogoSelectorMediosProps) {
  return props.abierto ? <DialogoBajoDemanda {...props} /> : null;
}
