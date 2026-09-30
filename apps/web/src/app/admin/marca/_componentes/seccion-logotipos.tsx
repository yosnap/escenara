"use client";

import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { CONVERTIR_LOGOTIPO, LADO_MAXIMO_LOGO, LIMITE_LOGO_RASTER } from "@/lib/marca-activos";
import type { DocumentoMarca } from "@/lib/marca-esquema";
import { pedirMarca } from "@/lib/marca-peticion";
import { estiloDeTema } from "@/lib/marca-previa";
import { type ActivoVista, NOMBRE_ROL_LOGO, ROLES_LOGO, type RolLogo } from "@/lib/marca-vista";

const AYUDA = `PNG, JPEG o WebP, hasta ${LIMITE_LOGO_RASTER / (1024 * 1024)} MB y ${LADO_MAXIMO_LOGO} px por lado. Esta versión no admite SVG: ${CONVERTIR_LOGOTIPO.charAt(0).toLowerCase()}${CONVERTIR_LOGOTIPO.slice(1)}`;

/**
 * Logotipos de la instalación: horizontal y símbolo, para cada tema. Si solo subes el del tema claro, se usa en los
 * dos. Con símbolo (o, si no, con el horizontal) se generan al publicar el favicon, los iconos y la imagen social.
 */
export function SeccionLogotipos({
  documento,
  logos,
  catalogo,
  onCambio,
}: {
  /** Última marca válida: cada logotipo se enseña sobre el fondo de su tema. */
  documento: DocumentoMarca;
  logos: Partial<Record<RolLogo, string>>;
  catalogo: Record<string, ActivoVista>;
  onCambio: (rol: RolLogo, activo: ActivoVista | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ROLES_LOGO.map((rol) => (
        <TarjetaLogo
          key={rol}
          rol={rol}
          documento={documento}
          activo={logos[rol] ? catalogo[logos[rol] as string] : undefined}
          onCambio={onCambio}
        />
      ))}
    </div>
  );
}

function TarjetaLogo({
  rol,
  documento,
  activo,
  onCambio,
}: {
  rol: RolLogo;
  documento: DocumentoMarca;
  activo: ActivoVista | undefined;
  onCambio: (rol: RolLogo, activo: ActivoVista | null) => void;
}) {
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const oscuro = rol.endsWith("oscuro");

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    const datos = new FormData();
    datos.set("archivo", archivo);
    const r = await pedirMarca<{ activo: ActivoVista }>("/api/admin/marca/activos?tipo=logotipo", {
      method: "POST",
      body: datos,
    });
    setSubiendo(false);
    if (r.ok) onCambio(rol, r.datos.activo);
    else setError(r.error);
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-tarjeta border border-borde/60 p-4"
      data-requisito={`marca-logos.${rol}`}
    >
      <p className="font-semibold text-texto">{NOMBRE_ROL_LOGO[rol]}</p>
      <div
        style={estiloDeTema(documento, oscuro ? "dark" : "light")}
        className="flex h-24 items-center justify-center rounded-control border border-borde/40 bg-fondo p-3"
      >
        {activo ? (
          // biome-ignore lint/performance/noImgElement: vista previa de un archivo de marca servido por nuestra ruta
          <img src={activo.url} alt={NOMBRE_ROL_LOGO[rol]} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-texto-suave">Sin subir: se usa el de Escenara</span>
        )}
      </div>
      <Campo etiqueta="Subir archivo" ayuda={AYUDA}>
        {(props) => (
          <EntradaTexto
            {...props}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={subiendo}
            onChange={(e) => void subir(e.target.files?.[0])}
          />
        )}
      </Campo>
      {activo && (
        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => onCambio(rol, null)}>
          Quitar de esta versión
        </Boton>
      )}
      {error && (
        <Alerta tipo="error" titulo="No se ha subido" compacta>
          {error}
        </Alerta>
      )}
    </div>
  );
}
