# ADR-0015 · Contrato de adaptadores por capacidades y catálogo de modelos en la base de datos

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.11.0

## Contexto

Hasta la 0.10.1, Escenara hablaba con KIE.ai «a mano»: el modelo de cada tipo de trabajo era una constante en el código (`MODELOS.fotograma`), la entrada de cada modelo estaba escrita en `server/proveedores/kie/modelos.ts` y el servicio de generación importaba el cliente de KIE directamente. Con un solo proveedor y dos modelos funcionaba, pero el PRD §7 necesita varios proveedores por capacidad y la comparativa real del 2026-09-27 dejó claro por qué no se puede generalizar a ciegas:

- **cada modelo recibe campos distintos**, aunque sea del mismo proveedor: `nano-banana-2-lite` espera `image_urls`, `gpt-image-2-5-flare-image-to-image` espera `input_urls` y `hailuo/2-3-image-to-video-standard` espera `image_url` (texto), con `duration` y `resolution` como cadenas y **sin** `aspect_ratio`;
- **cada modelo tiene sus límites reales**: Hailuo 2.3 no genera audio y su mínimo son 6 s; Kling v3 turbo solo acepta JPEG o PNG, y la biblioteca guarda WebP;
- **los precios solo se conocen midiéndolos**: Kling costó 72 créditos por 4 s (un 30 % más que la estimación de terceros) y GPT Flare 6 en lugar de 3.

Además, ADR-0009 ya avisaba de que KIE **no tiene un endpoint universal de catálogo**: no se puede preguntar «qué modelos tengo disponibles».

## Opciones

1. **Un cliente por proveedor, sin contrato común.** Cada proveedor se integra con sus propias funciones y el servicio de generación las llama según el caso. Supone que habrá pocos proveedores; falla primero al añadir el segundo, porque la lógica de «no reenviar tras un fallo sin respuesta» y la traducción de estados se duplican y dejan de coincidir.
2. **Contrato por capacidades, derivado de lo que ya se usa.** Una interfaz con lo que Escenara necesita de verdad (subir referencia, crear tarea de imagen o de vídeo, consultar, estimar, probar credencial), errores normalizados y un catálogo de modelos en base de datos. Supone que los proveedores se parecen en ese nivel de abstracción; falla primero con un proveedor síncrono o con streaming, que no encaja en «tarea con identificador».
3. **Contrato genérico tipo «pasarela de IA» con esquemas declarativos por modelo.** Supone que el esquema de entrada de cada modelo se puede describir con datos; falla primero por el coste de mantenerlo y porque el esquema real solo se conoce ejecutando el modelo (la comparativa corrigió tres esquemas del informe previo de investigación).

## Decisión

Se elige la **opción 2**: contrato de adaptadores por capacidades, con el catálogo de modelos en la base de datos y sembrado desde un fichero versionado.

Piezas:

- `lib/catalogo.ts`: capacidades (`image_edit`, `image_to_video`, `text_to_video`, `text_generation`, `tts`, `speech_to_text`, `multimodal_review`), estados del registro (`descubierto`, `compatible`, `validado`, `retirado`) y parámetros comprobados de cada modelo;
- `server/proveedores/contrato.ts`: la interfaz `Adaptador` (`subirReferencia`, `generarImagen`, `generarVideo`, `consultar`, `estimar`, `probarCredencial`, `montarEntrada`), los errores normalizados (`credencial`, `saldo`, `contenido`, `limite`, `temporal`, `respuesta`) y la traducción de estados del proveedor a los estados propios de 0.10.0;
- `server/proveedores/registro.ts`: resuelve «capacidad + modelo» → adaptador. El servicio de generación ya no nombra a ningún proveedor;
- tablas `model_providers`, `models`, `model_capabilities` y `model_catalog_changes`, más `model_prices` (de 0.10.0) ampliada con versión y fecha de actualización;
- `server/proveedores/catalogo.json`: semilla versionada del catálogo, aplicada al migrar y sin pisar lo que haya cambiado quien administra.

Reglas que acompañan a la decisión:

- **cómo se le pide algo a un modelo lo decide su adaptador**, no el servicio: `montarEntrada` monta los campos exactos de ese modelo a partir de sus parámetros comprobados;
- **solo se puede elegir y enviar un modelo `compatible` o `validado` y con precio registrado**. Uno `retirado`, uno sin la capacidad pedida o uno sin precio se rechaza antes de llamar a nadie;
- **solo quien administra cambia precios y estados**, y `validado` exige evidencia escrita (coste medido y ejemplo o informe). El usuario ve el estado, no lo cambia;
- **nada se da por disponible sin haberlo ejecutado**: no hay catálogo remoto, el estado `descubierto` no basta para gastar y un precio inventado no existe (sin precio no se estima ni se gasta);
- **un cambio de precio caduca las estimaciones anteriores y no toca ningún trabajo ya creado**: el precio tiene versión, cada estimación viaja con un sello que la incluye y una confirmación con sello viejo se rechaza con 409. Los créditos estimados y consumidos que se guardaron son un hecho histórico;
- **el comportamiento visible de 0.10.0 no cambia**: mismos endpoints (`jobs/createTask`, `jobs/recordInfo`), mismos estados y mismas reglas de gasto. Los tests de 0.10.0 pasan sin tocar sus expectativas;
- **tras un fallo sin respuesta nunca se reenvía**, igual que en ADR-0014: el motivo `temporal` del contrato es el que marca ese caso para cualquier proveedor;
- un proveedor puede estar en el catálogo **sin adaptador** (el hueco de Google, ADR-0009): se ve, pero no se le puede enviar nada.

## Consecuencias

Qué se gana:

- añadir un proveedor es escribir su adaptador, declararlo en el registro y sembrar sus modelos; el servicio de generación no cambia;
- las reglas de dinero (confirmación, idempotencia, no reenviar) están una sola vez y valen para todos;
- el usuario puede elegir modelo por capacidad viendo su coste, su estado y si tiene voz, y quien administra tiene el catálogo, su historial y el aviso de estimaciones afectadas en `/admin/modelos`.

Qué se pierde o queda pendiente:

- el contrato está derivado de un solo proveedor real: un proveedor síncrono, con streaming o con otro modelo de facturación obligará a revisarlo (se sabrá al escribir el segundo adaptador);
- la elección de modelo por capacidad la hace hoy la persona; comparar modelos automáticamente es 0.25.0;
- la disponibilidad «verificada para esta cuenta» solo se conoce tras una generación o una consulta real: no hay forma de preguntarle a KIE qué tiene habilitado;
- el saldo se sigue leyendo del proveedor `kie` en la estimación: cuando haya un segundo proveedor con credencial habrá que leer el del proveedor del modelo elegido;
- los parámetros de cada modelo se guardan como JSON en una columna de texto, no en `jsonb`, porque los `jsonb` de esta base quedan doblemente codificados (Drizzle sobre bun-sql); se revisará en 0.12.0, que corrige esa codificación.
