# PRD Plataforma abierta de personajes y vídeo con claves propias

**Versión:** 0.5 · **Estado:** borrador para decisiones de producto · **Fecha:** 26 de septiembre de 2026

## 1. Resumen ejecutivo

Aplicación web de código abierto para crear un personaje persistente a partir de fotografías autorizadas de una persona o un animal y producir publicaciones y vídeos con ese personaje. El usuario selecciona una especialidad, un formato y una plantilla visible en botones; el asistente propone un guion y un storyboard, genera escenas, comprueba resultados y permite corregir y montar un vídeo final. Cada usuario configura sus propias credenciales de proveedores de IA. La aplicación no cobra por inferencia, aunque el proveedor elegido puede cobrar al usuario y operar la web pública, el almacenamiento y las colas tiene costes propios.

**Nombre del proyecto:** Escenara. **Descriptor:** Estudio abierto de personajes y vídeo. **Eslogan propuesto:** Da vida a cada escena. **Logotipo elegido:** Enfoque, marco abierto con chispa central. **Paleta propuesta:** azul cobalto y coral cálido en variantes clara y oscura. Los activos en ambos temas y sus tokens editables se describen en `ESCENARA_BRAND_GUIDE.md` y `escenara.brand.json`.

**Decisión de producto:** empezar con vídeos cortos de escenas encadenadas y edición humana antes de intentar generar cinco minutos de una sola vez. La continuidad de identidad y voz se valida por escena; no se promete fidelidad perfecta.

## 2. Objetivos y alcance

**Objetivos.** (1) Crear perfiles reutilizables de personas o animales con controles de consentimiento. (2) Ofrecer una experiencia guiada con presets que se pueden editar. (3) Generar clips de calidad comercial para Instagram Reels, TikTok, YouTube Shorts y composiciones de mayor duración. (4) Mantener abierta la elección de proveedor, con costes estimados y aprobación antes de cada trabajo. (5) Publicar código y documentación que permitan instalación propia.

**Usuarios:** creadores, pequeños negocios, agencias y equipos de marketing que tengan derechos sobre las imágenes y acceso a APIs compatibles. **Fuera del MVP:** publicación automática en redes, entrenamiento obligatorio de un modelo biométrico, clonación de voz predeterminada, garantías de duración o identidad perfecta y consejos médicos personalizados.

## 3. Experiencia principal

1. El usuario crea una cuenta, registra las claves de los proveedores que desea usar y comprueba capacidades y saldo cuando la API lo permita.
2. Crea un personaje de tipo **persona** o **animal**, declara derechos y consentimiento, sube imágenes y opcionalmente una muestra de voz con autorización independiente.
3. La aplicación comprueba calidad, duplicados y cobertura visual. Solicita vistas adicionales cuando faltan referencias. Genera una ficha editable con rasgos visibles, paleta, accesorios, rasgos que deben permanecer y variaciones permitidas. Las imágenes de ángulos adicionales son *referencias sintéticas*, señaladas como tales: nunca se presentan como fotografías verificadas.
4. El usuario elige especialidad, tono, audiencia, idioma, acento, plataforma, duración objetivo y plantilla mediante botones. Personaliza ropa, escenario, llamada a la acción y límites de marca.
5. El asistente produce concepto, afirmaciones por verificar, guion, lista de escenas, prompts por escena y presupuesto aproximado. El usuario aprueba antes de gastar créditos.
6. Se generan imágenes de referencia, pruebas cortas y escenas finales. Se revisan identidad, anatomía, lip sync si aplica, audio, objetos, texto, logos y afirmaciones sensibles. El usuario acepta, modifica o regenera cada escena.
7. Un editor monta clips, voz, música autorizada, subtítulos y transición; exporta MP4 y proyecto editable. El historial conserva prompt, versión de plantilla, proveedor, modelo, consentimiento y coste comunicado.

## 4. Catálogo inicial de botones y presets

**Especialidad:** turismo y viajes; presentación personal; producto y comercio; gastronomía; belleza y autocuidado; deporte y bienestar; consejos de salud general; educación; experiencias; mascotas y animales. **Formato:** anuncio, demostración, reseña, historia personal, tutorial, post hablado, itinerario, comparación, invitación y vídeo explicativo. **Estilo visual:** realista natural, estudio, exterior, móvil espontáneo y cinematográfico. **Vestuario:** casual, semiformal, deportivo, moderno, profesional y variante personalizada; para animales, accesorios opcionales adecuados, sin aplicar presets de ropa humana por defecto. **Duración:** escena breve, reel de 15 a 60 segundos y composición multiescena con duración objetivo editable. **Acción:** habla a cámara, camina, muestra un producto, hace un recorrido o narra sobre imágenes.

Cada botón abre un formulario pequeño con campos necesarios, previsualización del prompt y opción de editarlo. Ejemplo de plantilla **Anuncio de producto**: objetivo, audiencia, beneficio comprobable, producto, entorno, toma, acción, texto hablado, CTA, formato, restricciones, referencias del personaje y referencias del producto. Los prompts se almacenan versionados como plantillas con variables tipadas, ejemplos, validación y traducciones; ninguna plantilla contiene una clave ni información privada.

### Estructura de prompt por escena

`identidad del personaje + referencia(s) autorizadas + acción + entorno + vestuario + encuadre y movimiento + duración y relación de aspecto + diálogo + audio + límites de continuidad + elementos prohibidos + criterios de revisión`.

El sistema adapta esta estructura al proveedor seleccionado. Separa instrucciones visuales de hechos verificables; reutiliza un dossier de personaje aprobado y una referencia de producto real cuando la escena la necesita. Para voz animal, distingue narrador externo, representación ficticia y animal real sin atribuirle palabras reales.

## 5. Requisitos funcionales y aceptación

| ID | Requisito | Criterio de aceptación del MVP |
|---|---|---|
| RF01 | Credenciales propias por usuario y proveedor | Alta, prueba, rotación y borrado; secretos cifrados en servidor; nunca vuelven íntegros al navegador. |
| RF02 | Perfil de persona o animal | Referencias, tipo, consentimiento, ficha, versión y borrado con datos derivados. |
| RF03 | Captura guiada | Indica vistas, iluminación y resolución faltantes; distingue fotos originales de vistas generadas. |
| RF04 | Presets de creación | Botones para al menos seis especialidades, cuatro formatos y cinco looks; todos editables. |
| RF05 | Planificación | Guion y storyboard editables; muestra escenas, proveedor, límites y estimación antes de ejecutar. |
| RF06 | Generación y reintento | Trabajos asíncronos con progreso, cancelación cuando sea viable y regeneración de una sola escena. |
| RF07 | Control de continuidad | Comparación de referencias y revisión humana; bloquea exportación automática si falla una comprobación crítica. |
| RF08 | Montaje | Ordenar, recortar, subtitular, poner voz/música autorizada y exportar 9:16; conservar proyecto editable. |
| RF09 | Historial y portabilidad | Exportar proyecto, assets y metadatos sin incluir claves; borrar proyectos y personajes. |
| RF10 | Seguridad y derechos | Confirmación de derechos, control de uso por personaje y prohibición de suplantación no consentida. |
| RF11 | Catálogo de modelos | Conectar KIE y Google; actualizar catálogo, filtrar por capacidad y mostrar disponibilidad verificada o pendiente para esa cuenta. |
| RF12 | Control previo de generación | Ninguna generación se envía si falla una regla obligatoria, falta aprobación o se supera el presupuesto autorizado. Cada freno incluye motivo y siguiente acción. |
| RF13 | Confianza y comparativas | Guardar decisión, evidencia, modelo, versión de reglas y revisión humana; comparar alternativas sin lanzar generaciones de pago por defecto. |
| RF14 | Protección del gasto | Presupuesto por proyecto y etapa, reserva atómica para trabajos concurrentes y límite de reintentos. No reenviar un trabajo cuyo cobro o estado sea desconocido. |
| RF15 | Branding editable | Logotipo, textos de marca, tipografía y tokens semánticos de ambos temas se previsualizan y versionan antes de publicarse. |
| RF16 | Preferencia de tema | Modos sistema, claro y oscuro; preferencia persistente, sin destello inicial y con contraste validado en componentes clave. |

## 6. Orquestación y elección de modelos

Un **planificador** transforma la intención en escenas y dependencias; un **enrutador** elige proveedores según capacidades, coste, idioma, referencias y límites; un **verificador** evalúa resultados con reglas deterministas, revisión visual automatizada opcional y validación humana. No se necesita un único modelo que tome todas las decisiones. Las afirmaciones sobre salud, resultados de un producto o lugares concretos requieren fuente proporcionada o contrastada y aprobación editorial. Los verificadores automatizados pueden equivocarse: el resultado se presenta como señal, no como garantía.

**Jev y Laya:** son modelos de decisiones tipadas, no generadores de imágenes, guiones o vídeo. TypeSafe Jev responde por API a preguntas `choice`, `score` y `noul` con valores estructurados y probabilidades. Laya ofrece el mismo patrón, pesos bajo Apache 2.0, ejecución Python autoalojada y ajuste fino con ejemplos del dominio. Laya documenta también un servidor compatible con el contrato HTTP de Jev, lo que permite una interfaz común con adaptadores separados. En ambos casos, dividir juicios complejos en preguntas pequeñas; las probabilidades requieren calibración y evaluación en nuestros propios datos. No asumir que uno supera al otro: comparar en un conjunto etiquetado de escenas y proyectos. El checkpoint base de Laya reconoce limitaciones de precisión sin ajuste fino; su checkpoint especializado publicado se entrenó para otros flujos y no acredita calidad para este producto.

**Aplicación concreta de las decisiones:** escoger plantilla según briefing; detectar si faltan referencias; clasificar categoría y nivel de revisión; puntuar claridad del guion o coherencia de metadatos; recomendar proveedor según criterios explícitos; enviar a revisión humana escenas dudosas. Los modelos reciben estado textual o JSON, por ejemplo una descripción o el informe de un analizador multimodal. No ven ni verifican por sí solos la identidad visual en fotogramas: esa señal necesita un componente visual y revisión humana. Precio, consentimiento, límites técnicos y políticas se comprueban con reglas deterministas, no con una probabilidad del modelo.

**Stack de IA propuesto:** Python con API de servicio, LangGraph para flujos persistentes, reanudación y aprobaciones humanas; LangChain solo donde simplifique integraciones concretas. Versionar plantillas, ejecuciones, resultados y etiquetas humanas en PostgreSQL. Evaluar primero prompts y reglas con un conjunto de pruebas; después entrenar o calibrar una versión de Laya exclusivamente con ejemplos consentidos del dominio, separando conjuntos de entrenamiento, validación y prueba. Jev queda como alternativa API y como punto de comparación, sin dar por hecho que el usuario pueda ajustar sus pesos.

**Proveedores confirmados para la primera integración:** KIE.ai como agregador y Google mediante API directa, cada uno con las credenciales del usuario. Seleccionar sus modelos concretos tras pruebas de referencias, continuidad, voz, coste efectivo y estabilidad. LTX y otros proveedores podrán incorporarse mediante adaptadores. Cada capacidad tiene proveedor configurable y la interfaz muestra quién procesará los archivos. Un modelo autoalojado como Laya consume recursos del operador, aunque no tenga un coste por token del proveedor.

**Adaptadores iniciales a estudiar:** Google Veo permite referencias visuales y extensión en su API; LTX documenta imagen a vídeo y ofrece código/modelos abiertos; Kling ofrece API de imagen a vídeo. La compatibilidad real, términos, regiones, precios y límites se verifican al implementar. Un modelo de código abierto puede exigir GPU y no convierte la ejecución en gratuita.

### Catálogo y descubrimiento de modelos

Al conectar un proveedor, consultar su catálogo por API cuando exista y completar metadatos con un registro mantenido y versionado. Gemini API documenta `models.list` y métodos de generación admitidos; esa lista no cubre por sí sola todos los productos de Google ni confirma todos los permisos de una cuenta. La documentación de KIE remite a su Market y páginas de modelos: no presuponer un endpoint universal de descubrimiento hasta verificarlo. Ante ausencia de listado, usar el registro del adaptador con fecha y fuente de verificación.

Cada entrada identifica proveedor, ID y versión del modelo, capacidades, entradas y formatos, referencias máximas, resoluciones, duraciones, audio, coste/unidad/moneda, fecha del precio, disponibilidad por cuenta y estado de integración. Distinguir descubierto, compatible, validado y retirado. Un modelo nuevo permanece pendiente hasta comprobar su esquema y adaptador; añadir un nombre al catálogo no habilita su ejecución automáticamente. Actualizar al conectar, bajo petición y periódicamente con caché; conservar versión y parámetros de los proyectos existentes. Las comprobaciones que generen contenido o consuman créditos requieren presupuesto autorizado.

### Controles de calidad antes de gastar créditos

Objetivo: reducir fallos previsibles y coste por escena aceptada. La confianza de una clasificación no equivale a la probabilidad de obtener un vídeo perfecto. La interfaz no mostrará promesas de efectividad del 100 % ni porcentajes de éxito sin validación propia.

| Control | Evidencia | Comportamiento |
|---|---|---|
| Requisitos obligatorios | Credenciales, permisos, archivos válidos, capacidades, presupuesto y consentimiento registrado | Bloquear el envío hasta corregir; las salidas de IA no anulan estas reglas. |
| Preparación del personaje | Calidad de fotos, cobertura de vistas y referencias aprobadas | Solicitar referencias concretas o proponer una escena viable con las disponibles. |
| Preparación de la escena | Guion, duración, acciones, vestuario y continuidad | Detectar contradicciones y proponer cambios antes de la generación. |
| Selección del modelo | Capacidades comprobadas y resultados históricos del mismo tipo de escena | Mostrar alternativas compatibles, coste aproximado y evidencia de calidad. |
| Incertidumbre | Desacuerdo, evidencia insuficiente, entrada fuera de los casos evaluados o confianza baja | Pausar, pedir información o revisión humana; segunda evaluación solo dentro del presupuesto. |
| Resultado generado | Informe visual y de audio, requisitos y aprobación humana | Aceptar, corregir o regenerar solo la escena afectada; detener escalado si falla la prueba. |

Estados visibles: **Listo para generar**, **Necesita ajustes**, **Requiere revisión** y **Bloqueado por un requisito**. Mostrar motivo y una acción concreta, como «añade una foto de perfil» o «divide este plano en dos». Una objeción estética puede aceptarla explícitamente el usuario dentro de su presupuesto; un requisito técnico, de permisos o de gasto sigue bloqueando la ejecución. Estar listo habilita la generación: no sustituye la autorización del gasto.

### Función de Jev y Laya en la fiabilidad

LangGraph coordina estados y revisiones. Jev o Laya resuelven preguntas pequeñas sobre el briefing, metadatos e informes disponibles. El evaluador multimodal aporta observaciones de imágenes y vídeo con evidencia; el motor de reglas combina esas observaciones y las decisiones tipadas. No promediar puntuaciones distintas para ocultar un fallo crítico ni tratar la coincidencia de dos modelos como prueba de verdad.

En Jev, `confidence` resume la forma de la distribución de respuestas de Choice y Score; no es una tasa de acierto comprobada y Noul no devuelve ese campo. Definir umbrales por pregunta, idioma, modelo y consecuencia, calibrados contra etiquetas humanas. No fijar una frontera universal de 0,8 o 0,9 como garantía. Si no hay datos suficientes, mantener revisión humana. Para Laya, verificar calibración en el dominio y los límites del checkpoint elegido antes de automatizar decisiones.

Empezar con evaluaciones en paralelo al flujo habitual, sin bloquear por sus resultados experimentales. Medir falsos permisos, bloqueos innecesarios y coste de evaluación. Activar progresivamente los controles que alcancen los objetivos acordados. Comparar Jev y Laya en un conjunto retenido con los mismos estados y etiquetas; reservar consultas a ambos para pruebas o casos ambiguos, evitando duplicar el coste en todas las operaciones.

### Presupuesto y prevención de regeneraciones innecesarias

El presupuesto incluye planificación, decisiones externas, análisis visual, imágenes, vídeo, audio, pruebas y reintentos. Las comparativas de catálogo y resultados históricos no lanzan nuevas generaciones. Una comparación A/B con contenido nuevo informa cuántas ejecuciones realizará y su coste antes de aprobarla. Una prueba breve solo se ofrece si el proveedor la admite y su coste compensa la información que aporta; aprobar un fotograma no garantiza continuidad temporal.

Reservar de forma atómica el coste máximo estimable de cada trabajo antes de enviarlo, incluyendo los que ya están en curso. Reconciliar con el gasto comunicado y conservar estimaciones como tales cuando no haya importe definitivo. Si no se puede acotar el coste, pausar para que el usuario establezca un límite viable o elija otra configuración. Este límite protege las solicitudes de nuestra aplicación; no limita consumos de la misma clave en otros servicios ni sustituye los límites de facturación del proveedor.

Por defecto no habrá reintentos de pago automáticos. Permitir un número y presupuesto explícitos por escena. Tras un timeout, consultar el ID y estado existentes antes de reenviar; si no puede reconciliarse, pasar a revisión. Reutilizar resultados aprobados y registrar qué cambió antes de una regeneración. Un cambio de proveedor requiere credencial propia, reevaluar precio y compatibilidad, y autorización para enviarle los archivos; no usar automáticamente una clave global de la plataforma.

Conservar en cada decisión el estado y versiones evaluadas, evidencias, distribución/puntuación, umbral, reglas activadas, acción, coste y corrección humana. Cualquier cambio de personaje, escena, modelo o precio invalida la aprobación afectada y recalcula las comprobaciones antes del siguiente gasto.

## 7. Arquitectura propuesta

- **Web:** Next.js con interfaz accesible para asistente, biblioteca de personajes, editor de escenas y configuración. La elección final de framework queda abierta si el equipo ya dispone de otra base.
- **Identidad visual:** sistema de tokens semánticos para temas claro y oscuro, logotipos vectoriales, fuentes autoalojadas y configuración de despliegue versionada; el kit visual opcional de cada creador para exportaciones se mantiene separado de la marca de Escenara.
- **API:** backend con autorización por usuario y proyecto, validación de entradas, adaptadores de proveedores y límites de consumo por cuenta.
- **Ejecución:** cola persistente y workers independientes para imágenes, vídeo, transcripción, subtítulos y montaje con FFmpeg; estado de trabajo y reintentos idempotentes.
- **Decisiones:** servicio Python con LangGraph, interfaz de decisiones tipadas para Jev o Laya y registro de puntuaciones, umbrales, versiones y aprobaciones humanas.
- **Datos:** PostgreSQL para cuentas, personajes, consentimiento, plantillas y trabajos; almacenamiento de objetos compatible con S3 para assets; URLs de acceso temporales.
- **Entorno local:** la aplicación web se sirve siempre en `http://localhost:3021` y PostgreSQL escucha en el puerto `5421` del host (Docker, `5432` dentro del contenedor). Si un puerto está ocupado, se identifica y detiene el proceso que lo usa; nunca se cambia a otro puerto.
- **Secretos:** cifrado en reposo con clave de servidor o gestor de secretos, permisos mínimos, rotación y exclusión de logs. Las llamadas sensibles se hacen en backend. Modo local opcional con secretos guardados por el operador.
- **Portabilidad:** contrato de adaptador por capacidades (`image_edit`, `image_to_video`, `text_to_video`, `tts`, `speech_to_text`, `multimodal_review`); pruebas de contrato y capacidades detectadas por proveedor.
- **Licencia:** escoger explícitamente licencia OSI antes de publicar. Apache 2.0 o AGPL 3.0 son candidatas según prioridad entre adopción e intercambio de mejoras de servicios alojados. Revisar licencias separadas de modelos y recursos.

**Entidades principales:** User, ProviderCredential, Character, ConsentRecord, ReferenceAsset, CharacterVersion, PromptTemplate, Project, Scene, GenerationJob, ReviewResult, Export y UsageLedger. El `UsageLedger` registra estimación y gasto reportado, nunca presupone precios fijos.

## 8. Privacidad, confianza y límites de contenido

Las fotos de rostro y voz son datos especialmente delicados: consentimiento verificable para terceros, permisos de uso comerciales, control de acceso y eliminación de derivados. Prohibir menores como avatares en el MVP; bloquear desnudez sexual, acoso, engaño de identidad y respaldo falso de personas reales. Para personajes de apariencia real, facilitar etiqueta de contenido sintético y registro de procedencia cuando la plataforma de destino lo permita. Una sugerencia de salud debe ser informativa, revisable y sin promesas de diagnóstico o curación. Si el producto se despliega en España o la UE, hacer evaluación jurídica específica de RGPD, imagen, publicidad y normativa de IA antes del lanzamiento; el PRD no sustituye esa revisión.

La modalidad BYOK evita subvencionar el consumo de IA, pero exige límites por trabajo, confirmación de gasto, presupuesto máximo, cuotas de uso, protección contra SSRF en URLs externas y control de credenciales. El usuario recibe el coste estimado por escenas y puede elegir proveedor antes de confirmar.

## 9. Calidad y métricas

**Aceptación de piloto:** 10 creadores completan un personaje y un reel sin ayuda; al menos 80 % de escenas aceptadas tras un máximo de dos reintentos; cero exposición de claves en logs o cliente; exportación y borrado comprobados. Estas cifras son objetivos de prueba, no resultados ni promesas del modelo. Medir además tiempo hasta primer vídeo, coste por segundo aceptado, continuidad percibida de identidad/voz, tasa de errores anatómicos y sincronía, tasa de afirmaciones corregidas y abandono por etapa. Revisar por separado persona y animal, así como idiomas y tonos de piel.

**Validación de los controles de gasto:** comprobar que una credencial inválida, formato incompatible o presupuesto insuficiente impiden enviar la generación; que dos trabajos concurrentes no reservan el mismo saldo presupuestado; que un timeout no provoca automáticamente un segundo cobro; y que una escena modificada pierde su aprobación anterior. Comparar coste total por segundo aceptado con y sin evaluación, incluyendo el coste del evaluador. Medir calibración, fallos que se dejaron pasar y escenas válidas detenidas. Ampliar las 20 escenas del prototipo con datos etiquetados representativos antes de considerar fiables los umbrales; el prototipo solo valida viabilidad.

## 10. Entregas

**Fase 0, prototipo técnico:** probar dos proveedores y 20 escenas con 2 personajes humanos consentidos y 1 animal; validar referencias, costes reales, voz y montaje.

**MVP:** BYOK, perfiles, presets iniciales, guion y aprobación, clips, revisión manual, montaje vertical y exportación. Uno o dos adaptadores probados de extremo a extremo.

**V1:** biblioteca de versiones, más proveedores, comparación de resultados, plantillas compartibles, formato horizontal y proyectos de varios minutos por escenas.

**Branding antes del lanzamiento:** revisar el wordmark en sistemas sin la fuente, simplificar el favicon a 16 px, previsualizar ambos temas con datos reales y comprobar contraste y foco en todos los estados. El nombre seleccionado es Escenara; verificar marcas, dominios y cuentas antes de registrarlo o publicarlo como identidad definitiva.

**Posterior:** colaboración de equipos, localización, publicación autorizada en plataformas y ejecución autoalojada con modelos abiertos si el hardware lo permite.

## 11. Decisiones pendientes

1. Validar modelos concretos, tarifas y condiciones de KIE.ai y Google mediante pruebas reales; ambos proveedores quedan confirmados para la primera integración.
2. Escoger licencia y política de contribuciones del repositorio.
3. Definir si el lanzamiento prioritario será autoalojado o también habrá instancia pública mantenida por el proyecto.
4. Fijar, tras un benchmark propio, qué decisiones usará Laya, Jev o reglas y el presupuesto máximo por vídeo.
5. Elegir condiciones para clonación de voz, avatares de terceros y publicación automatizada en fases futuras.

## 12. Referencias de investigación

- Google Gemini API, generación de vídeo Veo: https://ai.google.dev/gemini-api/docs/veo
- LTX, documentación de imagen a vídeo: https://docs.ltx.io/api-documentation/api-reference/video-generation/image-to-video
- Lightricks, repositorio oficial LTX Video: https://github.com/Lightricks/LTX-Video
- Kling AI, documentación de imagen a vídeo: https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy
- OWASP, gestión de claves: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- Laya, ficha del modelo y límites publicados: https://huggingface.co/convaiinnovations/laya
- TypeSafe, introducción a Jev: https://docs.typesafe.ai/introduction
- LangGraph, visión general: https://docs.langchain.com/oss/python/langgraph/overview
- KIE.ai, catálogo: https://kie.ai/
- KIE.ai, documentación de integración: https://docs.kie.ai/
- Google Gemini API, listado de modelos: https://ai.google.dev/api/models
- TypeSafe, significado de confianza y umbrales: https://docs.typesafe.ai/confidence

Las funciones y condiciones de terceros cambian. Las referencias son punto de partida para validar la integración, no una garantía contractual.
