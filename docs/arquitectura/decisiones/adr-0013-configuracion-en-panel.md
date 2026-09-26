# ADR-0013 · La configuración se gestiona en el panel de administración

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.8.0
- **Sustituye en parte a:** ADR-0004 (las variables `ESCENARA_REGISTRO_ABIERTO` y `ESCENARA_CABECERAS_IP`, y el correo por `SMTP_URL` y `CORREO_REMITENTE`)

## Contexto

Hasta la 0.7.0, opciones como el registro abierto, el correo o la cabecera de IP se configuraban con variables de entorno. El propietario pide que **toda la configuración se gestione desde el panel de administración**: cambiarla no debe exigir editar archivos ni reiniciar el servidor, y quien instale Escenara debe poder ajustarla sin tocar el despliegue.

## Opciones

1. **Variables de entorno.** Sencillo y habitual; falla en que cada cambio pide editar el despliegue y reiniciar, y no hay interfaz.
2. **Tabla de ajustes en la base de datos con página de administración.** Cambios al momento y con registro de quién cambió qué; falla en que algunos valores se necesitan antes de poder leer la base de datos.
3. **Asistente de instalación que escriba toda la configuración.** Cubre también el arranque, pero es un proyecto aparte.

## Decisión

Opción 2 (decisión del propietario, 2026-09-27):

- Tabla `settings` (clave, valor JSON, quién y cuándo) y página **Admin › Ajustes**. Cada ajuste tiene valor por defecto y validación en el servidor (`server/ajustes.ts`); solo se guardan los que se cambian.
- Ajustes de la 0.8.0: registro abierto, espacio por usuario (2 GB por defecto), remitente y servidor de correo (sin contraseña), y cabecera con la IP real.
- En `.env` solo queda el **arranque**: PostgreSQL, almacenamiento S3 y `BETTER_AUTH_SECRET` (y, en la 0.9.0, la clave maestra de cifrado).
- **Secretos configurables** (contraseña SMTP, claves de Google y GitHub): pasan al panel en la 0.9.0, cifrados con la bóveda de secretos (ADR-0005). Hasta entonces, las claves OAuth siguen en `.env`.
- Caché de ajustes de 30 s por proceso; el proceso que guarda los ve al momento y la configuración de acceso se reconstruye sola cuando cambian.

## Consecuencias

- Norma para versiones futuras: toda opción nueva es un ajuste del panel con valor por defecto, no una variable de entorno, salvo arranque o secretos raíz.
- Con varias instancias del servidor, un cambio tarda como mucho 30 s en verse en las demás.
