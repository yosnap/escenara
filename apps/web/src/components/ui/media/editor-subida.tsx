"use client";

import { EditorImagen } from "./diferidos";
import type { useSubidaMedios } from "./use-subida-medios";

/** Editor opcional antes de subir: una imagen tras otra de la cola; cerrar descarta la imagen actual. */
export function EditorSubida({ subida }: { subida: ReturnType<typeof useSubidaMedios> }) {
  const actual = subida.enEditor;
  return (
    <EditorImagen
      fuente={actual && { url: actual.url, nombre: actual.archivo.name, puedeSobrescribir: false }}
      onCerrar={subida.siguienteEnEditor}
      onGuardar={async (archivo) => {
        void subida.subirUno(archivo);
        subida.siguienteEnEditor();
        return null;
      }}
      onSinEditar={() => {
        if (actual) void subida.subirUno(actual.archivo);
        subida.siguienteEnEditor();
      }}
    />
  );
}
