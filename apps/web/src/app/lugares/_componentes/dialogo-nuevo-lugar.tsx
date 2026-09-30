"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { crearLugar } from "@/components/ui/lugares/api-lugares";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import { ESTILOS_ANIMADOS, ETIQUETA_ESTILO_ANIMADO } from "@/lib/animados";
import { DESCRIPCION_LUGAR_MAXIMA, NOMBRE_LUGAR_MAXIMO, SUGERENCIA_FAMOSO } from "@/lib/lugares";

/**
 * Alta de un lugar. Nace **sin fotos**: se eligen en su ficha, con la biblioteca delante y diciendo cuál es la
 * maestra. El acabado se elige aquí porque no se puede cambiar después: un lugar real no se usa en un proyecto
 * animado ni al revés, y cambiarlo dejaría sin sentido lo que ya se generó con él.
 */
export function DialogoNuevoLugar({
  abierto,
  onAbiertoCambio,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onCreado: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estilo, setEstilo] = useState("realista");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true);
    setError("");
    const resultado = await crearLugar({ nombre, descripcion, estilo });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onCreado(resultado.datos.id);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      titulo="Nuevo lugar"
      descripcion="Dale un nombre y descríbelo en una frase. Las fotos se añaden después, en su ficha."
      pie={
        <>
          <Boton variante="secundario" onClick={() => onAbiertoCambio(false)} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton variante="chispa" onClick={crear} disabled={guardando || nombre.trim() === ""}>
            {guardando ? "Creando…" : "Crear lugar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Aviso tono="info">{SUGERENCIA_FAMOSO}</Aviso>
        <Campo etiqueta="Nombre">
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_LUGAR_MAXIMO}
              disabled={guardando}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Bar de la esquina"
            />
          )}
        </Campo>
        <Campo
          etiqueta="Descripción corta (en español)"
          ayuda="Lo que lo hace reconocible: materiales, colores, muebles, la luz. Se usa si la foto no cabe."
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={DESCRIPCION_LUGAR_MAXIMA}
              disabled={guardando}
              className="min-h-20"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          )}
        </Campo>
        <Selector
          etiqueta="Acabado"
          valor={estilo}
          deshabilitado={guardando}
          opciones={[
            { value: "realista", label: "Real (fotos)", descripcion: "Para proyectos realistas, con fotos del sitio." },
            ...ESTILOS_ANIMADOS.map((clave) => ({
              value: clave,
              label: `Animado · ${ETIQUETA_ESTILO_ANIMADO[clave]}`,
              descripcion: "Para proyectos animados del mismo estilo, con una ilustración del sitio.",
            })),
          ]}
          onCambio={(v) => v && setEstilo(v)}
        />
        {error !== "" && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
