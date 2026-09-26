# Cumplimiento, privacidad y límites de contenido

**Estado:** lista de trabajo; **no sustituye** la revisión jurídica especializada que exige el PRD (§8) antes del lanzamiento · **Versión objetivo:** 0.28.0, con controles técnicos repartidos en versiones anteriores

## Marco a revisar

| Ámbito | Qué comprobar | Versión |
|---|---|---|
| RGPD y LOPDGDD | Base jurídica, consentimiento explícito para fotos de rostro y voz, evaluación de impacto (EIPD), encargados del tratamiento (proveedores de IA con claves del usuario), transferencias internacionales, derechos de acceso y supresión | 0.10.0 y 0.28.0 |
| Derecho a la propia imagen (LO 1/1982) | Consentimiento del titular para uso comercial de su imagen y voz; revocación | 0.10.0 |
| Reglamento de IA de la UE, art. 50 | Transparencia del contenido sintético y deepfakes: aplicable desde el 2 de agosto de 2026 según el calendario original. Comprobar el estado del paquete «Omnibus digital» y de la normativa española de etiquetado | 0.19.0 y 0.28.0 |
| Publicidad | Afirmaciones sobre productos, salud y lugares con fuente y aprobación editorial; identificación de contenido publicitario | 0.14.0 |
| Términos de proveedores | Políticas de uso de Google, KIE y cada modelo; restricciones regionales de generación de personas | 0.3.0 y 0.8.0 |
| Licencias | Licencia del repositorio: AGPL 3.0 (ADR-0001); licencias de modelos, fuentes (Manrope, OFL), música y recursos | 0.2.0 y 0.29.0 |
| Marca y nombre | Disponibilidad de «Escenara» en OEPM y EUIPO, dominios y cuentas | Antes de 0.5.0 |

## Controles del producto

- [ ] Declaración de derechos y consentimiento antes de usar cualquier personaje (RF10).
- [ ] Autorización de voz independiente de la de imagen.
- [ ] Prohibición de menores como avatar: declaración, filtros del proveedor y moderación. Es un control, no una garantía.
- [ ] Bloqueo de desnudez sexual, acoso, suplantación y respaldo falso de personas reales.
- [ ] Terceros solo con documento de consentimiento y revisión; nunca publicables en la comunidad.
- [ ] Borrado de personaje con todos sus derivados (referencias, vistas sintéticas, escenas y exportaciones).
- [ ] Etiqueta visible de contenido sintético por defecto y metadatos C2PA en exportaciones realistas.
- [ ] Sugerencias de salud informativas, revisables y sin promesas de diagnóstico ni curación.
- [ ] Aviso de qué proveedor procesará los archivos antes de enviarlos.
- [ ] Credenciales cifradas, excluidas de logs y nunca devueltas íntegras al navegador.
- [ ] Protección contra SSRF en URLs externas y límites de uso por cuenta.

## Documentos públicos necesarios antes de 1.0.0

Términos de uso, política de privacidad, política de contenido aceptable, política de cookies (si aplica), plantilla de consentimiento de imagen y voz para terceros y guía de etiquetado de contenido sintético.
