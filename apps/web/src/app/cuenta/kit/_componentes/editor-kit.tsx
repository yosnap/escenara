"use client";

import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alerta, type TipoAlerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { GrupoOpciones, Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { PreviaKit } from "@/components/ui/previa-kit";
import { LADO_MAXIMO_LOGO, LIMITE_LOGO_RASTER } from "@/lib/marca-activos";
import { ESQUINAS_KIT, type EsquinaKit, LARGO_NOMBRE_KIT, NOMBRE_ESQUINA } from "@/lib/marca-kit";
import { enJson, pedirMarca } from "@/lib/marca-peticion";
import type { KitVista } from "@/lib/marca-vista";
import {
  ETIQUETA_POSICION,
  MOTIVO_ETIQUETA_OBLIGATORIA,
  POSICIONES_ETIQUETA,
  type PosicionEtiqueta,
} from "@/lib/montaje";

/**
 * **Tu kit de marca**: tu logotipo en una esquina de tus exportaciones. Es tuyo: no cambia la marca de la instalación
 * ni la ve nadie más. Se previsualiza sobre un fotograma real con la etiqueta de contenido generado con IA, que el kit
 * no puede tapar ni quitar.
 */
export function EditorKit({ kitInicial, fotograma }: { kitInicial: KitVista; fotograma: string }) {
  const [kit, setKit] = useState(kitInicial);
  const [nombre, setNombre] = useState(kitInicial.nombre);
  const [esquina, setEsquina] = useState<EsquinaKit>(kitInicial.esquina);
  const [activo, setActivo] = useState(kitInicial.activo);
  const [etiqueta, setEtiqueta] = useState<PosicionEtiqueta>("abajo");
  const [mensaje, setMensaje] = useState<{ tipo: TipoAlerta; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setMensaje(null);
    try {
      await accion();
    } finally {
      setOcupado(false);
    }
  }

  const subir = (archivo: File | undefined) =>
    archivo &&
    ejecutar(async () => {
      const datos = new FormData();
      datos.set("archivo", archivo);
      const r = await pedirMarca<{ kit: KitVista }>("/api/cuenta/kit/logotipo", { method: "POST", body: datos });
      if (!r.ok) return setMensaje({ tipo: "error", texto: r.error });
      setKit(r.datos.kit);
      setMensaje({ tipo: "hecho", texto: "Logotipo subido. Saldrá en tus próximas exportaciones." });
    });

  const quitar = () =>
    ejecutar(async () => {
      const r = await pedirMarca<{ kit: KitVista }>("/api/cuenta/kit/logotipo", enJson("DELETE"));
      if (!r.ok) return setMensaje({ tipo: "error", texto: r.error });
      setKit(r.datos.kit);
      setMensaje({ tipo: "hecho", texto: "Logotipo quitado. Tus exportaciones nuevas saldrán sin él." });
    });

  const guardar = () =>
    ejecutar(async () => {
      const r = await pedirMarca<{ kit: KitVista }>("/api/cuenta/kit", enJson("PUT", { nombre, esquina, activo }));
      if (!r.ok) return setMensaje({ tipo: "error", texto: r.error });
      setKit(r.datos.kit);
      setMensaje({ tipo: "hecho", texto: "Kit guardado. Se aplica a las exportaciones que pidas a partir de ahora." });
    });

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-5">
        <Campo etiqueta="Nombre del kit" ayuda="Solo para ti, para reconocerlo.">
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={LARGO_NOMBRE_KIT}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
        <div className="flex flex-col gap-2">
          <Campo
            etiqueta="Logotipo"
            ayuda={`PNG, JPEG, WebP o SVG, hasta ${LIMITE_LOGO_RASTER / (1024 * 1024)} MB y ${LADO_MAXIMO_LOGO} px por lado. Mejor con fondo transparente. Se guarda en PNG.`}
          >
            {(props) => (
              <EntradaTexto
                {...props}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                disabled={ocupado}
                onChange={(e) => void subir(e.target.files?.[0])}
              />
            )}
          </Campo>
          {kit.logo && (
            <div>
              <Boton
                type="button"
                variante="fantasma"
                tamano="sm"
                icono={<Trash2 className="size-4" />}
                disabled={ocupado}
                onClick={quitar}
              >
                Quitar el logotipo
              </Boton>
            </div>
          )}
        </div>
        <GrupoOpciones
          etiqueta="Esquina del logotipo"
          opciones={ESQUINAS_KIT.map((e) => ({ value: e, etiqueta: NOMBRE_ESQUINA[e] }))}
          valor={esquina}
          onCambio={(v) => setEsquina(v as EsquinaKit)}
        />
        <Interruptor
          etiqueta="Aplicar a mis exportaciones"
          descripcion="Apagado, el kit se conserva y tus vídeos salen sin logotipo."
          activo={activo}
          onCambio={setActivo}
        />
        <Alerta tipo="info" anuncio="ninguno" titulo="La etiqueta de contenido generado con IA va siempre">
          {MOTIVO_ETIQUETA_OBLIGATORIA} Tu logotipo nunca la tapa: si eliges una esquina de su franja, pasa a la
          contraria.
        </Alerta>
        <div>
          <Boton type="button" icono={<Save className="size-4" />} cargando={ocupado} onClick={guardar}>
            Guardar kit
          </Boton>
        </div>
        {mensaje && (
          <Alerta tipo={mensaje.tipo} compacta>
            {mensaje.texto}
          </Alerta>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <PreviaKit fotograma={fotograma} logo={kit.logo?.url ?? null} esquina={esquina} etiqueta={etiqueta} />
        <GrupoOpciones
          etiqueta="Ver con la etiqueta"
          opciones={POSICIONES_ETIQUETA.map((p) => ({ value: p, etiqueta: ETIQUETA_POSICION[p] }))}
          valor={etiqueta}
          onCambio={(v) => setEtiqueta(v as PosicionEtiqueta)}
        />
      </div>
    </div>
  );
}
