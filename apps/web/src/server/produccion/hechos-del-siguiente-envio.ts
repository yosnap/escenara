import { CAPACIDAD_DE_TIPO } from "@/lib/catalogo";
import type { HechosLugar, HechosProducto } from "../controles/contrato";
import type { FilaEscena, FilaProyecto, FilaTrabajo } from "../db/esquema";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { hechosDelClipConLugar, lugarDelEnvio } from "../lugares/en-el-envio";
import { personajePorId } from "../personajes/contexto";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { productoParaGenerar } from "../productos/prompt";
import { type EnvioConProducto, hojaEnElEnvio, repartoCompletoDelEnvio } from "../productos/reparto-del-envio";
import { faltaInsertarLaCaptura } from "./paso-digital";

/**
 * **Los hechos del lugar y del producto en la pantalla de producción**, calculados con la misma función que el envío
 * (`repartoCompletoDelEnvio`) y con las mismas entradas que tendrá el **siguiente** envío de la escena:
 *
 * - su fotograma (el protagonista con sus fotos, o la maestra como imagen de partida en el plano del lugar solo);
 * - la inserción de la captura, si lo que toca es el segundo paso del producto digital;
 * - su clip, si el fotograma ya está hecho;
 * - la escena hablada, en un proyecto en modo Omni (el lugar va descrito).
 *
 * Así los avisos que se confirman («sin foto maestra», «la maestra no cabe») salen en la tarjeta con su casilla, y los
 * que bloquean (sin declaración, acabado distinto) se ven antes de pulsar. Lo mismo con el producto del fotograma
 * («las referencias no caben», «no admite la foto»): la maestra ocupa un hueco del mismo cupo, así que los dos avisos
 * salen juntos o ninguno. El producto del clip lo evalúa aparte `controlesProductoClip`; el de la escena hablada
 * depende de la identidad registrada y del modelo de Omni, y lo sigue diciendo su envío. En la escena hablada el lugar
 * va descrito y no compite por el cupo, así que sus hechos no dependen del modelo. El canto no usa ni el lugar
 * ni el producto de la escena: no se evalúa.
 */
export async function hechosDelSiguienteEnvio(entrada: {
  usuarioId: string;
  escena: FilaEscena;
  proyecto: FilaProyecto;
  elecciones: { fotograma: EleccionDeTrabajo | null; animacion: EleccionDeTrabajo | null };
  /** El último fotograma de la escena, si hay alguno. */
  fotograma: FilaTrabajo | null;
}): Promise<{ lugar?: HechosLugar; producto?: HechosProducto }> {
  const { usuarioId, escena, proyecto, elecciones, fotograma } = entrada;
  if (escena.clipFormat === "cantar") return {};
  const conLugar = await lugarDelEnvio(usuarioId, escena, null, null);
  if (!conLugar && escena.productId === null) return {};
  const soloLugar = escena.placeShot === "solo_lugar";
  const omni = proyecto.voiceMode === "omni" && !soloLugar;
  const fotogramaHecho = fotograma?.state === "listo" && fotograma.resultMediaId !== null;
  const insercion = !omni && fotogramaHecho && fotograma !== null && (await faltaInsertarLaCaptura(escena, fotograma));
  const clip = !omni && fotogramaHecho && !insercion;
  const protagonista = proyecto.mainCharacterId ? await personajePorId(proyecto.mainCharacterId) : null;
  const eleccion = clip || omni ? elecciones.animacion : elecciones.fotograma;
  if (!eleccion) return hechosDelClipConLugar(conLugar);
  const envio: EnvioConProducto = omni
    ? {
        tipo: "escena-omni",
        personaje: protagonista,
        conHoja: protagonista !== null && hojaEnElEnvio(protagonista, escena.id),
      }
    : clip
      ? { tipo: "clip" }
      : {
          tipo: "fotograma",
          // Con el protagonista se genera el fotograma normal; el plano solo y la inserción parten de una imagen.
          personaje: soloLugar || insercion ? null : protagonista,
          sinReferencia: false,
          conHoja: !soloLugar && !insercion && protagonista !== null && hojaEnElEnvio(protagonista, escena.id),
        };
  // El producto como lo resuelve el envío: en el fotograma, con su paso digital; en el clip y en Omni, sin él.
  const producto = await productoParaGenerar(
    usuarioId,
    escena.productId,
    escena.productAction,
    envio.tipo === "fotograma" ? { ...(insercion ? { pasoSolicitado: "insertar_captura" as const } : {}) } : undefined,
    { ids: escena.productPhotoIds, estricta: false },
  );
  const { conProducto, hechosLugar } = await repartoCompletoDelEnvio({
    envio,
    adaptador: eleccion.adaptador,
    modelo: eleccion.modelo,
    producto,
    conLugar,
  });
  if (envio.tipo !== "fotograma" || !conProducto) return hechosLugar;
  const hechosProducto = await completarModelosSugeridos(conProducto.hechos, CAPACIDAD_DE_TIPO.fotograma);
  return { ...hechosLugar, producto: hechosProducto };
}
