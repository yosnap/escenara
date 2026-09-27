import { CAPACIDAD_DE_TIPO, type ModeloVista } from "@/lib/catalogo";
import type { TipoTrabajo } from "@/lib/generacion";
import {
  type CatalogoParaCrear,
  type PresetVisible,
  recortarPlantillaVisible,
  recortarPresetVisible,
} from "@/lib/presets";
import { resolver } from "../proveedores/registro";
import { limitesDelModelo, motivoDelPreset } from "./compatibilidad";
import { listarPlantillas, listarPresets } from "./consulta";

/**
 * Lo que «Crear» necesita para pintar la botonera: los presets y las plantillas que este usuario puede usar,
 * más **qué no admite el modelo elegido y por qué**. Es una lectura: no encola nada, no reserva presupuesto y
 * no toca a ningún proveedor.
 *
 * Los motivos se calculan con la **misma** función que usa el servidor antes de encolar, así que la botonera no
 * puede ofrecer una combinación que luego se rechace, ni prometer un formato que no se pueda generar.
 *
 * Lo que sale de aquí **no lleva ni el fragmento de prompt de cada preset ni el texto de la plantilla**
 * (ADR-0022): el prompt compuesto es material del servidor y del panel de administración, no del navegador.
 */

/** Catálogo para un tipo de trabajo con el modelo indicado (sin modelo, el predeterminado de la capacidad). */
export async function catalogoParaCrear(
  usuarioId: string,
  tipo: TipoTrabajo,
  modeloPedido?: string | null,
): Promise<CatalogoParaCrear> {
  const capacidad = CAPACIDAD_DE_TIPO[tipo];
  const { modelo } = await resolver(capacidad, modeloPedido ?? null);
  const [todos, plantillas] = await Promise.all([listarPresets({ usuarioId }), listarPlantillas({ usuarioId })]);
  const activos = todos.filter((p) => p.activo).map(recortarPresetVisible);
  return {
    presets: activos,
    incompatibles: motivosPorPreset(activos, modelo),
    plantillas: plantillas.filter((p) => p.activa && p.capacidad === capacidad).map(recortarPlantillaVisible),
    modelo: modelo.modelo,
    limites: limitesDelModelo(modelo),
  };
}

function motivosPorPreset(presets: PresetVisible[], modelo: ModeloVista): Record<string, string> {
  const motivos: Record<string, string> = {};
  for (const preset of presets) {
    const motivo = motivoDelPreset(
      {
        ...(preset.proporcion === null ? {} : { proporcion: preset.proporcion }),
        ...(preset.segundos === null ? {} : { segundos: preset.segundos }),
      },
      modelo,
    );
    if (motivo) motivos[preset.id] = motivo;
  }
  return motivos;
}
