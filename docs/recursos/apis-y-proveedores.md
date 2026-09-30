# APIs, proveedores y servicios

Catálogo público de los servicios que Escenara usa o evaluará: para qué sirven, de dónde se obtiene la clave y dónde está su documentación. **Aquí nunca se escriben claves.** Los valores reales van en `docs/privado/claves-api.local.md` (fuera de git) y en `.env.local`; la estructura está en `claves-api.plantilla.md`.

Las condiciones, precios y modelos de terceros cambian: cada dato se verifica al implementar y se anota la fecha de comprobación.

## Tres tipos de claves

| Tipo | De quién es | Dónde vive | Ejemplo |
|---|---|---|---|
| **BYOK del usuario** | Cada usuario final | Cifrada en la base de datos de Escenara (RF01) | La clave de Google de un creador |
| **Desarrollo** | Equipo de Escenara, para prototipos y pruebas | `docs/privado/claves-api.local.md` y `.env.local` | Clave de KIE para el prototipo 0.3.0 |
| **Operador** | Quien despliega una instancia | Variables de entorno o gestor de secretos del servidor | Clave maestra de cifrado, S3, correo |

La instancia nunca usa una clave global del operador para generar contenido de un usuario (PRD §6).

## Proveedores de IA

| Proveedor | Capacidades para Escenara | Cómo obtener la clave | Documentación | Precios | Estado |
|---|---|---|---|---|---|
| **Google Gemini API** | `text_generation` (guion), `image_edit` (imagen con referencias), `image_to_video` y `text_to_video` (Veo), `tts`, `speech_to_text`, `multimodal_review` | Google AI Studio → «Get API key»: https://aistudio.google.com/apikey. Veo requiere facturación activa | https://ai.google.dev/gemini-api/docs · Veo: https://ai.google.dev/gemini-api/docs/veo · Modelos: https://ai.google.dev/api/models | https://ai.google.dev/gemini-api/docs/pricing | **Aplazado** (ADR-0009): sin facturación activa la cuota es 0; se incorporará más adelante |
| **KIE.ai** | Agregador de modelos de imagen, vídeo, voz y música de varios fabricantes, con tareas asíncronas y callbacks | https://kie.ai/api-key | https://docs.kie.ai/ · Catálogo: https://kie.ai/market | Créditos por modelo (medido: `nano-banana-2-lite` 4 créditos por imagen; `veo3_fast` y `veo3_lite` 60 créditos por clip, lo mismo a 4 s que a 8 s; unos 5 USD por 1.000 créditos; **medidos con dinero real el 2026-09-28**: `gemini-omni-video` 63 créditos por un clip de 4 s en 9:16 a 720p, 59 s de espera, 720×1280 con audio y **el diálogo dicho en español con exactitud**; `grok-imagine/text-to-video` 14,4 créditos por un clip de 6 s en 9:16 a 480p, 38 s, 416×752 con audio, **prompt solo en inglés y sin diálogo**, pensado para animación y anuncios y no para un personaje real hablando). **Su modelo de voz `elevenlabs/text-to-speech-multilingual-v2` no tiene tarifa publicada** (comprobado el 2026-09-28 sin llamar a la API): entra en el catálogo sin precio, y sin precio no se estima ni se gasta. **Probado de verdad el 2026-09-28 y no funciona**: `jobs/createTask` devolvió «Internal Error» (500) sin cobrar, con los campos bajo `input`, tanto en ese modelo como en `turbo-2-5`; el modelo de texto `gpt-5-6-sol` del mismo proveedor tampoco respondió en 120 s. Es una degradación del proveedor, no de la forma del cuerpo. **Registro de identidades habladas (0.22.0), comprobado con la clave del propietario el 2026-09-28 y sin coste**: `POST /api/v1/omni/audio/create` ({`audio_id` de las 30 voces predefinidas, `name` ≤210, `voice_description` ≤20.000, `example_dialogue` ≤120}) devuelve `audioId`, y `POST /api/v1/omni/character/create` ({`character_name`, `descriptions`, `image_urls` [retrato y, opcional, cuerpo entero], `audio_ids`}) devuelve `characterId` y la URL con la que KIE aloja el retrato. Los dos cobran **0 créditos**. Con ese `characterId` en `character_ids`, `google/gemini-omni-flash-1-1` da la misma cara y la misma voz en todas las escenas. **Segundo motor de escenas habladas, medido el 2026-09-28**: `minimax-h3/reference-to-video` ({`prompt`, `reference_image_urls` ≤9, `reference_audio_urls` ≤3, `aspect_ratio` `9:16`, `duration` entero 4–15, `resolution` `768P`/`2K`}) costó **40 créditos** por 5 s a 768P y tardó 143 s, con la cara fiel al retrato y el diálogo en español exacto; no registra identidades, así que la voz sale de la muestra que se le manda | **Proveedor inicial** (ADR-0009), en uso desde la 0.10.0. Desde la 0.17.0 también aporta el **modelo de texto** del asistente de guion y desde la 0.21.0 el **modelo de voz** (capacidad `tts`), los dos con la misma clave (ADR-0020, ADR-0025). No presuponer endpoint universal de catálogo |
| **APIMart** | Agregador de pago por uso (imagen, vídeo, texto, música), compatible con el SDK de OpenAI y con tareas asíncronas (crear tarea, consultar estado, webhook) | Consola de https://apimart.ai | https://docs.apimart.ai/es · URL base `https://api.apimart.ai/v1` · Modelos: https://apimart.ai/es/model | https://apimart.ai/es/pricing. Créditos con equivalente en USD, sin planes | **Solo documentado** (decisión del propietario, 2026-09-27): probado de verdad y descartado como adaptador. El canal `-ext` no respeta el primer fotograma con personas reales y el oficial cuesta el doble que KIE por el mismo clip. Ver «Comparativa APIMart y KIE». Empresa Hangzhou Huanzhi Network Technology (sede declarada en Hong Kong), dominio de sep-2025 |
| **TypeSafe Jev** | Decisiones tipadas `choice`, `score` y `noul` sobre **texto**: no lee imágenes ni audio, así que en Escenara va siempre detrás de la percepción | Alta en TypeSafe; la clave es **de la instalación** y se guarda cifrada en Admin › Ajustes › Coherencia (ADR-0030), no en la bóveda de cada usuario | https://docs.typesafe.ai/llms.txt · Referencia HTTP: https://docs.typesafe.ai/api.md · Modelos: https://docs.typesafe.ai/models.md | **42 USD por mil millones de tokens de entrada; la salida no se factura** (documentado, comprobado el 2026-09-28 sin llamar a la API de pago). Límites publicados: 250.000 tokens/s y 1.200 peticiones/min; contexto de 64k por petición, con 32k para el estado más la pregunta más larga | **En uso desde la 0.24.0** como decisor de coherencia. `POST https://api.typesafe.ai/v1/systemone` con `{ state, model: "jev-latest", questions }` y `Authorization: Bearer`; contesta `{ model, answers, usage }` donde `noul` trae una probabilidad, y `choice` y `score` traen `probabilities` y `confidence`. Errores documentados: 401, 422, 429 y 529. `GET /v1/models` lista los alias **sin coste** y es la prueba de la clave. Tests con respuestas grabadas (`server/coherencia/fixtures.ts`) |
| **Laya** | Decisiones tipadas autoalojadas, ajuste fino con datos del dominio | Token de Hugging Face si el modelo lo exige: https://huggingface.co/settings/tokens | https://huggingface.co/convaiinnovations/laya | Sin coste por token; consume CPU o GPU del operador | **Aplazada en la 0.24.0** (ADR-0030): cabe detrás del mismo contrato de `server/decisiones/`, pero sin datos etiquetados no hay con qué evaluarla. Se retoma cuando el panel de Admin › Coherencia tenga muestra |
| **LTX (Lightricks)** | `image_to_video`; modelos abiertos | Alta en la plataforma LTX (verificar) | https://docs.ltx.io/api-documentation/api-reference/video-generation/image-to-video · https://github.com/Lightricks/LTX-Video | Consultar | Posterior, por adaptador |
| **Kling AI** | `image_to_video` | Alta en la plataforma de desarrolladores de Kling (verificar); también accesible vía KIE | https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy | Consultar | Posterior o vía KIE |
| **ElevenLabs** | `tts` con voces de catálogo (sin clonación en el MVP) | https://elevenlabs.io/app/settings/api-keys (basta una clave restringida con el permiso «Text to Speech») | https://elevenlabs.io/docs | Créditos del plan por carácter. **Medido el 2026-09-28** contra la API real: 79 caracteres de diálogo → `character-cost: 22` con `eleven_multilingual_v2`. Su equivalencia en USD depende del plan contratado, así que no se convierte y se registra el coste por llamada tal como lo informa el proveedor | **En uso desde la 0.21.0** como **proveedor de voz de reserva**, con credencial propia del usuario y cambio automático desde KIE (ADR-0025). `POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128` con cabecera `xi-api-key`: **síncrono**, 200 en 2,5 s, con el audio en `audio_base64` y las marcas por carácter en `alignment` y `normalized_alignment`. La prueba de credencial usa `GET /v1/voices`, **no** `/v1/user/subscription`, que devuelve `missing_permissions` con claves restringidas |
| **NaN builders** | Servicio **compatible con la API de OpenAI**: `text_generation` (`chat/completions`), `tts` (`audio/speech`, modelo `kokoro`) y `speech_to_text` (`audio/transcriptions`, modelo `whisper`) | Consola de https://nan.builders (clave `sk-…`) | https://nan.builders/docs · URL base `https://api.nan.builders/v1` · Modelos: https://nan.builders/docs/models | **Por cuota del plan, no por petición**: en Escenara sus llamadas se apuntan con **0 créditos** y lo que se guarda son los tokens de `usage`. Límites medidos el 2026-09-28: `gemma4` admite **5 peticiones simultáneas** (429 `concurrency limit`), `deepseek-v4-flash` puede agotar la cuota (402 `allowance exhausted`, con la fecha de reposición dentro del mensaje), `kokoro` 15 peticiones/minuto y `whisper` 10 peticiones/minuto con 25 MB de archivo | **En uso desde la 0.21.1** como entrada del **mapa de modelos** (ADR-0026), con credencial propia del usuario y protección frente a SSRF en cada llamada. Comprobado con la API real el 2026-09-28: `GET /v1/models` 200 con 14 modelos (mimo-v2.6-flash, rerank, whisper, glm5.3-flash, qwen3.8-flash, gemma4, mimo-v2.5, qwen3-embedding, qwen3.6, deepseek-v4-flash, kokoro, flux-2-klein, qwen-image-2.1, minimax-h3); `glm5.3-flash` contestó en 9,8 s con `usage` de 57 tokens de entrada y 433 de salida (407 de razonamiento); `whisper` con `response_format=verbose_json` devolvió `text`, `language: "es"` y `segments` de un clip de 4 s en español. **Percepción de la coherencia (0.24.0)**: `gemma4` describe caras y fotogramas y `mimo-v2.5` describe la voz y el ambiente. Según su referencia pública (`https://nan.builders/openapi.json`, comprobada el 2026-09-28), `mimo-v2.5` y `mimo-v2.6-flash` son los **únicos** modelos del clúster que aceptan **audio** de entrada (1M de contexto, 1.000M de tokens al mes); `gemma4` ve imágenes, tiene 262K de contexto y **no gasta contador de cuota**. Esa referencia documenta las partes `text` e `image_url` del mensaje pero **no publica la forma de la parte de audio**: Escenara usa la convención de la API de OpenAI (`{ "type": "input_audio", "input_audio": { "data": <base64>, "format": "mp3" } }`), que es la que estos servicios dicen seguir; si un servicio no la entendiera contestaría 400 y la pantalla lo diría en vez de inventarse hechos. **Las voces de `kokoro` tienen otros identificadores** (`ef_dora`, `em_alex`, `af_heart`…), así que son otra «familia de voces» y no pueden leer una voz fijada con ElevenLabs |
| **Whisper / faster-whisper** | `speech_to_text` local y de código abierto | No requiere clave | https://github.com/SYSTRAN/faster-whisper | Coste de cómputo propio | Opcional, alternativa sin proveedor |
| **whisper.cpp (`whisper-cli`)** | `speech_to_text` **en la propia máquina**: saca los subtítulos del audio con marcas de tiempo | No requiere clave | https://github.com/ggml-org/whisper.cpp · `brew install whisper-cpp` en macOS | Sin coste externo; consume CPU del operador | **En uso desde la 0.21.0** (ADR-0025). Dependencia del entorno, igual que FFmpeg: su orden y su fichero de modelo se configuran en Admin › Ajustes › Voz y subtítulos. Si falta, la pantalla lo dice y no propone subtítulos automáticos |

### Endpoints de KIE.ai que usa Escenara

Comprobados en https://docs.kie.ai/ el **2026-09-27** y ejecutados contra el servicio real en el prototipo de la 0.3.0. Todos responden HTTP 200 con un sobre `{ code, msg, data }`: el error real está en `code`, así que un `code` distinto de 200 es un fallo.

| Para qué | Petición | Notas |
|---|---|---|
| **Tabla de precios pública** (0.23.0) | `GET https://api.kie.ai/client/v1/model-pricing/count` y `POST https://api.kie.ai/client/v1/model-pricing/page` con `{ "pageNum": n, "pageSize": ≤100 }` | **Sin clave y sin coste**, comprobado el 2026-09-28: el recuento da `{all: 503, image: 110, video: 269, music: 27, chat: 97}` y cada registro trae `modelDescription` («gpt image 2, image-to-image, 1k»), `interfaceType`, `provider`, `creditPrice`, `creditUnit` («per image», «per second», «per video», «per million tokens»…), `usdPrice`, `discountRate` y `anchor`. **`modelDescription` no es el identificador de la API**; el que sí lo es está en el parámetro `model` del `anchor` (`?model=seedream%2F4.5-edit` → `seedream/4.5-edit`), comprobado contra la documentación de cada modelo, y cubre 215 de los 379 registros de imagen y vídeo. La tarifa publicada **coincide con lo medido con dinero real**: `nano-banana-2-lite` 4 por imagen, Hailuo 2.3 a 6 s y 768p 30, MiniMax H3 8 por segundo × 5 s = 40, Grok Imagine 2,4 por segundo × 6 s = 14,4 y Gemini Omni 1.1 Flash a 4 s 63. Las unidades que no se conocen antes de generar (`per megapixel`, `per million tokens`) no se importan |
| Saldo de créditos | `GET https://api.kie.ai/api/v1/chat/credit` | `data` es el número de créditos. Sin coste; es también la prueba de la clave (0.9.0) |
| Subida temporal de una referencia | `POST https://kieai.redpandaai.co/api/file-stream-upload` (multiparte: `file`, `uploadPath`) | Devuelve `downloadUrl`; KIE borra el archivo en unas horas |
| Crear tarea | `POST https://api.kie.ai/api/v1/jobs/createTask` con `{ model, input }` | Devuelve `taskId`, lo único que permite reconsultar sin reenviar |
| Estado de la tarea | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…` | `state` ∈ `waiting`, `queuing`, `generating`, `success`, `fail`; `resultJson` (cadena JSON con `resultUrls`), `failCode` y `failMsg` (solo se usan para elegir una causa propia de una lista cerrada; su texto no se guarda ni se muestra), `creditsConsumed` |
| Texto y guion (0.17.0) | `POST https://api.kie.ai/codex/v1/responses` con `{ model, input, stream: false }` | **No sigue el patrón asíncrono ni el sobre `{ code, msg, data }`**: responde en la misma petición con la forma de la API de respuestas de OpenAI. El texto está en `output[].content[].text` (solo los bloques `type: "message"`) y el coste real, en `credits_consumed`. Documentado en https://docs.kie.ai/market/chat/gpt-5-6-sol. **Ejecutado con la clave real el 2026-09-27** con el adaptador de la app: traducción de una frase 0,05 créditos en 3 s; lote de 2–3 textos de la ficha 0,28–0,34 créditos en 16–30 s; guion del asistente de 4 escenas 0,5–0,93 créditos en 8–37 s. El JSON devuelto se lee bien. Ante un texto con intento de inyección («Ignora las instrucciones…»), el modelo devuelve cadena vacía en ese elemento y la app descarta el lote entero, que es lo previsto. La latencia medida llega a 37 s, así que desde la 0.19.1 el adaptador espera hasta 90 s |

El catálogo del market con el `model` exacto de cada modelo y sus campos de `input` está listado en https://docs.kie.ai/llms.txt (una página `.md` por modelo, lectura sin clave y sin coste): es la fuente de la correspondencia entre la tabla de precios y lo que se le puede pedir a cada uno.

La clave viaja siempre en la cabecera `Authorization: Bearer …` y nunca en la URL. Del proveedor no se conserva su texto de error: puede repetir la clave recibida.

Parámetros de los modelos en uso, **ejecutados de verdad** (comparativa del 2026-09-27; cada modelo recibe campos distintos, así que no se generalizan):

| Modelo | Campos de la referencia | Otros parámetros | Créditos medidos | Voz |
|---|---|---|---|---|
| `nano-banana-2-lite` | `image_urls` (hasta 10) | `prompt`, `aspect_ratio` | 4 / imagen | — |
| `seedream/4.5-edit` | `image_urls` (hasta 10) | `prompt`, `aspect_ratio`, `quality: basic` | 6,5 / imagen | — |
| `gpt-image-2-5-flare-image-to-image` | **`input_urls`** (1) | `prompt`, `aspect_ratio`, `resolution` (1K, 2K, 4K) | 6 / imagen a 1K | — |
| `veo3_fast` (Veo 3.1 Fast) | `image_urls` (1 o 2) | los mismos que Lite: `prompt`, `generation_type`, `aspect_ratio`, `duration` numérico, `resolution` | 60 / clip, igual a 4 s que a 8 s | Sí |
| `veo3_lite` (Veo 3.1 Lite) | `image_urls` (1 o 2) | `prompt`, `generation_type` (`TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`), `aspect_ratio`, `duration` numérico (4, 6, 8), `resolution` (`720p`, `1080p`) | 60 / clip, igual a 4 s que a 8 s | Sí |
| `hailuo/2-3-image-to-video-standard` | **`image_url`** (texto, 1) | `prompt`, `duration` en texto («6», «10»), `resolution` (`768P`, `1080P`); **no acepta `aspect_ratio`** (toma el de la imagen) | 30 / clip de 6 s | **No** |
| `kling/v3-turbo-image-to-video` | `image_urls` (1), **solo JPEG o PNG** | `prompt`, `duration` en texto, `resolution` (`720p`) | 72 / clip de 4 s | Sí |

Escenara usa el catálogo de `/admin/modelos` para todo esto: los parámetros de la tabla son los que están sembrados en `apps/web/src/server/proveedores/catalogo.json`, y el precio vigente vive en `model_prices` con su fuente y su fecha.

### Comparativa APIMart y KIE (2026-09-27, con pruebas reales de las dos plataformas)

Precios de la tabla «Precio actual» de cada página de modelo de https://apimart.ai/es/model. Se cargan en el navegador, no en el HTML. En APIMart, 1 crédito equivale a 0,10 USD. En KIE, unos 0,005 USD por crédito. Las variantes `-ext` son canales alternativos más baratos. Las normales («oficiales») se cobran por tokens y el precio es estimado.

| Uso | KIE | APIMart, variante `-ext` | APIMart, variante oficial |
| --- | --- | --- | --- |
| Imagen `nano-banana-2-lite` 1K | 0,02 USD | 0,0125 USD | ≈0,032 USD (por tokens) |
| Imagen `nano-banana-2` 1K | — | 0,015 USD | ≈0,054 USD (por tokens) |
| Imagen `nano-banana-pro` 1K/2K | — | 0,03 USD | ≈0,107 USD (por tokens) |
| Veo 3.1 lite, clip de 8 s | `veo3_lite` 0,30 USD por clip de **4 s** | 0,07 USD (**solo texto a vídeo**: no acepta imagen) | — |
| Veo 3.1 fast, clip de 8 s con fotograma inicial, 720p/1080p | — | **0,14 USD** | 0,064 USD/s sin audio y 0,08 USD/s con audio (0,51–0,64 USD por 8 s) |
| Veo 3.1 quality, 8 s | — | 1 USD | 0,16–0,32 USD/s |
| Hailuo 2.3, 6 s 768p | 0,15 USD | 0,29 USD (0,0488 USD/s); Fast 0,15 USD (0,0248 USD/s) | — |
| Kling 3.0 Turbo 720p, 4 s | 0,36 USD | 0,46 USD (0,1144 USD/s) | — |
| Seedance 2.0 mini / fast 720p | — | 0,0229 / 0,0856 USD/s | — |

Conclusiones provisionales:

- **Veo con fotograma inicial**: `veo3.1-fast-ext` (0,14 USD por 8 s) no respeta el primer fotograma con personas reales, así que no sirve para el proceso de fotograma clave. El canal oficial (0,64 USD por 8 s con audio) sí lo respeta y cuesta por segundo casi lo mismo que `veo3_lite` en KIE, pero con Veo 3.1 fast.
- **La imagen `-ext`** es un 37 % más barata que en KIE. Las variantes oficiales son más caras.
- **Hailuo y Kling** salen más caros en APIMart.
- Queda por confirmar con una prueba real si `-ext` incluye audio, qué calidad y estabilidad tiene y si el `cost` informado coincide con la tabla. La documentación no aclara quién hay detrás de los canales `-ext`.

**Prueba real del 2026-09-27** (10 USD de saldo; `cost` de la tarea, tabla y diferencia de saldo coinciden al céntimo):

- `nano-banana-2-lite-ext`, 9:16: **0,0125 USD** en 20 s. Imagen de 768×1376 de buena calidad.
- `veo3.1-fast`, desde esa imagen, 9:16: **0,14 USD** en 107 s. Clip de 8,0 s en 720×1280 a 24 fps, **con audio AAC**. El personaje se mantiene fiel, pero **el primer fotograma no es idéntico a la imagen** (cambia la postura de los brazos): con una sola imagen parece usarla como referencia y no como fotograma inicial. Para el proceso de fotograma clave hay que probar `generation_type: "frame"`.
- `veo3.1-fast` con `generation_type: "frame"`: **fallido dos veces** por política de contenido («figuras públicas, menores, derechos de autor…»), sin cobro. El canal `-ext` no acepta a una persona realista como primer fotograma, solo como referencia. **Las tareas fallidas no se cobran** (comprobado con el saldo).
- `veo3.1-fast-official` con `first_frame_image`, `person_generation: "allow_adult"` y `generate_audio: true`, 720p y 8 s: **0,64 USD** en 70 s. **Arranca exactamente en la imagen dada** y el personaje habla. Es la opción que encaja con el proceso de fotograma clave: 0,08 USD/s, frente a 0,075 USD/s de `veo3_lite` en KIE, con un modelo superior y clips de 8 s.
- Los resultados se sirven desde `getapib.org`, no desde un dominio de APIMart: los canales `-ext` los presta un tercero.

**Contraprueba en KIE del 2026-09-27**, con la misma imagen: `veo3_fast` por `POST /api/v1/jobs/createTask`, con `image_urls` (1), `generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO"`, 9:16, 8 s y 720p.

- Con el prompt sin frase concreta («says hello…») **falló dos veces** («The Google model was unable to generate audio for this request»), sin cobro.
- Con el diálogo en el formato de la app («says in Spanish…: ¡Hola! Soy Lucía…»): **60 créditos (0,30 USD)** en 96 s. Clip de 8 s en 720×1280 con audio que **arranca exactamente en la imagen**.
- En KIE, **8 s de `veo3_fast` cuestan lo mismo que 4 s de `veo3_lite`** (60 créditos). Conviene añadirlo al catálogo.

**Resultado de la comparación de vídeo con fotograma inicial (Veo 3.1 fast, 8 s, 720p, con audio):** KIE 0,30 USD frente a APIMart oficial 0,64 USD. **KIE es la mitad de caro.** APIMart solo gana en imagen `-ext` (0,0125 USD frente a 0,02 USD).

**Decisión del propietario (2026-09-27):** APIMart **se queda documentada y sin adaptador**. Lo que se lleva a la 0.19.1 es lo medido en KIE: `veo3_fast` en el catálogo como modelo de animación predeterminado, 60 créditos por clip, y clips de **8 s por defecto con 4 s opcional**, porque las dos duraciones cuestan lo mismo.

Datos técnicos (https://docs.apimart.ai/_llms/en/api-manual.md): la API base es `https://api.apimart.ai/v1` con `Authorization: Bearer`. La imagen va por `POST /images/generations` y el vídeo por `POST /videos/generations`, que admite `image_urls` hasta 3, `duration` fija de 8 s y `aspect_ratio` 9:16. El estado se consulta en `GET /tasks/{id}` y devuelve `cost` en USD y `credits_cost`. El saldo, gratis, en `GET /user/balance`. Las URLs de resultado caducan a las 24 h y las tareas fallidas no se cobran. Solo encajaría como adaptador nuevo por el contrato de ADR-0015, con los modelos sembrados como `descubierto`.

### Spike de la dirección del clip (2026-09-28, con dinero real)

Aprobado por el propietario con un **tope duro de 504 créditos de KIE**, que es exactamente lo que se gastó
(saldo antes 9552,63 → después 9048,63). Modelo `google/gemini-omni-flash-1-1`, 4 s, 720p, 9:16, **sin
personaje registrado** (tarifa «no video input», 63 créditos por clip, la misma que publica su tarifario).

De los ocho clips previstos salieron **cinco utilizables**. Los tres primeros se pagaron y se perdieron por un
fallo del script: el sondeo comparaba el estado del proveedor con `completado`, que no existe en el contrato
—el estado terminal es `listo`—, así que se rendía con la tarea ya cobrada y sin guardar su identificador.
Corregido: ahora el identificador se escribe en cuanto existe, el sondeo espera quince minutos y hay un modo
`--recoger` que vuelve a por lo ya pagado.

Qué se observó, mirando los clips fotograma a fotograma:

| Pregunta | Resultado |
|---|---|
| ¿La regla de toma única evita el corte? | **Sí, en 5 de 5.** Ningún clip tiene corte, transición ni cambio de plano; la escena y la persona son las mismas de principio a fin |
| ¿Se respeta el movimiento de cámara? | **Sí** en el acercamiento lento: el encuadre pasa de plano medio a primer plano de forma continua y la cámara se queda quieta al final |
| ¿Se respetan plano, ángulo, sitio y registro? | **Sí**: plano medio, tres cuartos, cocina y acabado de móvil salieron como se pidieron |
| ¿Se termina la frase dentro del clip? | **Sí**, pero **la ocupa entera** |
| ¿El gesto ocurre en el momento pedido? | **No se puede saber con 4 s.** La frase de dieciséis palabras llena el clip y no queda hueco para asentir antes ni después |
| ¿Se oye el acento? | **Pendiente de escucharlo**: los clips tienen audio (AAC, 4,01 s), pero esto hay que juzgarlo de oído |

Lo que cambió en el producto por esto: el compositor avisa y coloca el gesto **dentro** del habla cuando la
frase no deja hueco (`lib/direccion.ts › gestoNoCabe`), en vez de prometer un «antes» que el modelo no puede
cumplir. Los movimientos de nivel `variacion` y `avanzado` **siguen sin medir**: el clip de órbita lenta estaba
entre los tres que se perdieron.

Vídeos y resumen quedaron fuera del repositorio, en el espacio de trabajo de la sesión.

### Segundo spike, clips de 8 s (2026-09-28, con dinero real)

Aprobado con tope duro de 504 créditos; gastados **315** (tres clips a 105; el cuarto falló **sin cobrar**).
Mismo modelo y montaje que el primero, con `--segundos 8`.

| Pregunta | Resultado |
|---|---|
| ¿Un movimiento **avanzado** se respeta? | **Sí.** El push-in a los ojos va de plano medio a primerísimo, continuo, sin corte y cerrando en los ojos |
| ¿El gesto **antes** de hablar? | **No.** Con hueco de sobra (frase de 16 palabras en 8 s), el modelo **empieza a hablar en el primer fotograma** y deja el silencio al final |
| ¿El gesto **después** de hablar? | **Sí**, porque coincide con donde el modelo deja el hueco |
| ¿El clip **mudo**? | **Falló, sin cobrar.** El prompt decía «no voice of any kind», y estos modelos se caen cuando se les prohíbe el audio |
| ¿Corte? | **Ninguno** en los tres clips que salieron |

Lo que cambió en el producto:

- **El clip mudo deja de prohibir el audio.** Solo se describe lo que se ve (boca cerrada, labios quietos) y
  el ambiente lo pone en positivo el constructor del modelo, que es lo que ya hacía desde la 0.19.0. El texto
  de esta versión había vuelto a introducir la prohibición que se sabía que rompe.
- **El gesto «antes de hablar» avisa de que casi nunca se respeta.** Se envía igual —es lo que el usuario
  pidió—, pero se le dice qué va a pasar y que «después» sí se cumple.
- **`push-in a los ojos` baja de «avanzado» a «con variación»**, porque está medido. Los demás avanzados
  siguen sin medir y se quedan como están.

Sigue pendiente **el acento**: hay audio en todos los clips, pero eso se juzga de oído.

## Infraestructura y servicios del operador

| Servicio | Para qué | Local | Producción | Documentación | Estado |
|---|---|---|---|---|---|
| PostgreSQL | Datos, trabajos, presupuesto, historial | Docker Compose, puerto 5421 del host | Contenedor gestionado o servicio de base de datos | https://www.postgresql.org/docs/ | Decidido (PRD) |
| Almacenamiento S3 | Referencias, medios generados y exportaciones con URLs temporales | SeaweedFS, pasarela S3 en el puerto 8321 | SeaweedFS en Easypanel para el piloto; almacenamiento gestionado en la UE (p. ej. Cloudflare R2) si crece | https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API · https://developers.cloudflare.com/r2/ | Decidido (ADR-0006) |
| Redis | Solo si la cola elegida es BullMQ | Docker Compose | Contenedor | https://redis.io/docs/ | ADR-0003 |
| Correo transaccional | Verificación de cuenta y avisos | Captura local (Mailpit) | Resend u otro | https://resend.com/docs | Pendiente |
| Easypanel | Panel de despliegue (Docker) de la instancia del proyecto: aplicaciones, bases de datos, dominios y certificados | — | Servidor propio con Easypanel | https://easypanel.io/docs | Decidido (ADR-0007) |
| GitHub | Repositorio, etiquetas y releases | — | — | https://docs.github.com/ | Pendiente de crear el remoto |
| Dominio | Portada y aplicación públicas | — | Registrador por decidir | — | Verificar disponibilidad de «Escenara» |
| C2PA | Credenciales de contenido en exportaciones | — | Librería en workers | https://c2pa.org/ | 0.21.0 / 0.30.0 |

## Variables de entorno previstas

Se documentarán en `.env.example` a partir de 0.2.0. Nombres propuestos:

| Variable | Tipo | Uso |
|---|---|---|
| `GEMINI_API_KEY` | Desarrollo | Adaptador de Google (aplazado) |
| `KIE_API_KEY` | Desarrollo | Prototipo 0.3.0 y pruebas de contrato del adaptador de KIE |
| `TYPESAFE_API_KEY` | Desarrollo | Evaluación de Jev en 0.23.0 |
| `HF_TOKEN` | Desarrollo | Descarga de Laya si procede |
| `ELEVENLABS_API_KEY` | Desarrollo | Evaluación opcional de voz |
| `DATABASE_URL` | Operador | Conexión a PostgreSQL (en local, `localhost:5421`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Operador | Almacenamiento de objetos (en local, `http://localhost:8321`) |
| `CREDENTIALS_MASTER_KEY` | Operador | Clave maestra del cifrado de credenciales BYOK |
| `AUTH_SECRET` | Operador | Firma de sesiones |
| `RESEND_API_KEY` | Operador | Correo transaccional |

## Cómo añadir un proveedor

El contrato real está en `apps/web/src/server/proveedores/contrato.ts` (ADR-0015); el adaptador de KIE en `apps/web/src/server/proveedores/kie/` es el ejemplo a seguir.

1. **Documentarlo aquí**: su fila con capacidades, documentación, precios y estado «Por evaluar», y su bloque en `claves-api.plantilla.md` y en el documento privado.
2. **Ejecutar sus modelos de verdad** (un spike en `spikes/`, con tope de gasto) y anotar en un informe qué campos acepta cada uno, qué límites tiene y cuántos créditos costó. Los esquemas de los informes de investigación se equivocan: la comparativa del 2026-09-27 corrigió tres.
3. **Sembrar sus modelos** en `apps/web/src/server/proveedores/catalogo.json` con sus capacidades, sus parámetros comprobados, si tienen voz y su precio con fuente y fecha. Se siembran como `compatible`; `validado` lo decide quien administra desde `/admin/modelos`, con evidencia.
4. **Escribir su adaptador** implementando `Adaptador`: `subirReferencia`, `generarImagen`, `generarVideo`, `consultar`, `estimar`, `probarCredencial` y `montarEntrada` (los campos exactos de cada modelo), con sus fallos traducidos a los motivos normalizados (`credencial`, `saldo`, `contenido`, `limite`, `temporal`, `respuesta`). `temporal` es el que significa «no se sabe si la petición llegó»: tras uno de esos **nunca** se reenvía nada.
5. **Declararlo** en `apps/web/src/server/proveedores/registro.ts`. Si además va a cobrar trabajos, añadirlo a `PROVEEDORES` en `apps/web/src/lib/boveda.ts` para que pueda tener credencial del usuario.
6. **Escribir su prueba de contrato** con respuestas grabadas del servicio real (ver `apps/web/src/server/proveedores/kie/grabaciones.ts`), incluidos todos los errores normalizados. La suite no llama a ningún proveedor: cada llamada de verdad cuesta dinero de alguien.

## Persona con producto: prueba real del 2026-09-28

Medido con dinero real (14,5 créditos en total), con un retrato del personaje y dos fotos de producto como referencias:

- **nano-banana-2-lite, persona + producto** (4 créditos): la cara se mantiene y la etiqueta del envase sale **legible y sin inventar texto**. Es el camino recomendado para fotogramas con producto.
- **seedream/4.5-edit, etiqueta en primer plano** (6,5 créditos): conserva la etiqueta, pero leyó «shot on a modern phone» al pie de la letra y **metió un móvil en la mano** del personaje. Desde la 0.26.0 las frases de registro piden «el aspecto de una foto de móvil» y dicen expresamente que el móvil que graba no sale en el plano.
- **Logo de marca real** (nano-banana-2-lite, 4 créditos): el proveedor **no lo rechaza**: reproduce el logo tal cual y cobra lo normal. El filtro del proveedor no protege frente al uso de marcas ajenas; lo cubre la declaración de derechos de marca que exige Escenara.
- **Omni con `character_ids` + `image_urls`**: sin medir (el personaje de prueba no estaba registrado en Omni). Mientras tanto, una escena hablada con producto renuncia a la identidad registrada y lo avisa antes de cobrar.

## Omni con dos personajes, medido 2026-09-29

Spike de la fase 0.28.0 (podcast y dualcast) con dinero real: **189 créditos en total**, tres clips de 4 s en 9:16 a 720p con `google/gemini-omni-flash-1-1`, dos personajes registrados antes (Elisa, inventada; Elisabeth, persona real con consentimiento vigente). Los dos registros de identidad y voz volvieron a costar **0 créditos**.

- **El precio no sube con dos `character_ids`**: 63 créditos el clip con un personaje y **63 el mismo clip con dos**. Se cobra por duración y resolución, no por número de identidades.
- **Dualcast funciona**: los dos salen en el mismo plano, cada cara la suya, sin mezclarse ni repetirse. Se respetó el lado que pedía el prompt (Elisa a la izquierda, Elisabeth a la derecha).
- **El diálogo se reparte por turnos**: habla primero quien dice el prompt (labios en movimiento hasta ~2,2 s) y después la otra (~2,5–4 s), con la que escucha en silencio y mirando a quien habla.
- **Fidelidad desigual**: el personaje inventado sale idéntico a su retrato; la persona real sale reconocible (pelo, gafas, complexión) pero **rejuvenecida y sin su maquillaje**. Con personas reales conviene comprobar la identidad antes de dar el clip por bueno.
- **Podcast (dos clips, un `character_id` cada uno)**: la **mirada cruzada sí se obedece** (una mira al borde derecho del cuadro y la otra al izquierdo), y el set descrito sale de la misma familia en los dos, pero no idéntico (muebles y encuadre varían). El **lado del cuadro no siempre se respeta** en el clip de un solo personaje, y en los dos se coló el brazo o la rodilla de un segundo cuerpo pese a pedir «no hay nadie más en el plano».
- **Forma exacta de la petición**: `{ prompt, character_ids: [id1, id2], duration: "4", resolution: "720p", aspect_ratio: "9:16" }`. En el prompt cada personaje se nombra **con el mismo nombre con el que se registró** («Elisa», «Elisabeth») y se ata a su sitio («the woman on the LEFT of the frame is Elisa»), con un turno por línea: quién habla, qué dice literal en español y qué hace la otra mientras.

## Canto con audio propio, medido 2026-09-29

Spike de la fase 0.29.0 en la cuenta del propietario, con un MP3 de 11,52 s sintetizado localmente y el retrato
vertical de Elisa. Se autorizó un máximo de 200 créditos. Dos tareas de `infinitalk/from-audio` a 480p
terminaron en «Internal Error» del proveedor después de informar «generating»: **0 créditos cobrados** en
ambas. La alternativa `kling/v1-avatar-standard` a 720p terminó correctamente. Escenara estimó **96 créditos**
(12 s facturables × 8 créditos/s), pero KIE informó **88 créditos consumidos**. No se infiere otra tarifa para
futuros envíos: el coste se sigue confirmando con el catálogo y se cierra con el dato del proveedor.

`ffprobe` midió el resultado de Kling: H.264, **848 × 1072**, AAC estéreo y **12,267 s**. La pista de audio
coincide con el archivo aportado (PSNR de 174 dB después de igualar frecuencia y canales). Ese archivo suena
al propietario como un sintetizador sin voz cantada reconocible. En la revisión del vídeo, los labios no
guardan relación con el sonido: **este spike valida el envío y la conservación del audio, no el canto ni el
lip-sync**. El proveedor sustituyó
el fondo crema pedido por una cafetería y dejó letras ilegibles cerca del final. El tamaño vertical del
retrato no garantiza 9:16: este modelo no recibe un parámetro de proporción. El montaje local guardado sí sale
a 1080 × 1920 con etiqueta sintética y audio, sin coste de proveedor; conserva el encuadre con franjas negras.
Véase el [recorrido de referencia](../procesos/recorridos-de-referencia-0.29-0.32.md) para el proyecto y capturas.
Queda pendiente repetirlo con una voz cantada original dentro de los 112 créditos aún autorizados.
