# ADR-0005 · Bóveda de credenciales BYOK y gestión de la clave maestra

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.9.0
- **Completa a:** ADR-0013 (cierra los secretos que quedaban en `.env`)

## Contexto

Escenara es BYOK (RF01): cada persona genera con su propia clave de API y paga directamente al proveedor. Eso obliga a guardar claves ajenas, que son dinero. Además, la 0.8.0 dejó pendientes tres secretos de la instalación (contraseña SMTP y claves OAuth de Google y GitHub) que seguían en `.env`, en contra de la norma de ADR-0013.

Restricciones:

- Instalación sencilla: quien despliega Escenara no debería necesitar montar un gestor de secretos.
- Una clave nunca debe volver al navegador ni aparecer en un registro, tampoco dentro del mensaje de error de un proveedor (algunos repiten la clave recibida).
- Debe poder rotarse tanto una credencial de usuario como la clave que cifra la bóveda.

## Opciones

1. **Guardar las claves en claro** en la base de datos. Trivial, y falla en el primer volcado, copia de seguridad o consulta de soporte: quien vea la tabla se lleva el dinero de todos.
2. **Cifrado en el servidor con una clave maestra propia en el entorno.** Una sola variable más al instalar; falla si el atacante consigue a la vez el volcado y el entorno del servidor, y obliga a un procedimiento de rotación propio.
3. **Gestor de secretos externo** (Vault, KMS). Es lo más robusto y permite auditoría y rotación gestionada; falla como requisito de partida: convierte «instalar Escenara» en «instalar y operar Vault».
4. **Derivar la clave de cifrado de `BETTER_AUTH_SECRET`.** Ahorra una variable; falla en que rotar el secreto de las sesiones (algo que se hace ante cualquier sospecha) dejaría ilegibles todas las credenciales.

## Decisión

Opción 2 (decisión del propietario, 2026-09-27), con un gestor externo como añadido posterior y opcional.

- **Cifrado:** AES-256-GCM en el servidor. Clave maestra propia en `ESCENARA_CLAVE_MAESTRA` (32 bytes en base64), **no derivada** de `BETTER_AUTH_SECRET`.
- **Formato del valor guardado:** `v1.<idClave>.<iv>.<tag>.<datos>`, las cuatro últimas partes en base64url. `idClave` es una huella corta (SHA-256) de la maestra, así se sabe qué filas quedan por recifrar sin descifrarlas.
- **Contexto como datos autenticados (AAD):** `credencial:<usuario>:<proveedor>` o `ajuste:<clave>`. Un valor copiado a otra fila no se descifra aunque la maestra sea la misma.
- **Rotación de la maestra:** la vieja se pone en `ESCENARA_CLAVE_MAESTRA_ANTERIOR` (solo para descifrar) y `bun run boveda:recifrar` vuelve a cifrar todo con la actual; después se quita la variable. Es idempotente y **conviene hacerlo con el servidor parado**: cada fila se reescribe solo si su valor sigue siendo el que se leyó, así que nada se pierde si alguien guarda a la vez, pero esas filas se quedan sin recifrar, el script las cuenta y avisa, y hay que volver a pasarlo.
- **Sin clave maestra la aplicación arranca** con la bóveda desactivada y un mensaje claro (a quien usa: «la instalación aún no admite credenciales»; a quien administra: cómo generarla). Una clave con formato no válido es un error de instalación y se ve al arrancar.
- **Credenciales de IA:** tabla `provider_credentials`, **una por usuario y proveedor**, con pista de cuatro caracteres, estado y código propio del último resultado. Rotar es sustituirla, y solo se sustituye si la nueva pasa la prueba. Proveedores iniciales: KIE.ai y Google (Gemini); añadir otro es declarar su prueba.
- **Pruebas sin coste y sin SSRF:** URL fija por proveedor, 10 s de tiempo máximo y límite de pruebas por usuario. KIE: `GET /api/v1/chat/credit` con `Authorization: Bearer` (devuelve los créditos). Google: `GET /v1beta/models?pageSize=1` con cabecera `x-goog-api-key` (nunca en la URL, que acabaría en los registros de cualquier proxy).
- **Del proveedor solo se guarda un código propio** (`ok`, `rechazada`, `sin-credito`, `limite`…); su texto no se guarda, ni se registra, ni se muestra.
- **Secretos de la instalación al panel:** `smtpContrasena`, `googleClientSecret` y `githubClientSecret` viven cifrados en `installation_secrets`, tabla aparte de `settings` para que ningún secreto pueda acabar en una columna en claro. Sus identificadores de cliente (`googleClientId`, `githubClientId`) son ajustes normales: no son secretos.
- **Importación única por instalación desde `.env`:** si al arrancar quedan `GOOGLE_*`/`GITHUB_*` y el panel no los tiene, se importan **una sola vez** y se avisa en el registro y en Admin › Ajustes de que ya se pueden borrar. Cada proveedor importado deja un marcador en `settings` (`entornoImportado:<proveedor>`, una fila por proveedor para que marcarlo sea atómico), así que si después se quita su clave en el panel, se queda quitada: el `.env` no la resucita.
- **El `.env` no es respaldo de las claves OAuth.** Si hay claves en el entorno y falta la clave maestra, no se pueden cifrar: el proveedor queda desactivado y se registra un error explícito (sin valores) explicando qué falta.
- **El secreto solo sale del servidor** por `usarCredencial` y `leerSecreto`. Ninguna acción de servidor ni ruta de API lo devuelve: a la interfaz llegan la pista, el estado y la fecha.
- **Cachés:** las claves de caché que dependen de un secreto (instancia de Better Auth, transporte SMTP) usan una huella del **valor cifrado** y su fecha, nunca el secreto.

## Consecuencias

- `.env` queda para el arranque y los secretos raíz: base de datos, almacenamiento, `BETTER_AUTH_SECRET` y `ESCENARA_CLAVE_MAESTRA`. Se retiran `GOOGLE_*` y `GITHUB_*`.
- Perder la clave maestra sin copia significa perder los valores cifrados: hay que volver a guardarlos. Debe figurar en el procedimiento de despliegue y de copias.
- Quien tenga a la vez el volcado de la base de datos y el entorno del servidor puede descifrar. Se acepta para el MVP; el gestor externo es la mejora prevista.
- Añadir un proveedor de IA es declarar su ficha pública y su prueba; la bóveda no se toca.
- Revisar cuando haya varias instancias del servidor (la caché de secretos tarda hasta 30 s en propagarse) o cuando se quiera más de una credencial por proveedor.
