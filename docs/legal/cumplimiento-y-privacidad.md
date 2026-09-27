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
- [ ] Autorización de voz independiente de la de imagen. *(0.13.0 registra el alcance de uso —personal o comercial— aparte de la imagen; la voz llega con la clonación de voz.)*
- [x] Prohibición de menores como avatar: declaración, filtros del proveedor y moderación. Es un control, no una garantía. **0.13.0**: la declaración de mayoría de edad es obligatoria para registrar el consentimiento y, sin registro, el personaje queda bloqueado. Ver el aviso de alcance más abajo.
- [ ] Bloqueo de desnudez sexual, acoso, suplantación y respaldo falso de personas reales.
- [x] Terceros solo con documento de consentimiento y revisión; nunca publicables en la comunidad. **0.13.0**: el titular «otra persona» exige un documento firmado subido y el personaje queda en revisión hasta que un administrador lo acepta (ADR-0017). La comunidad llega en 0.28.0 y estos personajes no se publicarán.
- [x] Borrado de personaje con todos sus derivados. **0.13.0**: borra el personaje, su consentimiento, sus relaciones con las fotos y los medios generados con él, fila y objeto del almacenamiento, con registro de las claves borradas. Las fotos de referencia se conservan en la biblioteca del usuario a propósito (son suyas y pueden estar en otro personaje). Escenas y exportaciones aún no existen: se añadirán al mismo borrado cuando lleguen.
- [ ] Etiqueta visible de contenido sintético por defecto y metadatos C2PA en exportaciones realistas.
- [ ] Sugerencias de salud informativas, revisables y sin promesas de diagnóstico ni curación.
- [ ] Aviso de qué proveedor procesará los archivos antes de enviarlos.
- [ ] Credenciales cifradas, excluidas de logs y nunca devueltas íntegras al navegador.
- [ ] Protección contra SSRF en URLs externas y límites de uso por cuenta.

## Alcance real del control de menores y de identidad (0.13.0)

Escrito aquí para no repetirlo con eufemismos en cada pantalla:

- **Escenara no comprueba la edad de nadie.** No existe detección de edad fiable y no se usa ninguna. Lo que hay es una **declaración obligatoria** de mayoría de edad, guardada con la cuenta que la hizo y su fecha, más el bloqueo del personaje si falta. Es un **control de producto y una trazabilidad de la declaración**, no una verificación ni una garantía.
- **Escenara no comprueba la identidad de nadie.** Para la imagen de un tercero exige un documento de consentimiento firmado y una **revisión humana** de quien administra la instalación. Esa revisión valora el documento; no autentica al firmante ni verifica que sea quien dice ser.
- **Lo que sí se puede demostrar** es qué se declaró, quién lo declaró, cuándo, con qué alcance de uso, quién lo revisó y cuándo se revocó. Los registros revocados no se borran por eso mismo.
- **Riesgos que quedan abiertos** y que esta versión no cierra: una declaración falsa, un documento falsificado, un personaje creado a partir de fotos obtenidas sin permiso, y la moderación de lo ya generado. Se mitigan en 0.28.0 (moderación de comunidad) y con los filtros de contenido de los propios proveedores. Cualquier texto público del producto debe describir estos controles como controles, sin dar a entender verificación.
- **Datos personales implicados**: fotos de rostro y documentos de consentimiento firmados. Las **fotos solo las ve su dueño**: no salen en ninguna respuesta dirigida a otra persona, tampoco a quien administra. Del documento de un tercero, quien administra ve únicamente ese documento, en `/admin/personajes`, y **cada acceso queda registrado** (quién, cuándo, qué personaje y qué hizo) en `consent_access_log`. Ni los documentos ni las fotos de referencia aparecen en la biblioteca de administración (`/admin/medios`): para quien no es su dueño responden como si no existieran. A los documentos se les quitan los metadatos al guardarlos, **incluida la localización** de la foto, sin recomprimir la imagen. Se sirven con URL temporales firmadas que caducan y no aparecen en ningún registro del servidor. Antes del lanzamiento hay que reflejar este tratamiento (y el plazo de conservación de los documentos) en la política de privacidad y en la EIPD.

## Documentos públicos necesarios antes de 1.0.0

Términos de uso, política de privacidad, política de contenido aceptable, política de cookies (si aplica), plantilla de consentimiento de imagen y voz para terceros y guía de etiquetado de contenido sintético.
