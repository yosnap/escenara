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
| **KIE.ai** | Agregador de modelos de imagen, vídeo, voz y música de varios fabricantes, con tareas asíncronas y callbacks | https://kie.ai/api-key | https://docs.kie.ai/ · Catálogo: https://kie.ai/market | Créditos por modelo (medido: `nano-banana-2-lite` 4 créditos por imagen, `veo3_lite` 60 créditos por vídeo de 4 s; unos 5 USD por 1.000 créditos) | **Proveedor inicial** (ADR-0009), en uso desde la 0.10.0. Desde la 0.17.0 también aporta el **modelo de texto** del asistente de guion, con la misma clave (ADR-0020). No presuponer endpoint universal de catálogo |
| **TypeSafe Jev** | Decisiones tipadas `choice`, `score` y `noul` | Alta en TypeSafe (verificar proceso) | https://docs.typesafe.ai/introduction · Confianza: https://docs.typesafe.ai/confidence | Consultar al darse de alta | Por evaluar en 0.23.0 (modo sombra) |
| **Laya** | Decisiones tipadas autoalojadas, ajuste fino con datos del dominio | Token de Hugging Face si el modelo lo exige: https://huggingface.co/settings/tokens | https://huggingface.co/convaiinnovations/laya | Sin coste por token; consume CPU o GPU del operador | Posterior; solo con datos etiquetados |
| **LTX (Lightricks)** | `image_to_video`; modelos abiertos | Alta en la plataforma LTX (verificar) | https://docs.ltx.io/api-documentation/api-reference/video-generation/image-to-video · https://github.com/Lightricks/LTX-Video | Consultar | Posterior, por adaptador |
| **Kling AI** | `image_to_video` | Alta en la plataforma de desarrolladores de Kling (verificar); también accesible vía KIE | https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy | Consultar | Posterior o vía KIE |
| **ElevenLabs** | `tts` con voces de catálogo (sin clonación en el MVP) | https://elevenlabs.io/app/settings/api-keys | https://elevenlabs.io/docs | Consultar | Opcional, alternativa de voz |
| **Whisper / faster-whisper** | `speech_to_text` local y de código abierto | No requiere clave | https://github.com/SYSTRAN/faster-whisper | Coste de cómputo propio | Opcional, alternativa sin proveedor |

### Endpoints de KIE.ai que usa Escenara

Comprobados en https://docs.kie.ai/ el **2026-09-27** y ejecutados contra el servicio real en el prototipo de la 0.3.0. Todos responden HTTP 200 con un sobre `{ code, msg, data }`: el error real está en `code`, así que un `code` distinto de 200 es un fallo.

| Para qué | Petición | Notas |
|---|---|---|
| Saldo de créditos | `GET https://api.kie.ai/api/v1/chat/credit` | `data` es el número de créditos. Sin coste; es también la prueba de la clave (0.9.0) |
| Subida temporal de una referencia | `POST https://kieai.redpandaai.co/api/file-stream-upload` (multiparte: `file`, `uploadPath`) | Devuelve `downloadUrl`; KIE borra el archivo en unas horas |
| Crear tarea | `POST https://api.kie.ai/api/v1/jobs/createTask` con `{ model, input }` | Devuelve `taskId`, lo único que permite reconsultar sin reenviar |
| Estado de la tarea | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…` | `state` ∈ `waiting`, `queuing`, `generating`, `success`, `fail`; `resultJson` (cadena JSON con `resultUrls`), `failMsg`, `creditsConsumed` |
| Texto y guion (0.17.0) | `POST https://api.kie.ai/codex/v1/responses` con `{ model, input, stream: false }` | **No sigue el patrón asíncrono ni el sobre `{ code, msg, data }`**: responde en la misma petición con la forma de la API de respuestas de OpenAI. El texto está en `output[].content[].text` (solo los bloques `type: "message"`) y el coste real, en `credits_consumed`. Comprobado en https://docs.kie.ai/market/chat/gpt-5-6-sol el 2026-09-27, **sin ejecutarlo**: el modelo se siembra `descubierto` y hay que ejecutarlo y marcarlo compatible antes de usarlo (ADR-0020) |

La clave viaja siempre en la cabecera `Authorization: Bearer …` y nunca en la URL. Del proveedor no se conserva su texto de error: puede repetir la clave recibida.

Parámetros de los modelos en uso, **ejecutados de verdad** (comparativa del 2026-09-27; cada modelo recibe campos distintos, así que no se generalizan):

| Modelo | Campos de la referencia | Otros parámetros | Créditos medidos | Voz |
|---|---|---|---|---|
| `nano-banana-2-lite` | `image_urls` (hasta 10) | `prompt`, `aspect_ratio` | 4 / imagen | — |
| `seedream/4.5-edit` | `image_urls` (hasta 10) | `prompt`, `aspect_ratio`, `quality: basic` | 6,5 / imagen | — |
| `gpt-image-2-5-flare-image-to-image` | **`input_urls`** (1) | `prompt`, `aspect_ratio`, `resolution` (1K, 2K, 4K) | 6 / imagen a 1K | — |
| `veo3_lite` (Veo 3.1 Lite) | `image_urls` (1 o 2) | `prompt`, `generation_type` (`TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`), `aspect_ratio`, `duration` numérico (4, 6, 8), `resolution` (`720p`, `1080p`) | 60 / clip de 4 s | Sí |
| `hailuo/2-3-image-to-video-standard` | **`image_url`** (texto, 1) | `prompt`, `duration` en texto («6», «10»), `resolution` (`768P`, `1080P`); **no acepta `aspect_ratio`** (toma el de la imagen) | 30 / clip de 6 s | **No** |
| `kling/v3-turbo-image-to-video` | `image_urls` (1), **solo JPEG o PNG** | `prompt`, `duration` en texto, `resolution` (`720p`) | 72 / clip de 4 s | Sí |

Escenara usa el catálogo de `/admin/modelos` para todo esto: los parámetros de la tabla son los que están sembrados en `apps/web/src/server/proveedores/catalogo.json`, y el precio vigente vive en `model_prices` con su fuente y su fecha.

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
