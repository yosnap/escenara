import { pasadaDeBorradosDeCuenta } from "./borrado-cuenta-worker";
import { borrarObjetosApuntados } from "./borrado-de-objetos";
import { barrerExportacionesCaducadas, empaquetar, tomarExportacionProyecto } from "./exportacion-proyecto";

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Trabajo de «Tus datos» en cada pasada del worker: como mucho un paquete de exportación, el barrido de los paquetes
 * caducados, el de los objetos pendientes de borrar y como mucho un borrado de cuenta. No cuesta créditos ni llama a ningún proveedor, y nunca interrumpe la
 * pasada: cada parte registra su fallo y la siguiente pasada lo reintenta.
 */
export async function pasadaDeDatos(workerId: string): Promise<{ paquetes: number; caducados: number }> {
  let paquetes = 0;
  try {
    const exportacion = await tomarExportacionProyecto(workerId);
    if (exportacion && (await empaquetar(exportacion, workerId))) paquetes++;
  } catch (error) {
    console.error(`[datos] pasada de exportaciones: ${detalle(error)}`);
  }
  const caducados = await barrerExportacionesCaducadas().catch((error) => {
    console.error(`[datos] barrido de paquetes caducados: ${detalle(error)}`);
    return 0;
  });
  // Objetos de proyectos y cuentas borrados que el almacenamiento no dejó borrar a la primera: con su retroceso.
  await borrarObjetosApuntados().catch((error) =>
    console.error(`[datos] barrido de objetos por borrar: ${detalle(error)}`),
  );
  await pasadaDeBorradosDeCuenta(workerId).catch((error) =>
    console.error(`[datos] pasada de borrados de cuenta: ${detalle(error)}`),
  );
  return { paquetes, caducados };
}
