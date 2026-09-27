/**
 * Arranque del servidor (convención `instrumentation.ts` de Next: `register()` se ejecuta una sola vez por
 * instancia, antes de atender peticiones, y **no** durante `next build`).
 *
 * Desde 0.12.0 aquí no se arranca ningún bucle: los trabajos de generación los atiende el worker de la cola,
 * que es un proceso aparte (`bun run worker`, ADR-0003). Tener el sondeo también dentro del servidor web
 * significaría dos mecanismos consultando lo mismo, y con varias instancias del servidor, tantos como
 * instancias.
 *
 * Se deja el gancho porque Next lo espera y porque es donde iría cualquier comprobación de arranque futura.
 */
export async function register(): Promise<void> {
  return;
}
