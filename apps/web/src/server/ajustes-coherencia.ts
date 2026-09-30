import type { Comprobacion, ModoCoherencia } from "@/lib/coherencia";
import type { Ajustes } from "./ajustes";

/** Modo y umbral configurados para una comprobación de coherencia. Es el único sitio que los empareja. */
export function coherenciaDe(ajustes: Ajustes, comprobacion: Comprobacion): { modo: ModoCoherencia; umbral: number } {
  const modos: Record<Comprobacion, ModoCoherencia> = {
    identidad: ajustes.coherenciaIdentidad,
    guion: ajustes.coherenciaGuion,
    resultado: ajustes.coherenciaResultado,
    emocion: ajustes.coherenciaEmocion,
    direccion_fiel: ajustes.coherenciaDireccionFiel,
    producto_fiel: ajustes.coherenciaProductoFiel,
    angulo_fiel: ajustes.coherenciaAnguloFiel,
    reparto_fiel: ajustes.coherenciaRepartoFiel,
    lugar_fiel: ajustes.coherenciaLugarFiel,
  };
  const umbrales: Record<Comprobacion, number> = {
    identidad: ajustes.coherenciaUmbralIdentidad,
    guion: ajustes.coherenciaUmbralGuion,
    resultado: ajustes.coherenciaUmbralResultado,
    emocion: ajustes.coherenciaUmbralEmocion,
    direccion_fiel: ajustes.coherenciaUmbralDireccionFiel,
    producto_fiel: ajustes.coherenciaUmbralProductoFiel,
    angulo_fiel: ajustes.coherenciaUmbralAnguloFiel,
    reparto_fiel: ajustes.coherenciaUmbralRepartoFiel,
    lugar_fiel: ajustes.coherenciaUmbralLugarFiel,
  };
  return { modo: modos[comprobacion], umbral: umbrales[comprobacion] };
}
