# Aplicación y demos en Easypanel

El Dockerfile `apps/web/Dockerfile` se construye desde la raíz del repositorio con Bun 1.4.2.
Incluye FFmpeg y los scripts de cola, migración y archivo. Su lista permitida excluye secretos,
borradores privados y datos locales. La compilación no necesita acceso a la base de datos.

## Servicios

Dentro del proyecto elegido, crea servicios con el prefijo `escenara-` y almacenamiento propio:

- `escenara-db`: PostgreSQL 18 con volumen persistente. El puerto externo solo se abre para una
  migración controlada y se cierra al terminar.
- `escenara-almacen`: SeaweedFS 4.47, volumen `/data`, S3 en el puerto 8333 y dominio HTTPS.
  En el campo de comando de Easypanel se incluye `/entrypoint.sh server` y sus argumentos.
- `escenara-web`: imagen construida desde una revisión validada, puerto 3021 y dominio de la instalación.
- `escenara-worker`: misma imagen, comando `bun scripts/worker.ts`, una réplica, sin dominio público.
- `escenara-demos`: misma imagen, comando `bun scripts/archivar-demos.ts CORREO --watch`, una réplica,
  sin dominio público. Volumen persistente en `/app/docs/privado/demos`, escribible por el usuario `bun`.
- `escenara-docs`: sitio estático independiente, según la guía de documentación.

Los procesos auxiliares deben reutilizar exactamente la imagen de la web validada, sin compilar copias
con revisiones diferentes. Despliega secuencialmente para controlar la memoria del servidor.

## Entorno y migración

Configura `DATABASE_URL`, las seis variables S3 y `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`ESCENARA_CLAVE_MAESTRA`. Conserva la clave maestra al migrar: regenerarla impediría abrir los secretos.
`S3_ENDPOINT` debe ser accesible por HTTPS desde el navegador, porque firma las URL de reproducción.
Las claves se guardan únicamente en el entorno privado del panel.

1. Comprueba que no hay trabajos activos y realiza `pg_dump -Fc --no-owner --no-acl`.
2. Restaura en una base nueva e inventaría el bucket. Copia los objetos referenciados por las tablas
   y los archivos adicionales que necesite la aplicación, preservando sus claves y tipos MIME.
   Conserva íntegro el origen; no traslades objetos de pruebas sin referencias a producción.
3. Verifica todos los objetos mediante SHA-256, los recuentos de filas y el UUID de la cuenta de demos.
4. Ajusta `settings.urlPublica` y `BETTER_AUTH_URL` al dominio HTTPS.
5. Comprueba que la bóveda descifra los secretos sin imprimirlos ni llamar a proveedores de pago.
6. Valida `/api/health`, portada, inicio de sesión, biblioteca, worker y archivo persistente.
7. Cierra el puerto externo de PostgreSQL. Conserva el origen y las copias hasta verificar la migración.

La cuenta de demos tiene su biblioteca propia. Reutiliza las credenciales autorizadas del administrador;
el catálogo de modelos es compartido por la instalación. Las demos y sus recorridos se archivan en privado.
Asignar un vídeo a una plantilla o publicarlo en una guía sigue siendo una acción explícita del administrador.

Configura SMTP real antes de usar verificación, invitaciones o recuperación de acceso. Mailpit y
`localhost:1021` pertenecen al entorno local. No abras registros públicos mientras el correo no funcione.
Configura copias periódicas de PostgreSQL y de los volúmenes: el archivo de demos no sustituye un backup.
