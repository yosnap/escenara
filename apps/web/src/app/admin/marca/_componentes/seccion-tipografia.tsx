"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import { LIMITE_FUENTE } from "@/lib/marca-activos";
import { pedirMarca } from "@/lib/marca-peticion";
import { type ActivoVista, LICENCIAS_FUENTE, type TipoLicenciaFuente } from "@/lib/marca-vista";
import { usaManrope } from "@/lib/tokens";

/** Familias de serie: la de Escenara, la del sistema y una con serifa. Todas sin descargar nada de terceros. */
export const RESTO_SANS = "ui-sans-serif, system-ui, sans-serif";
const SISTEMA = "system-ui, ui-sans-serif, sans-serif";
const SERIFA = "Georgia, ui-serif, serif";

export const familiaDeFuente = (familia: string) => `${familia}, ${RESTO_SANS}`;

/**
 * Tipografía: una de las familias de serie o una **fuente propia autoalojada**. Una fuente propia solo entra en WOFF2,
 * con su licencia declarada (queda apuntada con fecha y con quién la declaró) y se sirve desde esta instalación: nunca
 * se descarga nada de terceros al cargar la página.
 */
export function SeccionTipografia({
  familiaActual,
  familiaDeEscenara,
  fuentes,
  error,
  onElegir,
  onSubida,
}: {
  familiaActual: string;
  familiaDeEscenara: string;
  fuentes: ActivoVista[];
  error?: string;
  onElegir: (familia: string, fuente: ActivoVista | null) => void;
  onSubida: (fuente: ActivoVista) => void;
}) {
  const opciones = [
    { value: familiaDeEscenara, label: "Manrope (la de Escenara)" },
    { value: SISTEMA, label: "La del sistema", descripcion: "San Francisco, Segoe UI o Roboto, según el dispositivo." },
    { value: SERIFA, label: "Con serifa", descripcion: "Georgia o la serifa del sistema." },
    ...fuentes.map((f) => ({
      value: familiaDeFuente(f.familia ?? ""),
      label: `${f.familia} (propia)`,
      descripcion: f.licencia ? `Licencia: ${LICENCIAS_FUENTE[f.licencia.tipo]} · ${f.licencia.titular}` : undefined,
    })),
  ];
  const conocida = opciones.some((o) => o.value === familiaActual);
  return (
    <div className="flex flex-col gap-5" data-requisito="marca-typography.family">
      <Selector
        etiqueta="Familia de la interfaz"
        opciones={conocida ? opciones : [...opciones, { value: familiaActual, label: familiaActual }]}
        valor={familiaActual}
        onCambio={(v) => {
          if (!v) return;
          onElegir(v, fuentes.find((f) => familiaDeFuente(f.familia ?? "") === v) ?? null);
        }}
      />
      {error && (
        <Alerta tipo="error" compacta anuncio="ninguno">
          {error}
        </Alerta>
      )}
      <p className="text-lg text-texto" style={usaManrope(familiaActual) ? undefined : { fontFamily: familiaActual }}>
        Da vida a cada escena · ÁÉÍÓÚ ñ ¿? ¡! 0123456789
      </p>
      <SubirFuente onSubida={onSubida} />
    </div>
  );
}

function SubirFuente({ onSubida }: { onSubida: (fuente: ActivoVista) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [familia, setFamilia] = useState("");
  const [licencia, setLicencia] = useState<TipoLicenciaFuente | "">("");
  const [titular, setTitular] = useState("");
  const [nota, setNota] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "hecho" | "error"; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    setResultado(null);
    const datos = new FormData();
    datos.set("archivo", archivo);
    datos.set("familia", familia);
    datos.set("licencia", licencia);
    datos.set("titular", titular);
    datos.set("nota", nota);
    datos.set("acepto", acepto ? "si" : "");
    const r = await pedirMarca<{ activo: ActivoVista }>("/api/admin/marca/activos?tipo=fuente", {
      method: "POST",
      body: datos,
    });
    setSubiendo(false);
    if (!r.ok) {
      setResultado({ tipo: "error", texto: r.error });
      return;
    }
    setResultado({
      tipo: "hecho",
      texto: `«${r.datos.activo.familia}» está lista: elígela en «Familia de la interfaz».`,
    });
    onSubida(r.datos.activo);
  }

  return (
    <details className="rounded-tarjeta border border-borde/60 p-4">
      <summary className="cursor-pointer font-semibold text-texto">Subir una fuente propia (WOFF2)</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo
          etiqueta="Archivo WOFF2"
          ayuda={`Hasta ${LIMITE_FUENTE / (1024 * 1024)} MB. Si tienes TTF u OTF, conviértela antes a WOFF2.`}
        >
          {(props) => (
            <EntradaTexto
              {...props}
              type="file"
              accept=".woff2,font/woff2"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          )}
        </Campo>
        <Campo etiqueta="Nombre de la familia" ayuda="Letras, números, guiones y espacios. Ej.: Mi Fuente">
          {(props) => (
            <EntradaTexto {...props} value={familia} maxLength={40} onChange={(e) => setFamilia(e.target.value)} />
          )}
        </Campo>
        <Selector
          etiqueta="Licencia"
          opciones={Object.entries(LICENCIAS_FUENTE).map(([value, label]) => ({ value, label }))}
          valor={licencia || null}
          onCambio={(v) => setLicencia((v as TipoLicenciaFuente | null) ?? "")}
        />
        <Campo etiqueta="Titular de los derechos" ayuda="Quién publica la fuente o tu organización.">
          {(props) => (
            <EntradaTexto {...props} value={titular} maxLength={120} onChange={(e) => setTitular(e.target.value)} />
          )}
        </Campo>
        <div className="md:col-span-2">
          <Campo etiqueta="Nota (opcional)" ayuda="Dónde está la licencia, número de pedido…">
            {(props) => <AreaTexto {...props} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />}
          </Campo>
        </div>
        <div className="md:col-span-2">
          <Casilla
            etiqueta="Declaro que tengo derecho a usar esta fuente en la web de esta instalación"
            descripcion="Queda apuntado con la fecha y con tu cuenta, igual que la declaración de derechos de la música."
            marcada={acepto}
            onCambio={setAcepto}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Boton
          type="button"
          variante="secundario"
          icono={<Upload className="size-4" />}
          cargando={subiendo}
          disabled={!archivo || !familia.trim() || !licencia || !titular.trim() || !acepto}
          onClick={subir}
        >
          Subir fuente
        </Boton>
        {resultado && (
          <Alerta tipo={resultado.tipo} compacta>
            {resultado.texto}
          </Alerta>
        )}
      </div>
    </details>
  );
}
