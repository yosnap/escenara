# ADR-0004 · Autenticación con Better Auth

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.7.0

## Contexto

La 0.7.0 introduce cuentas: registro, inicio de sesión, sesiones, perfil y preferencias. Hacen falta además verificación de correo, recuperación de contraseña, límite de intentos, roles (administrador en 0.8.0) y, a petición del propietario, passkeys y acceso con Google o GitHub. La pila es Next.js 16 con App Router, Bun, PostgreSQL y Drizzle (ADR-0010, ADR-0012), todo en TypeScript (ADR-0002).

## Opciones

1. **Auth.js (NextAuth v5).** Muy extendido; en septiembre de 2025 pasó a mantenerlo el equipo de Better Auth, que lo deja en modo mantenimiento (parches de seguridad) y recomienda Better Auth para proyectos nuevos. Falla primero en correo y contraseña, passkeys, roles y límite de intentos, que habría que construir a mano.
2. **Better Auth.** Librería TypeScript con adaptador oficial de Drizzle, integración con el App Router y plugins para passkeys, administración y límite de intentos. Falla primero en madurez: cambia a menudo entre versiones menores.
3. **Implementación propia.** Control total; demasiada superficie de seguridad para un proyecto de este tamaño.

## Decisión

Better Auth 1.7 (decisión del propietario, 2026-09-26):

- Usuarios, sesiones, cuentas, verificaciones, passkeys y contadores del límite de intentos en PostgreSQL mediante Drizzle (`server/db/esquema-auth.ts`), con identificadores UUID generados por la base de datos.
- Correo y contraseña con verificación obligatoria del correo; recuperación de contraseña que cierra las demás sesiones.
- Passkeys (`@better-auth/passkey`) y Google o GitHub, estos dos solo si sus claves OAuth están configuradas.
- Plugin de administración: la primera cuenta de la instalación es administradora; `ESCENARA_REGISTRO_ABIERTO=0` cierra el registro al resto.
- Límite de intentos en base de datos: por IP (entrar, registrarse, recuperar y reenviar verificación) y, además, **por cuenta** (entrar, recuperar y reenviar), que no depende de la IP y resiste cabeceras falsificadas. La IP se toma de la cabecera configurada en `ESCENARA_CABECERAS_IP` (la que escriba el proxy propio en producción); en local, de `x-forwarded-for`.
- Sin enlazado automático de cuentas OAuth: evita que una cuenta con contraseña creada con tu correo por otra persona se una a tu acceso con Google o GitHub. Revisar antes de activarlo.
- `BETTER_AUTH_SECRET` es obligatorio (32 caracteres o más): sin él, la aplicación no arranca.
- Preferencias de tema e idioma como campos del usuario, validadas en el servidor; la sesión viaja firmada en una cookie de 5 minutos para leerla en cada página sin consultar la base de datos.
- Correo por SMTP: en local, Mailpit; al publicar, un proveedor real solo cambiando la configuración.

## Consecuencias

- El admin y la API de medios dejan de depender de «solo en desarrollo»: exigen sesión con rol de administrador.
- La copia de la sesión en cookie (5 min) solo se usa para el tema, el idioma y los enlaces de cabecera. El admin, la API y la página de cuenta comprueban la sesión en la base de datos en cada petición: cerrar una sesión o retirar un rol tiene efecto inmediato.
- Versiones fijadas (`better-auth` y `@better-auth/passkey` 1.7.6): revisar las notas de versión al actualizar.
- Auth.js queda descartado; si Better Auth dejara de mantenerse, las tablas son estándar y migrables.
