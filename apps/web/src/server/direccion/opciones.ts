import type { NivelCamara, OpcionDireccion, OpcionesDeDireccion } from "@/lib/direccion";
import type { CategoriaPreset } from "@/lib/presets";
import { listarPresets } from "../prompts/consulta";

/**
 * Lo que la pantalla de dirección necesita para pintar sus botones: **solo lo que el usuario puede leer**.
 *
 * De cada opción salen su clave, su nombre y su descripción en castellano, y en la cámara su nivel, que es un
 * aviso. **Nunca sale el fragmento en inglés** (ADR-0022): el prompt es material del servidor, y sus piezas
 * también. Es la misma regla que aplica `recortarPresetVisible` en «Crear».
 *
 * Es una lectura: no encola nada, no reserva nada y no habla con ningún proveedor.
 */

/** Categorías que el usuario elige. `anclajes` no está: no es suya, la compone quien administra. */
const CATEGORIAS: readonly CategoriaPreset[] = [
  "plano",
  "angulo",
  "optica",
  "luz",
  "localizacion",
  "camara",
  "microaccion",
];

export async function opcionesDeDireccion(usuarioId: string): Promise<OpcionesDeDireccion> {
  const vacio = (): OpcionDireccion[] => [];
  const opciones: OpcionesDeDireccion = {
    plano: vacio(),
    angulo: vacio(),
    optica: vacio(),
    luz: vacio(),
    localizacion: vacio(),
    camara: vacio(),
    microaccion: vacio(),
  };
  for (const preset of await listarPresets({ usuarioId })) {
    if (!preset.activo) continue;
    if (!CATEGORIAS.includes(preset.categoria)) continue;
    const lista = opciones[preset.categoria as keyof OpcionesDeDireccion];
    if (!lista) continue;
    lista.push({
      clave: preset.clave,
      nombre: preset.nombre,
      descripcion: preset.descripcion,
      // El nivel solo existe en la cámara y el momento solo en el gesto; los demás no los llevan.
      ...(preset.valores.nivel ? { nivel: preset.valores.nivel as NivelCamara } : {}),
      ...(preset.valores.momento ? { momento: preset.valores.momento } : {}),
    });
  }
  return opciones;
}
