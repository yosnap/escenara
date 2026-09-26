# ADR-0006 · Almacenamiento de objetos con SeaweedFS

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.1.0 (se implementa en 0.2.0)

## Contexto

Escenara guarda fotos de referencia, vistas sintéticas, fotogramas clave, clips, audio y exportaciones. Necesita un almacenamiento compatible con S3 con enlaces temporales (URLs prefirmadas), subida por partes para vídeos grandes, CORS para subir desde el navegador y reglas de caducidad para archivos temporales. Al ser un proyecto de código abierto que otras personas instalarán en su propio servidor, la opción por defecto debe tener licencia permisiva, imágenes oficiales mantenidas y parches de seguridad.

## Opciones

| Opción | Supuesto principal | Dónde falla primero |
|---|---|---|
| MinIO (edición comunitaria) | Seguirá mantenida y con imágenes oficiales | Ya falló: dejó de publicar imágenes en octubre de 2025, pasó a mantenimiento en diciembre de 2025 y el repositorio se archivó como «no mantenido» en febrero de 2026. Solo queda el código fuente, sin parches |
| **SeaweedFS** | Su pasarela S3 cubre las funciones que usamos | En funciones S3 avanzadas poco comunes; en producción exige vigilar disco y copias de seguridad |
| Garage o RustFS | Una alternativa ligera basta | Garage implementa menos funciones S3; RustFS es todavía joven |
| Solo almacenamiento gestionado (R2, S3, Hetzner) | Siempre habrá cuenta en la nube | Quien instala Escenara en local o sin nube necesita igualmente una opción autoalojada |

## Decisión

- **SeaweedFS** es el almacenamiento por defecto en desarrollo local y en la instalación propia con Docker Compose. Licencia Apache 2.0, publicación de versiones muy frecuente (4.47 el 14 de septiembre de 2026) y soporte de URLs prefirmadas, subida por partes, CORS y reglas de ciclo de vida.
- En local se ejecuta en modo todo en uno (`weed server -s3`) con volumen persistente. Solo se publica la pasarela S3 en el puerto **8321** del host (8333 dentro del contenedor); maestro, volúmenes y filer quedan en la red interna de Docker.
- La imagen oficial se fija en una versión exacta 4.x en 0.2.0; no se usa la etiqueta `latest`.
- El código de Escenara **solo usa la API S3 estándar** mediante un SDK S3 genérico, con endpoint, región, bucket y credenciales por variables de entorno. Las pruebas de integración se ejecutan contra SeaweedFS.
- En la instancia del proyecto sobre Easypanel, el piloto usa SeaweedFS con volumen persistente y copias de seguridad. Si el volumen de vídeo lo justifica, se migra a un almacenamiento gestionado con residencia en la UE (por ejemplo, Cloudflare R2, sin coste de salida de datos) sin cambiar código; esa migración tendrá su propio ADR.

## Consecuencias

- Se evita depender de un proyecto sin mantenimiento y de imágenes congeladas sin parches.
- Cualquier proveedor compatible con S3 sirve en producción: la elección queda abierta sin coste de reescritura.
- SeaweedFS tiene más componentes internos que MinIO; en producción hay que monitorizar disco y programar copias de seguridad.
- Si una función S3 que necesitemos no está soportada, se detectará en las pruebas de integración y se valorará otra opción antes de usarla.

## Fuentes

- SeaweedFS, repositorio y versiones: https://github.com/seaweedfs/seaweedfs/releases
- SeaweedFS, API S3: https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API
- MinIO, modo mantenimiento: https://github.com/minio/minio/issues/21714
