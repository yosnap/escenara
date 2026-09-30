# ADR-0041 · Exportación del proyecto en ZIP y borrado de datos con retención anónima

- **Estado:** Aceptado para 0.47.0 (decisiones recomendadas por la fase; revisables por el propietario; la retención,
  pendiente de revisión jurídica)
- **Fecha:** 2026-09-30
- **Versión del proyecto:** 0.47.0

## Contexto

Con 0.47.0 se cierra el hito MVP: el usuario tiene que poder ver lo que ha hecho y gastado, llevarse sus proyectos y
borrar lo suyo, hasta la cuenta entera (derecho de supresión). Tres riesgos mandan: que un paquete exportado se lleve
una credencial, que un borrado deje la cara de alguien o su archivo en el almacenamiento, y que borrar a lo bruto
descuadre el gasto de la instalación o se lleve la prueba de un consentimiento.

## Opciones

1. **Exportar en ZIP con un índice versionado** (`proyecto.json`) construido por lista blanca, preparado por el worker
   y descargado por URL temporal. Supuesto: el usuario quiere sus archivos y sus datos en un formato abierto; la
   reimportación puede esperar. Fallaría primero si el paquete no cabe en disco: límite de tamaño y caducidad.
2. **Descarga directa desde la web** montando el ZIP en la petición. Más simple, pero ata un proceso de la web durante
   minutos y no sobrevive a un corte.
3. **Borrado de cuenta inmediato** frente a **con periodo de gracia**. El inmediato no deja arrepentirse ni exportar
   después de pedirlo; la gracia retiene datos unos días más, con la cuenta desactivada.

## Decisión

- **Exportación**: opción 1. ZIP sin comprimir (los medios ya lo están) escrito sin dependencias, con `proyecto.json`
  (esquema `escenara.proyecto`, versión 1, validado antes de cerrar el paquete y en los tests), los medios en carpetas
  con su huella SHA-256 y un `LEEME.md`. **Lista blanca**: ni prompts (ADR-0022), ni tareas del proveedor, ni
  credenciales, ni medios de otra cuenta, ni documentos de consentimiento. **Segunda barrera**: cada texto pasa por un
  filtro que retira los valores de los secretos de la instalación y lo que tiene forma de clave o de cabecera de
  autenticación. El paquete no es un medio de la biblioteca: vive en `project_exports` con su clave, caduca (24 h de
  fábrica) y el worker lo borra. La descarga redirige a una URL firmada que dura como mucho lo que le queda al paquete.
  La **reimportación queda fuera** del MVP.
- **Borrado de proyecto**: se lleva sus filas (cascada), sus trabajos, los medios **generados** por ellos y los vídeos
  montados, fila y objeto, y los ZIP. Se quedan lo subido por el usuario y lo generado que se usa **fuera** del
  proyecto. Las reglas de dinero del borrado de un personaje se reutilizan: nada con la reserva abierta, 409 con un
  trabajo en el proveedor. Productos y lugares mantienen su decisión (no borran lo generado).
- **Borrado de cuenta**: opción con **gracia** (7 días de fábrica, en Admin › Ajustes), sesión reciente (10 minutos),
  frase escrita y el único administrador no puede borrarse. Durante la gracia la cuenta está desactivada: la API la
  trata como sin sesión y las páginas llevan a «tu cuenta se va a borrar», donde solo se cancela. Pasado el plazo, el
  worker borra **en una transacción** (retención, claves por borrar y la fila del usuario, que arrastra el resto) y
  después los objetos, reintentando los que fallen; lo que no se deja tras varios intentos queda registrado.
- **Retención**: del gasto, solo el **agregado** por mes, proveedor, modelo y tipo (`usage_aggregates`); de los
  consentimientos y declaraciones (personaje, lugar, canto y afirmación sensible), una **prueba mínima y anónima**
  (`consent_evidence`: tipo, alcance, versión del texto o su huella, casillas y fechas). Pendiente de revisión jurídica.

## Consecuencias

- `proyecto.json` es un **contrato público**: un cambio incompatible sube su versión y se anota en el registro de
  cambios.
- El worker gana tres tareas que no cuestan créditos: empaquetar, barrer paquetes caducados y ejecutar borrados.
- Borrar un proyecto ya no conserva sus trabajos ni sus resultados (antes quedaban en la biblioteca); el gasto sí se
  conserva en los apuntes, con nota.
- Cada petición autenticada consulta si la cuenta tiene un borrado programado (una consulta por índice único).
- Los objetos por borrar (de un proyecto o de una cuenta) se apuntan en `storage_deletions` dentro de la transacción
  que borra las filas y el worker los reintenta con retroceso; nada queda solo en el registro de texto.
- El borrado de un proyecto y el encolado bloquean primero la fila del usuario; el trabajo guarda el proyecto con el que
  se encoló (`generation_jobs.project_id`, sin clave ajena) para que el worker cierre sin cobro uno huérfano.
- Durante la gracia, la API de Escenara responde a esa cuenta con 403 y el motivo, salvo una **lista blanca** de solo
  lectura y portabilidad (consultar y cancelar el borrado, historial, listar, pedir y descargar exportaciones); las
  páginas llevan a `/cuenta/borrado`. Las rutas de Better Auth (`/api/auth/*`: contraseña, passkeys, sesiones propias) siguen
  disponibles a propósito: solo tocan la propia cuenta y permiten, por ejemplo, cerrar una sesión robada.
- Mientras el worker tiene tomado un borrado, cancelarlo responde 409 y se puede volver a intentar al soltarlo: evita
  cancelar trabajos o borrar filas de una cuenta que acaba de arrepentirse.
- No hay pantalla para dar el rol de administrador a otra cuenta: el único administrador que quiera irse necesita
  hacerlo en la base de datos. Queda como propuesta.
- Los registros de decisiones de coherencia de un proyecto borrado se conservan sin su evidencia (como hasta ahora) y
  desaparecen con la cuenta.
