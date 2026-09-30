# Registro de decisiones de arquitectura (ADR)

Cada decisión relevante se documenta en un fichero `adr-NNNN-slug.md` dentro de esta carpeta. Un ADR aceptado no se edita: si cambia la decisión, se crea uno nuevo que lo sustituye.

## Índice

| ADR | Decisión | Necesaria para | Estado |
|---|---|---|---|
| [0001](adr-0001-licencia-agpl.md) | Licencia del repositorio: AGPL 3.0 | 0.2.0 | Aceptado |
| [0002](adr-0002-typescript-unico-mvp.md) | Lenguajes del MVP: TypeScript único | 0.2.0 | Aceptado |
| [0003](adr-0003-cola-postgresql.md) | Cola de trabajos sobre PostgreSQL con `FOR UPDATE SKIP LOCKED` | 0.12.0 | Aceptado |
| [0004](adr-0004-autenticacion-better-auth.md) | Autenticación con Better Auth | 0.7.0 | Aceptado |
| [0005](adr-0005-boveda-credenciales.md) | Bóveda de credenciales BYOK y gestión de la clave maestra | 0.9.0 | Aceptado |
| [0006](adr-0006-almacenamiento-seaweedfs.md) | Almacenamiento de objetos: SeaweedFS por defecto y API S3 estándar | 0.2.0 | Aceptado |
| 0007 | Despliegue en Easypanel e instancia pública del proyecto | 0.48.0 | Plataforma decidida (Easypanel); instancia pública pendiente del propietario |
| 0008 | Motor de montaje y render | 0.22.0 | Pendiente |
| [0009](adr-0009-modelos-iniciales-kie.md) | Modelos iniciales: solo KIE.ai (Google aplazado) | 0.10.0 | Aceptado |
| [0010](adr-0010-bun-runtime.md) | Bun como runtime, gestor de paquetes y ejecutor de tests | 0.2.0 | Aceptado |
| [0011](adr-0011-interfaz-componentes.md) | Pila de interfaz, catálogo de componentes en el admin y prohibición del `<select>` nativo | 0.4.0 | Aceptado |
| [0012](adr-0012-drizzle-orm.md) | Acceso a PostgreSQL y migraciones con Drizzle ORM | 0.5.0 | Aceptado |
| [0013](adr-0013-configuracion-en-panel.md) | La configuración se gestiona en el panel de administración | 0.8.0 | Aceptado |
| [0014](adr-0014-seguimiento-trabajos-sondeo.md) | Seguimiento de los trabajos de generación por sondeo (callback en 0.12.0) | 0.10.0 | Aceptado |
| [0015](adr-0015-contrato-adaptadores-capacidades.md) | Contrato de adaptadores por capacidades y catálogo de modelos en la base de datos | 0.11.0 | Aceptado |
| [0016](adr-0016-reserva-y-conciliacion-de-gasto.md) | Reserva y conciliación del gasto: registro de apuntes como única verdad | 0.12.0 | Aceptado |
| [0017](adr-0017-consentimiento-de-personajes.md) | Consentimiento de personajes: registro con prueba, revisión humana y borrado de derivados | 0.13.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0018](adr-0018-ficha-como-contexto-y-version-citada.md) | La ficha del personaje es contexto de generación y cada trabajo cita su versión | 0.15.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0019](adr-0019-presets-y-plantillas-de-prompt.md) | Presets y plantillas de prompt: prompts en inglés, compuestos en el servidor y con versión citada | 0.16.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0020](adr-0020-modelo-de-texto-del-asistente.md) | Modelo de texto del asistente: KIE con la clave del usuario, apagado de fábrica y texto no confiable | 0.17.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0021](adr-0021-el-proyecto-como-unidad-de-trabajo.md) | El proyecto es la unidad de trabajo y el plan aprobado, la única puerta a la producción | 0.17.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0022](adr-0022-el-prompt-es-material-del-servidor.md) | El prompt compuesto es material del servidor y del admin, no del navegador | 0.17.0 | Propuesto (decisión **firme** del propietario) |
| [0023](adr-0023-motor-de-reglas-de-controles-previos.md) | Motor de reglas de controles previos, y su precedencia sobre los modelos de decisión | 0.18.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0024](adr-0024-cancelacion-y-reintentos-de-produccion.md) | Cancelación y reintentos en la producción de escenas: nada se reenvía y nada se cancela en el proveedor | 0.19.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0025](adr-0025-voz-del-proyecto-y-transcripcion-local.md) | La voz se elige por proyecto, con ElevenLabs de reserva y cambio automático, y la transcripción es local | 0.21.0 | Propuesto (modo de voz y cambio de proveedor firmes; transcriptor y música provisionales) |
| [0026](adr-0026-mapa-de-modelos-por-tipo.md) | Cada usuario tiene una lista ordenada de con qué se genera cada tipo, con reserva automática solo si se prueba que no hubo cobro y cada coste en la moneda de su proveedor | 0.21.1 | Aceptada |
| [0027](adr-0027-personajes-inventados.md) | Un personaje inventado no tiene fotos, declara que no representa a nadie y su cara se genera entre cuatro retratos candidatos | 0.22.0 | Propuesto (existir es firme; retratos, lista de nombres y marcado provisionales) |
| [0028](adr-0028-escenas-habladas-con-identidad-registrada.md) | Las escenas habladas citan una identidad y una voz registradas en el proveedor, y el modelo sale del catálogo con Gemini Omni 1.1 Flash como recomendado | 0.22.0 | Propuesto (camino Omni firme; modo `omni` y registro por versión provisionales) |
| [0029](adr-0029-catalogo-dinamico-con-precios-publicos.md) | El catálogo se sincroniza con la tabla de precios pública del proveedor: estado «precio publicado», elegible solo si esta instalación sabe montar su entrada | 0.23.0 | Propuesto (elegir cualquier modelo con su coste delante es firme; estado, sincronización diaria y variante en el admin provisionales) |
| [0030](adr-0030-coherencia-percibir-decidir-registrar.md) | Coherencia en tres pasos (percibir con el mapa, decidir con Jev, registrar para medir); identidad activa y el resto en sombra; la cara de una persona real solo se percibe con su autorización expresa | 0.24.0 | Aceptada (identidad activa y el resto en sombra son firmes; umbrales y modelos de percepción provisionales) |
| [0031](adr-0031-composicion-del-prompt-dirigido.md) | El orden del prompt dirigido vive en el código y los textos de cada opción en el catálogo; la regla de toma única y el bloque de anclajes van siempre; con una persona real no entra ningún adjetivo de atractivo | 0.25.0 | Aceptada (las tres reglas que no se negocian son firmes; el orden de los siete bloques es provisional hasta el spike) |
| [0032](adr-0032-brief-del-anuncio-por-proyecto.md) | Un proyecto es un anuncio: el brief vive en el proyecto con **un** ángulo escalar, la oferta es una entidad reutilizable atada al producto, las variantes son proyectos hermanos y el hook es el primer turno del guion | 0.27.0 | Aceptada (el brief opcional y el ángulo único son firmes; el tope de doce variantes y los cuatro ángulos que piden declaración son provisionales) |
| [0033](adr-0033-reparto-de-dos-personajes.md) | Dos personajes por escena: podcast en dos clips o dualcast en uno, diálogo literal por turnos, consentimiento individual y confirmación del coste total | 0.28.0 | Aceptada (formatos y doble consentimiento firmes; límites de montaje y texto legal específico pendientes de revisión) |
| [0034](adr-0034-canto-con-audio-propio.md) | El usuario aporta el audio, declara sus derechos y confirma el coste por segundo antes de sincronizar el retrato | 0.29.0 | Propuesta; prueba real pendiente de aprobación |
| [0035](adr-0035-montaje-y-render-con-ffmpeg.md) | El montaje es una línea de tiempo simple con guardado explícito y versión, y el render un trabajo de FFmpeg en el worker con cola propia: sin coste, idempotente por montaje y versión, y sin exportar si no se puede dibujar la etiqueta de contenido sintético | 0.32.0 | Aceptada (el alcance del editor, el render local y la etiqueta obligatoria son firmes; la mezcla de la música, el consejo de 60 s, la falta de cancelación y no repetir una escena son provisionales) |
| [0036](adr-0036-trends-versionados.md) | El trend es una plantilla versionada con vigencia explícita; solo una copia vigente puede generar | 0.30.0 | Propuesta; cinco formatos en revisión hasta la prueba real |
| [0037](adr-0037-animados-con-identidad-maestra.md) | El estilo animado pertenece al personaje inventado, se versiona y se ancla en un retrato maestro heredado por el proyecto | 0.31.0 | Aceptada; calidad visual pendiente de prueba real |
| [0038](adr-0038-decisiones-tipadas-en-sombra.md) | Cada decisión del motor se registra con su evidencia, umbrales, puerta y acción; Jev opina en sombra sin bloquear ni verse, sin escenas con personas reales ni nombres, y se mide con la etiqueta humana de cada pregunta | 0.39.0 | Aceptada (las reglas mandan y la sombra no bloquea son firmes; las dos preguntas y la clave del operador, pendientes de revisión) |
| [0039](adr-0039-presupuestos-de-rendimiento.md) | Presupuestos de rendimiento en móvil (LCP < 2,5 s, INP < 200 ms, CLS < 0,1) y de JavaScript por ruta comprobado en el build: meta de 200 KB y topes propios medidos, con su motivo, para las rutas que hoy la superan | 0.45.0 | Aceptado (cifras recomendadas, revisables) |
| [0040](adr-0040-el-lugar-como-ancla-del-contexto.md) | El lugar es una entidad versionada con declaración de derechos cuya foto maestra entra en el fotograma (C4 = el lugar) y el clip lo hereda; cupo de referencias a tres bandas con una sola función; sin mezclar acabados; Omni combinado, experimental y apagado | 0.46.0 | Aceptado (provisionales de la fase tomadas como firmes, revisables) |
| [0041](adr-0041-exportacion-y-borrado-de-datos.md) | Exportación del proyecto en ZIP con `proyecto.json` versionado por lista blanca, preparada por el worker y con URL temporal que caduca; borrado de proyecto con sus derivados en base de datos y almacenamiento; borrado de cuenta con gracia, sesión reciente y frase; retención solo agregada y anónima | 0.47.0 | Aceptado (retención pendiente de revisión jurídica) |
| [0042](adr-0042-comparativas-y-calibracion.md) | Comparar sin generar con coste cero por construcción (candado de importaciones) y A/B de una escena por la cola normal con ejecuciones y coste confirmados; conjunto etiquetado seudónimo desde las revisiones humanas, borrado en cascada con la cuenta; umbral por pregunta elegido en calibración y medido en la partición retenida, que no activa nada; Laya aplazada hasta 200 decisiones con corrección | 0.48.0 | Aceptado (decisiones de la fase pendientes de revisión del propietario; retención pendiente de revisión jurídica) |

## Plantilla

```markdown
# ADR-NNNN · Título

- **Estado:** propuesto | aceptado | sustituido por ADR-XXXX
- **Fecha:** AAAA-MM-DD
- **Versión del proyecto:** 0.N.0

## Contexto
Qué problema hay y qué restricciones aplican.

## Opciones
Dos o tres opciones con su supuesto principal y dónde fallarían primero.

## Decisión
Qué se elige y por qué.

## Consecuencias
Qué se gana, qué se pierde y qué habrá que revisar.
```
