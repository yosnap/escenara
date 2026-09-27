# ADR-0020 · Modelo de texto: KIE con la clave del usuario, apagado de fábrica, tratado como texto no confiable y también traductor de los prompts

- **Estado:** propuesto. La elección de proveedor y el trato del texto son **decisión firme** del propietario (2026-09-27); lo que queda pendiente de confirmar es el precio sembrado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.17.0

## Contexto

El asistente de guion (RF05) necesita un modelo de texto. Hasta aquí Escenara solo hablaba con modelos de
imagen y vídeo, todos de KIE, todos por el mismo endpoint asíncrono (`jobs/createTask` + `jobs/recordInfo`) y
todos con el mismo camino de dinero (ADR-0016). El brainstorm (§3.6) proponía Gemini con la clave de Google del
usuario, pero ADR-0009 aplazó Google: sin facturación activa su cuota es 0, y el hueco quedó listo sin
adaptador.

Tres restricciones que no se pueden dejar implícitas:

- **el texto cuesta dinero.** Menos que un clip, pero cuesta, y en la cuenta del propio usuario. Todo lo que
  cuesta en Escenara pasa por estimación, confirmación explícita, idempotencia, reserva, tope y conciliación; no
  hay ninguna razón para que esta llamada sea la excepción, y sí una muy buena para que no lo sea (un asistente
  que se pueda pulsar veinte veces sin que nadie apunte el gasto es la forma más rápida de vaciar un saldo);
- **lo que devuelve un modelo de texto no es de fiar.** Es la primera vez que entra en Escenara texto generado
  por un modelo que **acabará dentro de otro prompt**. Si se tratara como instrucciones, el proveedor de texto
  se convertiría en un canal de inyección hacia el proveedor de imagen, pagado por el usuario;
- **el catálogo reserva `compatible` para lo que se ha ejecutado de verdad** (ADR-0015). Un modelo que nadie ha
  llamado nunca es `descubierto` y no se puede elegir. Esa regla existe justo para no estimar a ciegas.

## Opciones

1. **Reactivar Google solo para texto**, con su propia credencial. Supone que el usuario está dispuesto a dar de
   alta una segunda clave y que Google tendrá cuota. Falla en lo primero que importa: ADR-0009 aplazó Google por
   una razón que no ha cambiado, y obligar a una segunda credencial para una función opcional es el peor
   intercambio posible.
2. **Un modelo de texto de KIE con la clave que el usuario ya tiene.** Supone que KIE ofrece modelos de chat
   utilizables por API. Comprobado en su documentación el 2026-09-27 (sin llamar a la API con ninguna clave):
   sí, en «Market → Chat». Falla si KIE retirara esa familia de modelos, y ahí el asistente se queda sin modelo
   disponible… que es exactamente el estado por defecto de esta versión, así que el daño es nulo.
3. **Escribir el guion solo a mano, sin asistente.** Supone que nadie lo echará de menos. No falla en nada
   técnico: es el camino que esta versión deja funcionando de fábrica. Falla como producto, porque RF05 pide el
   asistente, no lo prohíbe.

## Decisión

Se elige la **opción 2**, con la **opción 3 como estado por defecto**. Reglas:

- **KIE como proveedor de texto, con la misma credencial de KIE del usuario** que ya guarda la bóveda desde la
  0.9.0. No se reactiva Google: ADR-0009 sigue en pie y no hace falta una segunda clave.
- **El adaptador gana `text_generation` y un método `generarTexto` opcional en el contrato.** Opcional a
  propósito: un proveedor sin modelos de texto sigue siendo un adaptador válido (ADR-0015) y con él el asistente
  simplemente no está disponible.
- **El endpoint es síncrono y distinto del resto** (`POST /codex/v1/responses`, con la forma de la API de
  respuestas de OpenAI y sin el sobre `{ code, msg, data }` de KIE), así que **no pasa por la cola**: la cola
  existe para tareas que tardan minutos y se sondean. Sí recorre el camino de dinero completo, en este orden:
  estimación con el precio registrado → confirmación explícita de los créditos → clave de idempotencia firmada
  por el navegador → reserva en `usage_ledger` → tope por llamada y presupuesto autorizado → límite de ritmo →
  llamada → **consumo con los créditos que informa el proveedor** (`credits_consumed`) y liberación de la
  reserva.
- **La idempotencia vive en su propia tabla**, `assistant_runs`, con índice único por (usuario, clave), y los
  apuntes del registro de gasto la citan en `assistant_run_id` con su propio índice único por tipo de apunte. Sin
  eso, «una reserva, un consumo y una liberación por llamada» no se podría garantizar: el índice existente está
  montado sobre `job_id`, y una llamada de texto no crea ningún trabajo.
- **El modelo se siembra `descubierto` y el asistente llega apagado** (`asistenteActivo = false`). Encenderlo es
  una decisión de quien administra, y exige antes lo que exige cualquier modelo nuevo: ejecutarlo una vez y
  marcarlo `compatible` en `/admin/modelos` con su evidencia y su precio medido. Mientras eso no pase, el guion
  se escribe a mano, que es un camino de primera clase y no un apaño.
- **El precio sembrado lleva margen deliberado**: 3 créditos por respuesta, cuando el ejemplo de la
  documentación informa `credits_consumed: 0.48`. El coste depende de los tokens y ADR-0009 avisa de que el
  prototipo infraestimó ×3. Lo que se apunta como consumo es el dato informado, no el estimado; la estimación
  solo decide cuánto se aparta antes de llamar.
- **Lo que devuelve el modelo es texto no confiable, y se trata como contenido**: se parsea buscando el objeto
  JSON, cada campo pasa por `limpiarTextoDePrompt` (la misma limpieza anti-inyección de la ficha, ADR-0018) y su
  tope de longitud, y se guarda como **escenas en borrador** que el usuario revisa y aprueba. Nunca se
  interpreta como instrucción del sistema, nunca cambia modelo, duración, resolución ni precio, y cuando acaba
  dentro de un prompt vuelve a pasar por la limpieza. La idea del usuario viaja al modelo **delimitada y
  etiquetada como dato**, también limpia.
- **Las afirmaciones que conviene verificar no las detecta el modelo.** Se detectan con reglas deterministas
  sobre el texto (`lib/asistente.ts`): es gratis, funciona igual con el guion escrito a mano y no añade una
  segunda superficie de inyección. Escenara **no verifica** si son ciertas: las señala y decide una persona
  (PRD §8).

## Consecuencias

- Se gana un asistente que no obliga a ninguna credencial nueva, cuyo gasto es auditable apunte por apunte y que
  **no se puede cobrar dos veces** por la misma confirmación.
- Se gana que el estado por defecto de una instalación recién migrada sea el más barato y el más honesto: sin
  asistente, con el guion a mano y sin ningún modelo estimado a ciegas.
- Se pierde el streaming: la respuesta se espera entera (90 s de margen). Para un guion de cuatro escenas es
  irrelevante; si algún día se pide ver escribir, habrá que revisar esta decisión.
- Se pierde independencia de proveedor en el texto: si KIE retira su familia de chat, el asistente se queda sin
  modelo. El contrato opcional y el catálogo dejan la puerta abierta a añadir otro proveedor sin tocar nada más
  del servidor.
- **Habrá que revisar** el precio del modelo de texto en cuanto haya llamadas reales: la conciliación contra
  `credits_consumed` dirá en unos días si 3 créditos es un margen prudente o una exageración.

## Ampliación del 2026-09-27: la traducción de los prompts

**Decisión firme del propietario:** los prompts que se envían a los modelos de imagen y vídeo van **siempre en
inglés**. Lo que el usuario escribe en español —la escena, los campos de la ficha del personaje y su descripción,
y el texto del guion— lo traduce **el servidor** con este mismo modelo de texto y este mismo cliente
(`kie/texto.ts`) **antes de componer el prompt**. **El diálogo hablado no se traduce**: es lo que dirá el
personaje y tiene que sonar en el idioma en que se escribió.

Reglas, que son las mismas de siempre porque es otra llamada de pago:

- **es una llamada de pago y entra en la estimación**, con su precio del catálogo y su fecha. Se muestra como un
  coste **aparte** del modelo de imagen y como un **máximo** («hasta N créditos más»), porque un texto ya traducido
  no se vuelve a pagar. Los créditos que se confirman siguen siendo los del modelo que genera;
- **se cachea por huella del texto de origen** (`translation_cache`), **por usuario y no global**: lo que se
  traduce son datos personales de alguien (la ficha describe a una persona, ADR-0017), y ahorrar tres créditos no
  justifica convertir el texto de una cuenta en material de otra. De la caché sale la dedupe real: lo mismo no se
  paga dos veces. El texto de origen **no se guarda**, solo su huella;
- **reserva antes de llamar**, tope, presupuesto, **lista blanca de rechazos** (solo un código que prueba que no
  hubo ejecución se apunta como «no ha costado nada») y consumo con los créditos que informa el proveedor;
- **ninguna ruta de lectura la dispara**: se llama desde el alta de un trabajo, que ya es un POST con
  confirmación, `Origin` y límite de ritmo;
- **si la traducción falla, no se envía la generación.** Enviar el texto en español cuando la instalación ha
  decidido que va en inglés sería pagar por un resultado peor sin decirlo. El mensaje lo dice con esas palabras;
- **lo que devuelve el traductor es texto no confiable**, igual que el guion: pasa por `limpiarTextoDePrompt` y por
  su tope antes de entrar en ningún prompt, y una traducción incompleta se descarta entera.

Mientras el modelo de texto siga `descubierto` en el catálogo, la traducción vive detrás del ajuste
`traducirPrompts`, **apagado de fábrica**: con él apagado se envía el texto original, como hasta la 0.16.x. Para
cumplir la decisión del propietario hay que **validar el modelo con una prueba real** (ejecutarlo una vez,
marcarlo `compatible` en `/admin/modelos` con su precio medido) y encender el ajuste.
