# ADR-0014 · Seguimiento de los trabajos de generación por sondeo

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.10.0

## Contexto

Las tareas de KIE.ai son asíncronas: `createTask` devuelve un `taskId` y el resultado llega minutos después. KIE ofrece dos formas de saber cuándo termina: consultar `recordInfo` (sondeo) o recibir una llamada de vuelta (`callBackUrl`).

Escenara se instala en el equipo de cada persona. Una instalación local no tiene URL pública, y un callback obliga además a exponer un endpoint de escritura y a validar su autenticidad: cualquiera que conociera la ruta podría marcar un trabajo como listo o apuntarle un gasto. En la 0.10.0 tampoco hay cola persistente ni workers (llegan en 0.12.0), así que no hay dónde apoyar el trabajo de fondo que un callback daría por hecho.

El riesgo que hay que evitar es otro: **no cobrar dos veces**. Si no se sabe cómo ha ido una tarea, reenviarla es lo único inaceptable.

## Opciones

1. **Sondeo desde el servidor.** El navegador pregunta por el estado y el servidor consulta `recordInfo` con el `taskId` guardado, con un mínimo entre consultas por trabajo. Supone que el proveedor aguanta que se le pregunte; falla primero si el sondeo se vuelve tan frecuente que el proveedor lo limita.
2. **Callback del proveedor.** KIE avisa al terminar. Supone que la instalación es accesible desde internet y que el endpoint puede autenticarse; falla primero en cualquier instalación local o detrás de NAT, que es el caso normal ahora mismo.
3. **Sondeo desde el navegador directamente al proveedor.** Supone que la clave puede estar en el navegador; falla de entrada: la clave BYOK no sale del servidor (ADR-0005).

## Decisión

Se elige el **sondeo desde el servidor** (opción 1). El estado vive en `generation_jobs`, de forma que cerrar el navegador no pierde nada: al volver al historial se consulta y se reconcilia.

Reglas que acompañan a la decisión:

- el navegador pregunta con intervalo creciente (4 s → 15 s) y el servidor guarda un mínimo entre consultas por trabajo, así que preguntar de más no se traduce en más peticiones al proveedor;
- dos consultas simultáneas del mismo trabajo comparten la misma operación y el trabajo solo se cierra si aún no tenía archivo: el resultado no se descarga ni se guarda dos veces (idempotencia por tarea);
- si el proveedor no contesta, el trabajo queda `desconocido` y **nunca** se reenvía: solo se vuelve a consultar el `taskId` guardado, y esa decisión es del usuario;
- un estado que el proveedor informe y no esté documentado se traduce a `desconocido`, jamás a «listo».

## Consecuencias

Se gana una implementación que funciona en cualquier instalación, sin exponer nada a internet y sin ningún endpoint que alguien pueda usar para falsear un resultado o un gasto. Se pierde inmediatez (hasta 15 s de retraso en ver el cambio) y se gasta alguna petición de consulta de más, que no cuesta créditos.

En **0.12.0**, con la cola persistente y los workers, el sondeo pasará del navegador al worker y se añadirá el callback como camino rápido para instalaciones con URL pública, **sin cambiar la interfaz**: el estado seguirá viniendo de `generation_jobs` y el callback solo adelantará la consulta que el worker haría igualmente. El reparto de consultas dejará entonces de ser por proceso (hoy dos instancias del servidor podrían consultar el mismo trabajo a la vez; la idempotencia por tarea evita que eso duplique archivos).
