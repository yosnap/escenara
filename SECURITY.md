# Política de seguridad

Escenara maneja datos sensibles: fotos y voz de personas, consentimientos y claves de proveedores de IA de cada usuario (BYOK). Nos tomamos en serio cualquier fallo de seguridad.

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de vulnerabilidades de GitHub: pestaña **Security → Report a vulnerability** del repositorio. Incluye:

- descripción del problema y su impacto;
- pasos para reproducirlo o prueba de concepto;
- versión o commit afectado.

Confirmaremos la recepción en un máximo de 5 días laborables y te mantendremos al tanto de la corrección. Cuando esté publicada, te daremos crédito si lo deseas.

## Qué nos interesa especialmente

- Exposición de claves de proveedores (en el navegador, logs, exportaciones o respuestas de la API).
- Acceso a personajes, fotos, consentimientos o proyectos de otra cuenta.
- Envío de generaciones sin aprobación o por encima del presupuesto autorizado.
- SSRF a través de URLs externas y abuso de los enlaces temporales de almacenamiento.

## Versiones con soporte

Hasta la versión 1.0.0 solo se corrige la última versión publicada.
