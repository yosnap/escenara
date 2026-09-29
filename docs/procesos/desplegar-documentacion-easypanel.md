# Desplegar la web de documentación en Easypanel

La web de documentación (`apps/docs`) es un sitio estático: Astro Starlight la construye a partir de
`docs/guias`, y un contenedor nginx la sirve. Se publica en **https://docs.escenara.com** desde el mismo
servidor de Easypanel que el resto de la instancia (ADR-0007).

| Dato | Valor |
|---|---|
| Dockerfile | `apps/docs/Dockerfile` |
| Contexto de build | la **raíz del repositorio** (la web lee `docs/`) |
| Filtro del contexto | `apps/docs/Dockerfile.dockerignore` (solo pasan `apps/docs`, `docs/guias`, `docs/assets`, `docs/branding` y el lockfile) |
| Puerto interno | **8080** (nginx sin privilegios) |
| Comprobación de salud | `GET /salud` → `200 ok` |
| Variables de entorno | ninguna: el sitio no tiene secretos |

La imagen **no puede publicar nada privado**: el Dockerfile copia solo esas cuatro rutas, y el build termina
con `scripts/comprobar-exclusion.ts`, que falla si en el resultado aparece `docs/privado`, `plans`,
`datos-privados` o algo con forma de clave. Si falla, la imagen no se construye.

## 1. Comprobar en local antes de desplegar

```bash
bun run docs:build                                   # build y comprobación de exclusión
docker build -f apps/docs/Dockerfile -t escenara-docs .
docker run --rm -d --name escenara-docs-prueba -p 18322:8080 escenara-docs
curl -i http://localhost:18322/salud                 # 200 ok
docker stop escenara-docs-prueba && docker rmi escenara-docs
```

Usa un puerto libre que no sea el 3022 (el de `docs:dev`) ni los de la aplicación; compruébalo antes con
`lsof -i :18322`.

## 2. Registro DNS

En el proveedor del dominio `escenara.com`, crea el registro que apunta el subdominio al servidor de Easypanel:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| `A` | `docs` | IPv4 pública del servidor de Easypanel | 300 (o el automático) |
| `AAAA` | `docs` | IPv6 del servidor, solo si tiene y Easypanel escucha en IPv6 | 300 |

Si el dominio está detrás de Cloudflare, deja el registro **solo DNS** (nube gris) hasta que Easypanel haya
emitido el certificado; después puedes activar el proxy con cifrado **Full (strict)**. Comprueba la propagación
con `dig +short docs.escenara.com` antes del paso 5.

## 3. Crear la aplicación en Easypanel

1. Abre el proyecto de Escenara en Easypanel y pulsa **New Service › App**. Nombre: `docs`.
2. En **Source**, elige una de estas dos opciones:
   - **Git** (o **GitHub**, cuando exista el remoto): URL del repositorio, rama `main` (lo publicado) y
     **Build Path** `/`, porque el contexto de build es la raíz del repositorio.
   - **Docker Image**: si construyes la imagen fuera (por ejemplo en local) y la subes a un registro, pon
     `registro/escenara-docs:<versión>`. En ese caso sáltate el paso 4.
3. Guarda la fuente.

El repositorio todavía no tiene remoto: hasta que lo tenga, la opción viable es **Docker Image** o subir un
archivo con **Upload** (un `.tar` del repositorio sin `docs/privado`, `datos-privados`, `plans`, `.env*` ni
`node_modules`).

## 4. Build

En **Build**, elige **Dockerfile** y escribe como ruta del fichero `apps/docs/Dockerfile`. No hace falta ningún
argumento ni variable de entorno.

## 5. Dominio y HTTPS

1. En **Domains**, añade `docs.escenara.com`.
2. **Port** (puerto de destino): `8080`. Es donde escucha nginx dentro del contenedor.
3. Activa **HTTPS** con el resolvedor de certificados de Let's Encrypt. Easypanel redirige HTTP a HTTPS.
4. Opcional: añade `www.docs.escenara.com` solo si también existe su registro DNS; si no, no lo pongas.

## 6. Desplegar y comprobar

1. Pulsa **Deploy** y sigue el log: debe terminar con «Exclusión comprobada: nada privado ni con forma de clave
   en el build».
2. Comprueba desde fuera:

   ```bash
   curl -I https://docs.escenara.com/            # 200
   curl https://docs.escenara.com/salud          # ok
   curl -I http://docs.escenara.com/             # 301 o 308 hacia https
   ```

3. Abre la portada, una guía y el buscador. El buscador (Pagefind) funciona sin servidor: son archivos
   estáticos dentro de la imagen.

La imagen declara su `HEALTHCHECK` contra `/salud`, así que Docker marca el contenedor como `healthy` en cuanto
nginx responde. Si Easypanel ofrece además su propia comprobación, usa la misma ruta y el puerto 8080.

## Actualizar

Cada cambio en `docs/guias` o en `apps/docs` necesita un despliegue nuevo: **Deploy** (o el despliegue automático
de la rama, si lo activas cuando haya remoto). La web no guarda estado, así que desplegar es sustituir el
contenedor. Para volver atrás, redepliega la versión anterior de la rama o la etiqueta de imagen anterior.
