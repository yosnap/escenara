# Documentación de Escenara

**Escenara** · Estudio abierto de personajes y vídeo · «Da vida a cada escena»

Mapa de la documentación pública del proyecto. Versión actual: **0.18.0**. Para instalar y contribuir, empieza por el [README](../README.md) y la [guía de contribución](../CONTRIBUTING.md).

## Mapa de documentos

| Área | Documento | Contenido | Estado |
|---|---|---|---|
| Producto | [PRD](PRD_Plataforma_Open_Source_Avatares_Video_BYOK.md) | Requisitos, alcance, orquestación, arquitectura y entregas | Borrador 0.5 |
| Marca | [Guía de identidad](branding/ESCENARA_BRAND_GUIDE.md) | Nombre, voz, logotipos, paleta, tipografía y movimiento | 0.4 |
| Marca | [Tokens de marca](branding/escenara.brand.json) | Tokens editables de ambos temas | 0.4.0 |
| Diseño | [Dirección visual «Escenario»](diseno/direccion-visual-escenario.md) | Capa vibrante, parallax, animación, componentes de creador y zonas de claridad | Propuesta marca 0.5.0 |
| Arquitectura | [Visión de arquitectura](arquitectura/vision-arquitectura.md) | Componentes, flujo de generación, entidades y pila propuesta | Propuesta |
| Guías | [Tu primer vídeo](guias/tu-primer-video.md) | Generar un fotograma y un clip de 4 s con tu clave de KIE | 0.10.0 |
| Guías | [Crear un personaje](guias/crear-un-personaje.md) | Personaje con sus fotos de referencia, consentimiento, revocación y borrado con derivados | 0.13.0 |
| Guías | [Buenas referencias](guias/buenas-referencias.md) | Captura guiada, vistas que cubrir, control de calidad y vistas generadas | 0.14.0 |
| Guías | [La ficha y las versiones de un personaje](guias/ficha-y-versiones-de-personaje.md) | Ficha como contexto de generación, versiones, aprobaciones invalidadas y hoja de personaje | 0.15.0 |
| Guías | [Presets y plantillas](guias/presets-y-plantillas.md) | Crear con botones, previsualización y edición del prompt final, y el catálogo de presets del admin | 0.16.0 |
| Guías | [El asistente de guion](guias/asistente-de-guion.md) | Proyectos, guion por escenas, afirmaciones por verificar y aprobación del plan con su coste | 0.17.0 |
| Guías | [Por qué no puedo generar](guias/por-que-no-puedo-generar.md) | Los cuatro estados de los controles previos, cada motivo y cómo se arregla | 0.18.0 |
| Guías | [Producir tu proyecto](guias/producir-tu-proyecto.md) | Rejilla de producción, etapas reales, zonas seguras, cancelación con «se cobrará» y reintentos autorizados | 0.19.0 |
| Guías | [Revisar la continuidad](guias/revisar-la-continuidad.md) | Comparación del clip con la hoja de personaje, comprobaciones técnicas con FFmpeg, qué NO garantizan y qué bloquea exportar | 0.20.0 |
| Guías | [Voz y subtítulos](guias/voz-y-subtitulos.md) | Modo de voz del proyecto, muestras cacheadas, invalidación al cambiar de voz, editor de subtítulos y exportación a SRT/WebVTT | 0.21.0 |
| Guías | [Escenas habladas](guias/escenas-habladas.md) | El modo Omni, sus dos motores (Gemini Omni Flash recomendado y MiniMax H3), qué registrar, qué cuesta cada escena y qué invalida cambiar la voz | 0.22.0 |
| Guías | [Personajes inventados](guias/personajes-inventados.md) | Un personaje que no existe: descripción, cuatro retratos candidatos, declaración de que no representa a nadie y por qué no admite fotos reales | 0.22.0 |
| Guías | [Con qué se genera cada cosa](guias/mapa-de-modelos.md) | El mapa de modelos por tipo, cuándo se pasa a la reserva, qué cuesta cada opción y cómo añadir servicios compatibles con la API de OpenAI | 0.21.1 |
| Arquitectura | [Decisiones (ADR)](arquitectura/decisiones/README.md) | Índice de decisiones y plantilla | Licencia, lenguaje, runtime, despliegue, almacenamiento, modelos iniciales, interfaz, base de datos, bóveda de credenciales, seguimiento de trabajos, ficha como contexto de generación, prompts en el servidor y en inglés, modelo de texto del asistente, el proyecto como unidad de trabajo, el prompt como material del servidor, el motor de reglas de controles previos y la cancelación y los reintentos de la producción decididos; 2 pendientes |
| Recursos | [APIs, proveedores y servicios](recursos/apis-y-proveedores.md) | Qué servicio, para qué, dónde se obtiene la clave, documentación y precios | Vivo |
| Recursos | [Plantilla de claves API](recursos/claves-api.plantilla.md) | Estructura del documento privado de claves | Vivo |
| Privado | `privado/claves-api.local.md` | Claves reales. **Fuera de git** (`.gitignore`) | Local |
| Legal | [Cumplimiento y privacidad](legal/cumplimiento-y-privacidad.md) | Marco normativo y controles del producto | Lista de trabajo |
| Procesos | [Flujo de versiones y ramas](procesos/flujo-versiones-y-ramas.md) | Numeración, ramas, ciclo de una versión y definición de terminado | Vigente |
| Cambios | [CHANGELOG](CHANGELOG.md) | Historial de versiones | Vivo |

## Dónde va cada cosa

- `docs/`: documentación duradera del producto, la marca, la arquitectura, los recursos y los procesos.
- `docs/privado/`: solo en local; claves y datos personales. Nunca en git.
- `docs/guias/`: guías de uso de la plataforma para quien la usa, no para quien la desarrolla.
- `docs/assets/`: imágenes y recursos de apoyo de la documentación.
- `docs/assets/capturas/`: capturas de la plataforma para la guía de usuario y el README.

## Convenciones

- Español de España; nombres de archivo en kebab-case.
- Máximo 800 líneas por documento: si crece, se divide.
- Nada de secretos en documentos versionados.
- Las propuestas no cambian el PRD ni la marca hasta que el propietario las aprueba.
