# Documentación de Escenara

**Escenara** · Estudio abierto de personajes y vídeo · «Da vida a cada escena»

Mapa de la documentación pública del proyecto. Versión actual: **0.7.0**. Para instalar y contribuir, empieza por el [README](../README.md) y la [guía de contribución](../CONTRIBUTING.md).

## Mapa de documentos

| Área | Documento | Contenido | Estado |
|---|---|---|---|
| Producto | [PRD](PRD_Plataforma_Open_Source_Avatares_Video_BYOK.md) | Requisitos, alcance, orquestación, arquitectura y entregas | Borrador 0.5 |
| Marca | [Guía de identidad](branding/ESCENARA_BRAND_GUIDE.md) | Nombre, voz, logotipos, paleta, tipografía y movimiento | 0.4 |
| Marca | [Tokens de marca](branding/escenara.brand.json) | Tokens editables de ambos temas | 0.4.0 |
| Diseño | [Dirección visual «Escenario»](diseno/direccion-visual-escenario.md) | Capa vibrante, parallax, animación, componentes de creador y zonas de claridad | Propuesta marca 0.5.0 |
| Arquitectura | [Visión de arquitectura](arquitectura/vision-arquitectura.md) | Componentes, flujo de generación, entidades y pila propuesta | Propuesta |
| Arquitectura | [Decisiones (ADR)](arquitectura/decisiones/README.md) | Índice de decisiones y plantilla | Licencia, lenguaje, runtime, despliegue, almacenamiento, modelos iniciales, interfaz y base de datos decididos; 4 pendientes |
| Recursos | [APIs, proveedores y servicios](recursos/apis-y-proveedores.md) | Qué servicio, para qué, dónde se obtiene la clave, documentación y precios | Vivo |
| Recursos | [Plantilla de claves API](recursos/claves-api.plantilla.md) | Estructura del documento privado de claves | Vivo |
| Privado | `privado/claves-api.local.md` | Claves reales. **Fuera de git** (`.gitignore`) | Local |
| Legal | [Cumplimiento y privacidad](legal/cumplimiento-y-privacidad.md) | Marco normativo y controles del producto | Lista de trabajo |
| Procesos | [Flujo de versiones y ramas](procesos/flujo-versiones-y-ramas.md) | Numeración, ramas, ciclo de una versión y definición de terminado | Vigente |
| Cambios | [CHANGELOG](CHANGELOG.md) | Historial de versiones | Vivo |

## Dónde va cada cosa

- `docs/`: documentación duradera del producto, la marca, la arquitectura, los recursos y los procesos.
- `docs/privado/`: solo en local; claves y datos personales. Nunca en git.
- `docs/assets/`: imágenes y recursos de apoyo de la documentación.
- `docs/assets/capturas/`: capturas de la plataforma para la guía de usuario y el README.

## Convenciones

- Español de España; nombres de archivo en kebab-case.
- Máximo 800 líneas por documento: si crece, se divide.
- Nada de secretos en documentos versionados.
- Las propuestas no cambian el PRD ni la marca hasta que el propietario las aprueba.
