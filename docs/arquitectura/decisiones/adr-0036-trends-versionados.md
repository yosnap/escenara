# ADR-0036 · Trends como plantillas versionadas

- **Estado:** Propuesta; pendiente de validación real autorizada.
- **Versión:** 0.30.0
- **Fecha:** 2026-09-29

## Contexto

Un formato viral envejece. Debe poder cambiarse o retirarse desde el admin sin desplegar, conservar lo que se pidió en cada trabajo y no enviar un prompt interno al navegador. La dirección del clip y los productos ya aportan cámara, gesto, toma única y referencias de marca.

## Decisión

Un trend es una plantilla existente con `kind = trend`, versión de contenido y metadatos de vigencia, plataforma, duración y referencia informativa. Solo una plantilla de la instalación activa y **vigente** aparece en el selector y puede generar. El servidor vuelve a comprobar esa vigencia, la duración objetivo, el sello y los créditos antes de reservar. Una caducada da la causa y busca una copia descendiente vigente; se puede duplicar, pero no editar directamente.

La plantilla nace sin habla a cámara salvo permiso explícito. El compositor conserva la regla de toma única y, si hay producto, lo integra como referencia física en vez de añadir un rótulo. El producto sigue sujeto a sus controles y a la revisión de fidelidad. La interfaz enseña nombre, resumen, duración, campos y coste, sin el prompt ni la URL de referencia del admin.

No hay descubrimiento automático ni scraping. Quien administra da de alta y mantiene los formatos. Las cinco plantillas iniciales se siembran en **revisión**: cada prueba real de pago exige autorización previa del propietario, y sin esa prueba no se publica un formato como vigente.

## Consecuencias

Los trabajos pasados conservan la versión que usaron. Cambiar o caducar un trend puede exigir revisar la escena y confirmar un precio nuevo. La calidad visual, la recognoscibilidad del formato y la tolerancia del proveedor a una marca solo se conocen después del spike; hasta entonces el catálogo inicial no se ofrece para generar.

## Actualización · 0.34.0

La duración objetivo deja de ser un límite. Cada versión del trend guarda sus **duraciones admitidas** (vacía =
cualquiera: manda el modelo en «Crear» o el proyecto en una escena) y las categorías de la dirección del clip que
**decide** (plano, ángulo, movimiento de cámara, micro-acción, registro estético). El servidor comprueba la duración
contra esa lista antes de reservar y no compone lo decidido aunque llegue en la petición; la interfaz lo enseña
bloqueado con su motivo. `target_seconds` se conserva como dato histórico. Cambiar cualquiera de los dos campos crea
versión nueva con motivo, igual que el texto o el permiso de habla.
