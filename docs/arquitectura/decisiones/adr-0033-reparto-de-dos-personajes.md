# ADR-0033 · Un reparto de dos personajes se produce en uno o dos clips

- **Estado**: aceptada
- **Fecha**: 2026-09-29
- **Versión**: 0.28.0
- **Relacionadas**: ADR-0017 (consentimiento), ADR-0022 (el prompt es material del servidor), ADR-0028 (escenas habladas), ADR-0030 (coherencia)

## Contexto

Una escena hablada admitía un personaje. Para que dos conversen hacen falta dos formas distintas de producción: un plano de ambos o dos planos individuales que después se alternarán. El proveedor admite dos identidades registradas en una llamada, pero el spike debía medir precio, caras y turnos antes de decidir. También hay dos obligaciones de producto: no enviar la imagen de una persona real sin su consentimiento propio y no confirmar un importe de un solo clip cuando se pedirán dos.

El spike del 29/09/2026 gastó **189 créditos** en tres clips de 4 s. Cada clip costó **63**, con uno o con dos `character_ids`. Las caras salieron separadas y el diálogo se repartió; la mirada cruzada funcionó. La persona real salió algo rejuvenecida; el set del podcast y el lado no fueron siempre fieles. La medida se recoge en [APIs y proveedores](../../recursos/apis-y-proveedores.md#omni-con-dos-personajes-medido-2026-09-29).

## Opciones

### A. Dos personajes siempre en un clip

El mismo plano simplifica coste, confirmación y montaje. Falla cuando se buscan planos alternos de una conversación: no hay un clip individual por cara y la mirada cruzada no se puede montar después.

### B. Dos personajes siempre en clips individuales

Cada identidad va por separado y el resultado se puede alternar. Falla cuando la escena pide que se escuchen y reaccionen **en el mismo plano**; además siempre cuesta dos clips aunque el proveedor no cobre más por dos identidades en uno.

### C. Formato por escena: solo, podcast o dualcast

El formato determina uno o dos envíos y se guarda en la escena, junto al reparto y sus turnos. El coste y la confirmación se calculan a partir de los envíos reales. Exige más interfaz y una lectura explícita del orden y personaje de cada clip.

## Decisión

**Opción C.** `solo` es el valor por defecto y conserva el camino anterior. `podcast` produce dos clips, cada uno con un `character_id`, su mirada y solo sus turnos. `dualcast` produce uno con los dos `character_ids` y todos los turnos. El límite del producto es dos personajes aunque el proveedor admita más.

El diálogo se guarda por turnos con personaje, texto **literal** y dirección vocal: el texto hablado no se traduce. El prompt se compone en el servidor; el usuario ve una descripción en castellano de lo pedido. Los dos formatos se pueden apagar en Admin › Ajustes sin borrar escenas montadas.

La puerta de consentimiento comprueba **cada persona real** del reparto y nombra a quien falta. La declaración de un personaje inventado se comprueba por su lado. **Provisionalmente basta el consentimiento individual de la 0.13.0 por persona**; el alcance legal específico de una conversación conjunta queda para revisión.

La estimación cuenta un clip en dualcast y dos en podcast, incorpora la traducción una sola vez y muestra la fecha de la tarifa. El usuario confirma **el total y el sello de esa estimación en una sola acción**; cada clip mantiene su reserva y cierre independientes. Los avisos de misma voz, falta de turnos y diálogo demasiado largo exigen confirmación expresa. Cada trabajo de podcast conserva su orden y personaje para el montaje de la 0.32.0. Jev comprueba cada cara con su referencia y registra `reparto_fiel` en sombra.

## Consecuencias

**Se gana** una conversación en un plano o en dos, con el coste real visible antes de gastar y un consentimiento verificable por persona. Las escenas existentes siguen como `solo`. Cancelar un clip de podcast no cobra el otro.

**Se pierde** la garantía visual de un mismo set entre clips: el proveedor no la dio en la prueba. Tampoco garantizó el lado ni la edad aparente exacta de la persona real. Los dos personajes se registran hoy con la misma voz Omni del proyecto; se advierte antes de cobrar, porque aún no se pueden usar dos voces Omni distintas en una escena. La pantalla deja ver cada clip y el veredicto por cara; no promete fidelidad que no se haya medido.

**Habrá que revisar** el alcance del texto legal al aparecer dos personas juntas, los límites medidos con más modelos y duraciones, y el montaje automático de los dos planos en la 0.32.0. Pasar `reparto_fiel` de sombra a activo exige medir su fiabilidad con correcciones reales.
