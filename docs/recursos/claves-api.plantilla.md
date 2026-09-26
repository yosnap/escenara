# Plantilla del documento privado de claves API

Esta plantilla **sí** está en git y **no** contiene valores. El documento real es `docs/privado/claves-api.local.md`: la carpeta `docs/privado/` está en `.gitignore` y nunca se sube al repositorio.

Para crearlo en una copia nueva del proyecto:

```bash
mkdir -p docs/privado
cp docs/recursos/claves-api.plantilla.md docs/privado/claves-api.local.md
git check-ignore -v docs/privado/claves-api.local.md   # debe mostrar la regla de .gitignore
```

## Normas

- Antes de cada commit, revisar `git status` y `git diff --staged`: nada de `docs/privado/` ni `.env*` debe aparecer.
- Preferible guardar el **valor** en un gestor de contraseñas y aquí solo su referencia. Si se escribe aquí, que sea en este fichero y en `.env.local`, nunca en otro documento, chat, issue o captura.
- Configurar un límite de gasto en cada proveedor siempre que lo permita.
- Rotar una clave en cuanto se sospeche exposición y anotar la fecha.
- No copiar este fichero a carpetas sincronizadas en la nube sin cifrado.

## Ficha por proveedor

Repetir el bloque para cada proveedor de `apis-y-proveedores.md`.

```markdown
### Nombre del proveedor

- **Uso en Escenara:** desarrollo | operador
- **Cuenta:** correo o identificador de la cuenta
- **Dónde se obtiene:** URL del panel donde se crea la clave
- **Nombre de la clave en el panel:** p. ej. «escenara-dev-2026-09»
- **Variable de entorno:** p. ej. `KIE_API_KEY`
- **Valor:** (vacío si está en el gestor de contraseñas) · **Referencia en el gestor:**
- **Fecha de creación:** AAAA-MM-DD
- **Próxima rotación:** AAAA-MM-DD
- **Límite de gasto configurado:** importe y moneda, o «no disponible»
- **Permisos y restricciones:** modelos, regiones, IPs
- **Notas:** facturación, créditos, incidencias
```

## Índice de fichas

- Google Gemini API (`GEMINI_API_KEY`)
- KIE.ai (`KIE_API_KEY`)
- TypeSafe Jev (`TYPESAFE_API_KEY`)
- Hugging Face (`HF_TOKEN`)
- ElevenLabs (`ELEVENLABS_API_KEY`)
- Almacenamiento S3 (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`)
- Clave maestra de cifrado (`CREDENTIALS_MASTER_KEY`)
- Sesiones (`AUTH_SECRET`)
- Correo (`RESEND_API_KEY`)
- GitHub (token personal, si se usa)
- Easypanel (acceso al panel y token de API, si se usa)
