/**
 * Arranque del servidor (convención `instrumentation.ts` de Next: `register()` se ejecuta una sola vez por
 * instancia, antes de atender peticiones, y **no** durante `next build`).
 *
 * Aquí se pone en marcha el seguimiento de los trabajos de generación, para que un trabajo termine y se
 * guarde en la biblioteca aunque nadie tenga la página abierta. El import es dinámico y solo en el runtime
 * de Node: en el runtime edge no hay base de datos ni temporizadores largos.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Durante la compilación de producción también se llega aquí en algunas fases: no hay nada que sondear.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // En los tests el bucle no aporta nada y ensuciaría la base de datos de prueba.
  if (process.env.NODE_ENV === "test") return;
  const { arrancarSeguimiento } = await import("./server/generacion/seguimiento-de-fondo");
  arrancarSeguimiento();
}
