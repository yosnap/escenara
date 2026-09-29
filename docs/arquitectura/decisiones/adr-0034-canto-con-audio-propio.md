# ADR-0034 · Canto con audio aportado por el usuario

- **Estado:** Propuesta. Pendiente de prueba real autorizada.
- **Versión:** 0.29.0
- **Fecha:** 2026-09-29

## Contexto

Sincronizar labios con una canción requiere un audio cuyo uso esté autorizado y un retrato válido. La duración y la resolución determinan el coste del proveedor. La documentación de los modelos no demuestra por sí sola que el resultado cante bien ni que respete el vertical.

## Decisión

El audio es un medio de la biblioteca del dueño de la escena. La selección comprueba propiedad, formato, tamaño y duración real; cambiarlo invalida la aprobación. Antes de pedir un clip se exigen la declaración de derechos del audio y, para una persona real, su consentimiento vigente. La declaración ofrece música propia, música con licencia con referencia y audio hablado propio; registra texto, fecha e IP. No se ofrece «uso legítimo» como permiso automático.

El servidor calcula **segundos facturables × tarifa publicada** del modelo configurado, entrega el sello de precio y lo valida de nuevo al confirmar. La reserva, la idempotencia y el cierre del trabajo siguen la cola de producción existente. Un intento que pudo cobrarse necesita presupuesto de reintento autorizado. El proyecto presenta el mismo precio por segundo al aprobar su plan.

La función nace **apagada**. Modelo, resolución y tope inicial de 15 s se editan en Admin › Ajustes. InfiniteTalk es el primer candidato; Kling AI Avatar es la alternativa de la prueba. Ninguna prueba de pago se ejecuta sin aprobación del propietario.

## Consecuencias

Una declaración no prueba la titularidad. El texto legal público debe explicar el envío del audio y el retrato al proveedor y sus plazos de conservación. Si las pruebas muestran canto deficiente, proporción incorrecta o cobro distinto del estimado, se mantiene apagada la función y se revisa la decisión antes de activarla.
