# Flujo de versiones y ramas

Cada paso del proyecto tiene **su propia versión y su propia rama**. Se empieza en 0.1.0 y se avanza por versiones menores hasta el lanzamiento 1.0.0. La hoja de ruta con todas las versiones se mantiene en la planificación interna del proyecto.

## Numeración

- Formato SemVer `MAJOR.MINOR.PATCH`. Antes del lanzamiento, `0.MINOR.PATCH`.
- Cada paso de la hoja de ruta sube la versión menor: 0.1.0, 0.2.0 … 0.9.0, **0.10.0**, 0.11.0 … 0.30.0.
- **No es un número decimal:** 0.10.0 va después de 0.9.0, y 0.35.0 o 0.50.0 son válidas si hacen falta más pasos.
- Una corrección sobre una versión publicada sube el parche: 0.4.0 → 0.4.1.
- Las candidatas al lanzamiento se etiquetan `1.0.0-rc.1`, `1.0.0-rc.2`… y el lanzamiento es **1.0.0**.
- La versión vigente se guarda en `VERSION` hasta que exista `package.json`; desde 0.2.0 ambos deben coincidir.

## Ramas

| Rama | Propósito | Nace de | Se fusiona en |
|---|---|---|---|
| `main` | Solo versiones publicadas y etiquetadas | — | — |
| `develop` | Integración de versiones terminadas | `main` | `main` (release) |
| `{tipo}/{versión}-{slug}` | Trabajo de una versión | `develop` | `develop` |
| `fix/{versión}-{slug}` | Parche de una versión publicada | `develop` | `develop` |
| `release/1.0.0` | Congelación y candidatas del lanzamiento | `develop` | `main` y `develop` |

**Tipos:** `feat` (funcionalidad), `fix` (corrección), `chore` (infraestructura y mantenimiento), `docs` (documentación), `refactor`. Ejemplos: `docs/0.1.0-fundacion-documental`, `feat/0.9.0-boveda-byok`, `fix/0.9.1-rotacion-credenciales`.

Nunca se hace commit directo en `develop` ni en `main`.

## Ciclo de una versión

1. **Preparar.** El equipo mantenedor documenta la versión en su planificación interna: contexto, requisitos, archivos, validación y riesgos.
2. **Rama.** `git checkout develop && git checkout -b feat/X.Y.Z-slug`.
3. **Trabajo.** Commits atómicos con Conventional Commits en español: `feat(personajes): añade registro de consentimiento`. Sin secretos ni referencias a IA.
4. **Verificación local.** Lint, tipos, tests y build en verde. No se usa CI remoto como primera verificación.
5. **Revisión de código** del diff de la rama frente a `develop` antes de fusionar.
6. **Integración.** `git checkout develop && git merge --no-ff feat/X.Y.Z-slug` y borrar la rama local.
7. **Release.** Actualizar `VERSION`, `package.json` y `docs/CHANGELOG.md` en `develop`; después `git checkout main && git merge --no-ff develop -m "chore(release): vX.Y.Z"` y `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
8. **Publicar.** Cuando exista remoto: `git push origin develop main --tags` y, si se quiere, `gh release create vX.Y.Z --generate-notes`.
9. **Cerrar.** Marcar la versión como publicada en la planificación interna y guardar ese cambio con un commit en su repositorio.

No se abren pull requests para el trabajo rutinario: revisión y verificación son locales y el merge se hace en local. Las PR se reservan para contribuciones externas o cuando el propietario las pida.

## Definición de terminado

Una versión está terminada cuando:

- cumple los criterios de aceptación definidos para la versión;
- pasa lint, tipos, tests y build en local;
- tiene revisión de código sin hallazgos críticos abiertos;
- actualiza la documentación afectada y `docs/CHANGELOG.md`;
- si cambia algo visible, añade o actualiza las capturas de `docs/assets/capturas/` y la guía de usuario;
- no introduce secretos (comprobación de `git diff` antes de cada commit);
- el propietario aprueba la release.

## Operaciones que requieren confirmación explícita

`git push --force`, `git branch -D`, `git reset --hard`, borrar etiquetas publicadas y reescribir historia de `main` o `develop`.
