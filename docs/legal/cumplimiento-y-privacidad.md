# Cumplimiento, privacidad y límites de contenido

**Estado:** lista de trabajo; **no sustituye** la revisión jurídica especializada que exige el PRD (§8) antes del lanzamiento · **Versión objetivo:** 0.30.0, con controles técnicos repartidos en versiones anteriores

## Marco a revisar

| Ámbito | Qué comprobar | Versión |
|---|---|---|
| RGPD y LOPDGDD | Base jurídica, consentimiento explícito para fotos de rostro y voz, evaluación de impacto (EIPD), encargados del tratamiento (proveedores de IA con claves del usuario), transferencias internacionales, derechos de acceso y supresión | 0.12.0 y 0.30.0 |
| Derecho a la propia imagen (LO 1/1982) | Consentimiento del titular para uso comercial de su imagen y voz; revocación | 0.12.0 |
| Reglamento de IA de la UE, art. 50 | Transparencia del contenido sintético y deepfakes: aplicable desde el 2 de agosto de 2026 según el calendario original. Comprobar el estado del paquete «Omnibus digital» y de la normativa española de etiquetado | 0.21.0 y 0.30.0 |
| Publicidad | Afirmaciones sobre productos, salud y lugares con fuente y aprobación editorial; identificación de contenido publicitario | 0.16.0 |
| Términos de proveedores | Políticas de uso de Google, KIE y cada modelo; restricciones regionales de generación de personas | 0.3.0 y 0.10.0 |
| Licencias | Licencia del repositorio: AGPL 3.0 (ADR-0001); licencias de modelos, fuentes (Manrope, OFL), música y recursos | 0.2.0 y 0.31.0 |
| Marca y nombre | Disponibilidad de «Escenara» en OEPM y EUIPO, dominios y cuentas | Antes de 0.6.0 |

## Controles del producto

- [x] Declaración de derechos y consentimiento antes de usar cualquier personaje (RF10). **0.13.0**: registro de consentimiento con titular, alcance de uso, fecha y cuenta; sin consentimiento vigente el personaje no genera nada, y la comprobación está en el servidor, no en la interfaz.
- [x] **Dos personas reales en la misma escena (0.28.0)**: hacen falta dos consentimientos vigentes, uno por cada personaje. La puerta del servidor comprueba ambos y la pantalla nombra a quien le falte. **Criterio provisional**: basta el consentimiento individual de 0.13.0 para cada persona; aún no hay texto adicional específico sobre aparecer conversando con otra. Antes de publicar una política definitiva debe revisarse ese alcance con asesoramiento jurídico. Un personaje inventado aporta su declaración de personaje inventado y la persona real su consentimiento.
- [ ] Autorización de voz independiente de la de imagen. *(0.13.0 registra el alcance de uso —personal o comercial— aparte de la imagen; la voz llega con la clonación de voz.)*
- [x] Prohibición de menores como avatar: declaración, filtros del proveedor y moderación. Es un control, no una garantía. **0.13.0**: la declaración de mayoría de edad es obligatoria para registrar el consentimiento y, sin registro, el personaje queda bloqueado. Ver el aviso de alcance más abajo.
- [ ] Bloqueo de desnudez sexual, acoso, suplantación y respaldo falso de personas reales.
- [x] Terceros solo con documento de consentimiento y revisión; nunca publicables en la comunidad. **0.13.0**: el titular «otra persona» exige un documento firmado subido y el personaje queda en revisión hasta que un administrador lo acepta (ADR-0017). La comunidad llega en 0.28.0 y estos personajes no se publicarán.
- [x] Borrado de personaje con todos sus derivados. **0.13.0**: borra el personaje, su consentimiento, sus relaciones con las fotos y los medios generados con él, fila y objeto del almacenamiento, con registro de las claves borradas. Las fotos de referencia se conservan en la biblioteca del usuario a propósito (son suyas y pueden estar en otro personaje). Escenas y exportaciones aún no existen: se añadirán al mismo borrado cuando lleguen.
- [ ] Etiqueta visible de contenido sintético en todas las exportaciones, incluidas las totalmente animadas (0.31.0). C2PA sigue pendiente de 0.46.0.
- [ ] Sugerencias de salud informativas, revisables y sin promesas de diagnóstico ni curación.
- [x] Aviso de qué proveedor procesará los archivos **y los textos** antes de enviarlos. **0.17.0**: el formulario de consentimiento dice que al generar con ese personaje se envían a KIE sus fotos **y el texto de su ficha** (rasgos, estilo, vestuario, personalidad y descripción), que forma parte del prompt; y que si la instalación traduce los prompts al inglés, ese texto pasa además por el **modelo de texto** de KIE. La zona de coste de «Crear» dice lo mismo antes de gastar.
- [ ] Credenciales cifradas, excluidas de logs y nunca devueltas íntegras al navegador.
- [ ] Protección contra SSRF en URLs externas y límites de uso por cuenta.

## Alcance real del control de menores y de identidad (0.13.0)

Escrito aquí para no repetirlo con eufemismos en cada pantalla:

- **Escenara no comprueba la edad de nadie.** No existe detección de edad fiable y no se usa ninguna. Lo que hay es una **declaración obligatoria** de mayoría de edad, guardada con la cuenta que la hizo y su fecha, más el bloqueo del personaje si falta. Es un **control de producto y una trazabilidad de la declaración**, no una verificación ni una garantía.
- **Escenara no comprueba la identidad de nadie.** Para la imagen de un tercero exige un documento de consentimiento firmado y una **revisión humana** de quien administra la instalación. Esa revisión valora el documento; no autentica al firmante ni verifica que sea quien dice ser.
- **Lo que sí se puede demostrar** es qué se declaró, quién lo declaró, cuándo, con qué alcance de uso, quién lo revisó y cuándo se revocó. Los registros revocados no se borran por eso mismo.
- **Riesgos que quedan abiertos** y que esta versión no cierra: una declaración falsa, un documento falsificado, un personaje creado a partir de fotos obtenidas sin permiso, y la moderación de lo ya generado. Se mitigan en 0.28.0 (moderación de comunidad) y con los filtros de contenido de los propios proveedores. Cualquier texto público del producto debe describir estos controles como controles, sin dar a entender verificación.
- **Datos personales implicados**: fotos de rostro, documentos de consentimiento firmados y **el texto de la ficha** del personaje. Las **fotos solo las ve su dueño**: no salen en ninguna respuesta dirigida a otra persona, tampoco a quien administra. Del documento de un tercero, quien administra ve únicamente ese documento, en `/admin/personajes`, y **cada acceso queda registrado** (quién, cuándo, qué personaje y qué hizo) en `consent_access_log`. Ni los documentos ni las fotos de referencia aparecen en la biblioteca de administración (`/admin/medios`): para quien no es su dueño responden como si no existieran. A los documentos se les quitan los metadatos al guardarlos, **incluida la localización** de la foto, sin recomprimir la imagen. Se sirven con URL temporales firmadas que caducan y no aparecen en ningún registro del servidor. Antes del lanzamiento hay que reflejar este tratamiento (y el plazo de conservación de los documentos) en la política de privacidad y en la EIPD.

## El texto de la ficha también sale hacia el proveedor (0.17.0)

La ficha de un personaje (rasgos, estilo, vestuario, personalidad y descripción) **no es solo archivo**: desde la
0.15.0 entra en el prompt de cada fotograma y de cada clip, así que **se procesa en KIE** igual que sus fotos. Y
desde la 0.17.0, si la instalación tiene encendida la traducción de los prompts al inglés (decisión firme del
propietario, ADR-0020), ese texto pasa **además** por el modelo de texto de KIE.

Consecuencias que hay que sostener:

- **se dice antes de consentir**: el formulario de consentimiento lo enuncia, y no solo para las fotos;
- **la traducción de una ficha se guarda con la cuenta de su dueño**, nunca en una caché común: es la descripción
  de una persona, y compartirla entre cuentas la convertiría en material de otro (decisión provisional del
  propietario, 2026-09-27);
- **se borra con el personaje**, en la misma operación que sus derivados y su consentimiento, y se purga sola
  cuando nadie la usa desde hace más de lo configurado en Admin › Ajustes;
- del texto de origen **solo se guarda su huella**, así que la caché no es una segunda copia de lo que se escribió.

Queda pendiente para la política de privacidad: nombrar KIE como **encargado del tratamiento** también para texto,
no solo para imagen y vídeo, y decir el plazo de conservación de las traducciones.

## La etiqueta de contenido sintético en lo que se exporta (0.32.0)

Desde la 0.32.0 Escenara **entrega el vídeo terminado**. El [artículo 50 del Reglamento de IA de la UE](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50),
aplicable desde el 2 de agosto de 2026, distingue la divulgación de contenidos que constituyen una falsificación
ultrarrealista por quien los utiliza de la marca legible por máquina que puede corresponder al proveedor del sistema.
La etiqueta visible de Escenara es una medida de transparencia del producto, **no una declaración de cumplimiento
integral** de ambas obligaciones.

Cómo se cumple, y hasta dónde:

- **El rótulo es fijo y lo dibuja el servidor.** Dice `Contenido generado con IA`, se compone dentro del propio
  render y no viaja como texto del usuario: no se puede sustituir por otra frase ni por una imagen.
- **La etiqueta es obligatoria en toda exportación por diseño del producto.** Cuenta igual una persona real, una
  inventada o un personaje completamente animado. Esto no presupone que todos esos casos encajen jurídicamente
  en la definición de falsificación ultrarrealista. Lo impide el servidor al guardar el montaje, no la pantalla.
- **Se elige la posición, no la existencia**: arriba o abajo, siempre dentro de la zona segura para que la interfaz
  de la plataforma no la tape.
- **Sin poder dibujarla no se exporta.** Si a la instalación le falta una fuente o el soporte de texto de FFmpeg, la
  exportación se detiene con el motivo. Entregar el MP4 sin etiqueta contradiría la regla de transparencia que
  Escenara aplica a todos los vídeos que exporta.
- **Lo que la etiqueta no es.** No es una marca legible por máquina ni una firma de procedencia: **C2PA y los
  metadatos de procedencia quedan para la 0.46.0**. Hasta entonces un vídeo recortado puede perder el rótulo sin
  dejar rastro comprobable; la obligación que resulte aplicable a cada operador requiere una revisión separada.
- **No sustituye a la declaración de la plataforma.** TikTok, Reels y Shorts piden marcar el contenido generado con
  IA al publicar. La guía de usuario lo dice, pero Escenara **no puede comprobarlo**, porque no publica por ti.
- **También en vídeos sin personas o completamente animados es obligatoria.** El propietario mantendrá esta regla
  hasta la revisión legal prevista para la 0.46.0.

Queda pendiente para los documentos públicos: describir esta etiqueta en la **guía de etiquetado de contenido
sintético** de la lista de abajo, y decir que la obligación de declarar en la plataforma sigue siendo de quien
publica.

## Documentos públicos necesarios antes de 1.0.0

Para cantar con audio propio, la persona que sube el archivo declara si es música propia, música con licencia
(identificando la licencia) o audio hablado propio. Se registra el texto aceptado, su fecha y la IP. Esta declaración
no verifica la titularidad ni sustituye la autorización de imagen y voz del personaje. La generación queda bloqueada
si falta cualquiera de las dos autorizaciones. La política pública deberá explicar que el audio y el retrato se
transmiten al proveedor de generación al confirmar el clip, además de su conservación y borrado.

Términos de uso, política de privacidad, política de contenido aceptable, política de cookies (si aplica), plantilla de consentimiento de imagen y voz para terceros y guía de etiquetado de contenido sintético.
