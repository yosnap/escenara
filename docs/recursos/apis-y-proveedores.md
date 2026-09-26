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
| **Google Gemini API** | `text_generation` (guion), `image_edit` (imagen con referencias), `image_to_video` y `text_to_video` (Veo), `tts`, `speech_to_text`, `multimodal_review` | Google AI Studio → «Get API key»: https://aistudio.google.com/apikey. Veo requiere facturación activa | https://ai.google.dev/gemini-api/docs · Veo: https://ai.google.dev/gemini-api/docs/veo · Modelos: https://ai.google.dev/api/models | https://ai.google.dev/gemini-api/docs/pricing | Confirmado (PRD). Verificar restricciones regionales de generación de personas en la UE |
| **KIE.ai** | Agregador de modelos de imagen, vídeo, voz y música de varios fabricantes, con tareas asíncronas y callbacks | Panel de KIE → sección de claves API (verificar ruta exacta al darse de alta) | https://docs.kie.ai/ · Catálogo: https://kie.ai/ | Créditos por modelo; consultar el Market de KIE | Confirmado (PRD). No presuponer endpoint universal de catálogo |
| **TypeSafe Jev** | Decisiones tipadas `choice`, `score` y `noul` | Alta en TypeSafe (verificar proceso) | https://docs.typesafe.ai/introduction · Confianza: https://docs.typesafe.ai/confidence | Consultar al darse de alta | Por evaluar en 0.21.0 (modo sombra) |
| **Laya** | Decisiones tipadas autoalojadas, ajuste fino con datos del dominio | Token de Hugging Face si el modelo lo exige: https://huggingface.co/settings/tokens | https://huggingface.co/convaiinnovations/laya | Sin coste por token; consume CPU o GPU del operador | Posterior; solo con datos etiquetados |
| **LTX (Lightricks)** | `image_to_video`; modelos abiertos | Alta en la plataforma LTX (verificar) | https://docs.ltx.io/api-documentation/api-reference/video-generation/image-to-video · https://github.com/Lightricks/LTX-Video | Consultar | Posterior, por adaptador |
| **Kling AI** | `image_to_video` | Alta en la plataforma de desarrolladores de Kling (verificar); también accesible vía KIE | https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy | Consultar | Posterior o vía KIE |
| **ElevenLabs** | `tts` con voces de catálogo (sin clonación en el MVP) | https://elevenlabs.io/app/settings/api-keys | https://elevenlabs.io/docs | Consultar | Opcional, alternativa de voz |
| **Whisper / faster-whisper** | `speech_to_text` local y de código abierto | No requiere clave | https://github.com/SYSTRAN/faster-whisper | Coste de cómputo propio | Opcional, alternativa sin proveedor |

## Infraestructura y servicios del operador

| Servicio | Para qué | Local | Producción | Documentación | Estado |
|---|---|---|---|---|---|
| PostgreSQL | Datos, trabajos, presupuesto, historial | Docker Compose, puerto 5421 del host | Contenedor gestionado o servicio de base de datos | https://www.postgresql.org/docs/ | Decidido (PRD) |
| Almacenamiento S3 | Referencias, medios generados y exportaciones con URLs temporales | MinIO | Cloudflare R2 o AWS S3 | https://min.io/docs/ · https://developers.cloudflare.com/r2/ | ADR-0006 |
| Redis | Solo si la cola elegida es BullMQ | Docker Compose | Contenedor | https://redis.io/docs/ | ADR-0003 |
| Correo transaccional | Verificación de cuenta y avisos | Captura local (Mailpit) | Resend u otro | https://resend.com/docs | Pendiente |
| Easypanel | Panel de despliegue (Docker) de la instancia del proyecto: aplicaciones, bases de datos, dominios y certificados | — | Servidor propio con Easypanel | https://easypanel.io/docs | Decidido (ADR-0007) |
| GitHub | Repositorio, etiquetas y releases | — | — | https://docs.github.com/ | Pendiente de crear el remoto |
| Dominio | Portada y aplicación públicas | — | Registrador por decidir | — | Verificar disponibilidad de «Escenara» |
| C2PA | Credenciales de contenido en exportaciones | — | Librería en workers | https://c2pa.org/ | 0.19.0 / 0.28.0 |

## Variables de entorno previstas

Se documentarán en `.env.example` a partir de 0.2.0. Nombres propuestos:

| Variable | Tipo | Uso |
|---|---|---|
| `GEMINI_API_KEY` | Desarrollo | Prototipo 0.3.0 y pruebas de contrato del adaptador de Google |
| `KIE_API_KEY` | Desarrollo | Prototipo 0.3.0 y pruebas de contrato del adaptador de KIE |
| `TYPESAFE_API_KEY` | Desarrollo | Evaluación de Jev en 0.21.0 |
| `HF_TOKEN` | Desarrollo | Descarga de Laya si procede |
| `ELEVENLABS_API_KEY` | Desarrollo | Evaluación opcional de voz |
| `DATABASE_URL` | Operador | Conexión a PostgreSQL (en local, `localhost:5421`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Operador | Almacenamiento de objetos |
| `CREDENTIALS_MASTER_KEY` | Operador | Clave maestra del cifrado de credenciales BYOK |
| `AUTH_SECRET` | Operador | Firma de sesiones |
| `RESEND_API_KEY` | Operador | Correo transaccional |

## Cómo añadir un proveedor

1. Añadir su fila aquí con capacidades, documentación, precios y estado «Por evaluar».
2. Añadir su bloque en `claves-api.plantilla.md` y en el documento privado.
3. Tras verificarlo, registrar los modelos en el catálogo versionado (0.8.0) con fuente y fecha.
4. Implementar su adaptador con pruebas de contrato antes de habilitarlo.
