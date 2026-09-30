# Documentación de Escenara

**Escenara** · Estudio abierto de personajes y vídeo · «Da vida a cada escena»

Mapa de la documentación pública del proyecto. Versión actual: **0.37.0**. Para instalar y contribuir, empieza por el [README](../README.md) y la [guía de contribución](../CONTRIBUTING.md).

## Mapa de documentos

| Área | Documento | Contenido | Estado |
|---|---|---|---|
| Producto | [PRD](PRD_Plataforma_Open_Source_Avatares_Video_BYOK.md) | Requisitos, alcance, orquestación, arquitectura y entregas | Borrador 0.5 |
| Marca | [Guía de identidad](branding/ESCENARA_BRAND_GUIDE.md) | Nombre, voz, logotipos, paleta, tipografía y movimiento | 0.45.0 |
| Marca | [Tokens de marca](branding/escenara.brand.json) | Tokens de referencia de ambos temas: la marca de Escenara y el esquema de la marca de cada instalación, que puede diferir (Admin › Marca) | 0.42.0 |
| Diseño | [Dirección visual «Escenario»](diseno/direccion-visual-escenario.md) | Capa vibrante, parallax, animación, componentes de creador y zonas de claridad | Propuesta marca 0.5.0 |
| Arquitectura | [Visión de arquitectura](arquitectura/vision-arquitectura.md) | Componentes, flujo de generación, entidades y pila propuesta | Propuesta |
| Guías | [Web de documentación](procesos/desplegar-documentacion-easypanel.md) | Las guías de `guias/` publicadas como web con buscador y tema claro y oscuro: `bun run docs:dev` (puerto 3022). El orden, los títulos y qué se publica salen de [guias/indice.json](guias/indice.json) | 0.32.1 |
| Guías | [Configurar la API de cada proveedor](guias/configurar-la-api-de-cada-proveedor.md) | Dónde se consigue cada clave, dónde se guarda (Tu cuenta o Admin › Ajustes) y cómo se comprueba sin gastar | 0.32.1 |
| Guías | [Dar de alta un modelo](guias/dar-de-alta-un-modelo.md) | Cómo entra un modelo en el catálogo, sus estados, el precio con fuente y fecha, la variante, el predeterminado y la recomendación de la instalación | 0.32.1 |
| Guías | [Tu primer vídeo](guias/tu-primer-video.md) | Generar un fotograma y un clip de 4 s con tu clave de KIE, y qué hacen las alertas cuando falta algo | 0.36.0 |
| Guías | [Crear un personaje](guias/crear-un-personaje.md) | Personaje con sus fotos de referencia, consentimiento, revocación y borrado con derivados | 0.13.0 |
| Guías | [Buenas referencias](guias/buenas-referencias.md) | Captura guiada, vistas que cubrir, control de calidad y vistas generadas | 0.14.0 |
| Guías | [La ficha y las versiones de un personaje](guias/ficha-y-versiones-de-personaje.md) | Ficha como contexto de generación, versiones, aprobaciones invalidadas y hoja de personaje | 0.15.0 |
| Guías | [Presets y plantillas](guias/presets-y-plantillas.md) | Crear con botones, previsualización y edición del prompt final, y el catálogo de presets del admin, con el ejemplo de cada plantilla | 0.42.1 |
| Guías | [El asistente de guion](guias/asistente-de-guion.md) | Proyectos, guion por escenas, afirmaciones por verificar y aprobación del plan con su coste | 0.17.0 |
| Guías | [Por qué no puedo generar](guias/por-que-no-puedo-generar.md) | Los cuatro estados de los controles previos, cada motivo y cómo se arregla, qué probar cuando el proveedor acepta el trabajo y no lo termina (por ejemplo, su filtro de seguridad lo bloquea) y cómo son las alertas de bloqueo, error y aviso | 0.36.0 |
| Guías | [Producir tu proyecto](guias/producir-tu-proyecto.md) | Rejilla de producción, etapas reales, zonas seguras, cancelación con «se cobrará», reintentos autorizados, la alerta de lo que falta antes de pagar y las versiones de cada escena | 0.41.0 |
| Guías | [Revisar la continuidad](guias/revisar-la-continuidad.md) | Comparación del clip con la hoja de personaje, comprobaciones técnicas con FFmpeg, qué NO garantizan y qué bloquea exportar | 0.20.0 |
| Guías | [Voz y subtítulos](guias/voz-y-subtitulos.md) | Modo de voz del proyecto, muestras cacheadas, invalidación al cambiar de voz, editor de subtítulos y exportación a SRT/WebVTT | 0.21.0 |
| Guías | [Dirigir tu clip](guias/dirigir-tu-clip.md) | Las seis partes de la dirección (formato, plano y ángulo, cámara, micro-acción con su momento, guion, voz y acento), el método 6C del fotograma (el sitio con un lugar), partir de una foto de referencia y el modo «cambiar solo…» | 0.37.0 |
| Guías | [Presentar un producto](guias/productos.md) | Dar de alta un producto con sus fotos por papel, elegirlo y qué se hace con él (incluidas moda y piel), cuántas fotos del producto viajan y cuáles, el producto digital en tres pasos, el cupo a tres bandas con un lugar, lo que se avisa antes de pagar y qué pasa al borrarlo | 0.37.0 |
| Guías | [Lugares](guias/lugares.md) | Un sitio poco conocido como escenario: fotos y maestra, versiones, declaración de derechos, qué hacer si sale gente (retirar personas, nunca pixelar, menores nunca), lugares famosos por su nombre, mascotas y caricaturas, lugar del proyecto y de la escena, plano del lugar solo y podcast con el mismo set | 0.37.0 |
| Guías | [La estrategia del anuncio](guias/estrategia-del-anuncio.md) | Las tres palancas (ángulo, oferta y creatividad), el brief por proyecto con un solo ángulo de los doce, la oferta reutilizable, los cinco hooks, las variantes por ángulo y el veredicto del ángulo en sombra | 0.27.0 |
| Guías | [Podcast y dualcast](guias/podcast-y-dualcast.md) | Reparto de dos personajes, diálogo por turnos, el mismo lugar en los dos clips, coste por clip, consentimiento de cada persona y límites observados | 0.37.0 |
| Guías | [Cantar con tu audio](guias/cantar-con-audio-propio.md) | Elegir audio propio, declarar derechos, comprobar retrato vertical y confirmar el coste por segundo | 0.29.0 |
| Guías | [Usar y administrar trends](guias/trends-virales.md) | Selector de formatos vigentes, vista previa y coste; alta, versión, caducidad y duplicado desde el admin, con el ejemplo de cada trend | 0.42.1 |
| Guías | [Crear un personaje animado](guias/personajes-animados.md) | Tres acabados editables, guía de estilo, retrato maestro, herencia en escenas y coste | 0.31.0 |
| Guías | [Montar y exportar tu vídeo](guias/montaje-y-exportacion.md) | La línea de tiempo simple (orden, recorte y zonas seguras), la mezcla de voz y música, los subtítulos quemados o adjuntos, la etiqueta de contenido sintético obligatoria, el guardado con versión y la exportación del MP4 en cada formato sin créditos | 0.41.0 |
| Guías | [Formatos y proyectos largos](guias/formatos-y-proyectos-largos.md) | Para qué plataforma es la pieza, el mismo montaje en 9:16, 4:5, 1:1 y 16:9 con encuadre por escena y sin regenerar, 30 escenas y 5 minutos, las versiones de cada escena, la cuota y lo que cuesta cada cosa | 0.41.0 |
| Guías | [Tu kit de marca](guias/tu-kit-de-marca.md) | Tu logotipo en una esquina de tus exportaciones, la regla que impide tapar la etiqueta y qué kit lleva cada vídeo | 0.42.0 |
| Guías | [De Crear a un proyecto](guias/de-crear-a-un-proyecto.md) | Convertir un clip de Crear en un proyecto de una escena que lo reutiliza sin volver a pagarlo, lo que el proyecto vuelve a pedir, quitar la voz del clip o ponerle voz en off, y montarlo | 0.35.0 |
| Procesos | [Recorridos de referencia 0.29–0.32](procesos/recorridos-de-referencia-0.29-0.32.md) | Registro de las pruebas de aceptación: proyectos conservados en la cuenta de administración, decisiones, costes y resultados medidos | En revisión |
| Guías | [Escenas habladas](guias/escenas-habladas.md) | El modo Omni, sus dos motores (Gemini Omni Flash recomendado y MiniMax H3), qué registrar, qué cuesta cada escena y qué invalida cambiar la voz | 0.22.0 |
| Guías | [Personajes inventados](guias/personajes-inventados.md) | Un personaje que no existe: descripción, cuatro retratos candidatos, declaración de que no representa a nadie y por qué no admite fotos reales | 0.22.0 |
| Guías | [Con qué se genera cada cosa](guias/mapa-de-modelos.md) | El mapa de modelos por tipo, cuándo se pasa a la reserva, qué cuesta cada opción y cómo añadir servicios compatibles con la API de OpenAI | 0.21.1 |
| Guías | [Personaliza tu instancia](guias/personaliza-tu-instancia.md) | Nombre, logotipos, tipografía (con fuentes propias y su licencia) y colores de la instalación; contraste que bloquea, publicación atómica, historial y revertir | 0.45.0 |
| Guías | [Comprobar la coherencia](guias/comprobar-la-coherencia.md) | Si una vista generada es la misma persona (y entonces cuenta como referencia), si la escena cubre el guion y si la emoción encaja; qué decide y qué solo mira, qué autorización hace falta y, para quien administra, el registro de decisiones y la sombra de Jev | 0.39.0 |
| Guías | [Accesibilidad](guias/accesibilidad.md) | Lo que la aplicación garantiza (contraste AA, foco visible, teclado, lector de pantalla, «reducir movimiento»), cómo se comprueba, los atajos de teclado de cada pieza y cómo avisar de un problema | 0.45.0 |
| Arquitectura | [Decisiones (ADR)](arquitectura/decisiones/README.md) | Índice de decisiones y plantilla | Licencia, lenguaje, runtime, despliegue, almacenamiento, modelos iniciales, interfaz, base de datos, bóveda de credenciales, seguimiento de trabajos, ficha como contexto de generación, prompts en el servidor y en inglés, modelo de texto del asistente, el proyecto como unidad de trabajo, el prompt como material del servidor, el motor de reglas de controles previos y la cancelación y los reintentos de la producción decididos; 2 pendientes |
| Recursos | [APIs, proveedores y servicios](recursos/apis-y-proveedores.md) | Qué servicio, para qué, dónde se obtiene la clave, documentación y precios | Vivo |
| Recursos | [Plantilla de claves API](recursos/claves-api.plantilla.md) | Estructura del documento privado de claves | Vivo |
| Privado | `privado/claves-api.local.md` | Claves reales. **Fuera de git** (`.gitignore`) | Local |
| Legal | [Cumplimiento y privacidad](legal/cumplimiento-y-privacidad.md) | Marco normativo y controles del producto | Lista de trabajo |
| Procesos | [Flujo de versiones y ramas](procesos/flujo-versiones-y-ramas.md) | Numeración, ramas, ciclo de una versión y definición de terminado | Vigente |
| Procesos | [Desplegar la documentación en Easypanel](procesos/desplegar-documentacion-easypanel.md) | Imagen de `apps/docs`, aplicación en Easypanel, dominio `docs.escenara.com`, HTTPS y registro DNS | 0.32.1 |
| Procesos | [Medir el rendimiento](procesos/medir-el-rendimiento.md) | Objetivos (LCP, INP, CLS y JavaScript por ruta), el presupuesto que comprueba el build y cómo medir en Comet con Lighthouse y el panel de rendimiento | 0.45.0 |
| Cambios | [CHANGELOG](CHANGELOG.md) | Historial de versiones | Vivo |

## Dónde va cada cosa

- `docs/`: documentación duradera del producto, la marca, la arquitectura, los recursos y los procesos.
- `docs/privado/`: solo en local; claves y datos personales. Nunca en git.
- `docs/guias/`: guías de uso de la plataforma para quien la usa, no para quien la desarrolla. Una guía nueva se añade también a `guias/indice.json`, en su sección: solo lo que lista el índice sale en la web.
- `docs/assets/diagramas/`: diagramas SVG de las guías, con colores por variables CSS (`--dg-*`) para que se lean en tema claro y oscuro, y con `<title>` y `<desc>`.
- `docs/assets/`: imágenes y recursos de apoyo de la documentación.
- `docs/assets/capturas/`: capturas de la plataforma para la guía de usuario y el README.

## Convenciones

- Español de España; nombres de archivo en kebab-case.
- Máximo 800 líneas por documento: si crece, se divide.
- Nada de secretos en documentos versionados.
- Las propuestas no cambian el PRD ni la marca hasta que el propietario las aprueba.
