# ADR-0037 · Estilo animado con identidad anclada en un retrato maestro

- **Estado:** Aceptada para 0.31.0; calidad visual pendiente de la prueba real.
- **Versión:** 0.31.0
- **Fecha:** 2026-09-29

## Contexto

El montaje acepta cualquier clip, pero generar un personaje ilustrado coherente entre escenas exige fijar el
acabado antes del primer fotograma. Una persona real tiene derechos sobre su imagen y no se transforma en dibujo
por el mero hecho de elegir un preset. Los modelos de imagen y vídeo ya integrados aceptan prompt y referencia;
su fidelidad al estilo solo se puede medir con una prueba real de coste confirmado.

## Opciones

1. Tratar cada escena animada como un prompt independiente. Es sencillo, pero la identidad y el estilo derivan.
2. Crear un tipo nuevo de personaje animado. Duplica consentimiento, ficha y versiones sin necesidad.
3. Dar al personaje inventado un estilo versionado, una guía y un retrato maestro, y heredarlos en el proyecto.

## Decisión

Se elige la tercera opción. Solo los personajes **inventados** pueden tener `renderStyle = animado`; la base de
datos y el servidor rechazan esa combinación para personas reales. La guía guarda una instantánea del preset
activo de Admin › Presets y sus matices (paleta, trazo, detalle y referencias descriptivas). Los tres presets
iniciales son ilustración plana, 3D estilizado y anime; el administrador puede editar sus textos o desactivarlos.

Al aprobar un retrato generado se fija como `masterFrameMediaId`. La generación lo pone primero entre las
referencias, y Jev compara la identidad contra ese mismo medio. El estilo y la guía entran en la versión de la
ficha citada por cada trabajo; el proyecto hereda el acabado del protagonista y lo añade también a los planos
sin personaje. Mezclar acabados en una escena se rechaza antes de reservar créditos. Cambiar la guía crea
versión, retira las vistas del acabado anterior e invalida las aprobaciones. Los resultados ya pagados siguen
en la biblioteca como hechos históricos.

Se usan los modelos integrados: Nano Banana 2 Lite para retratos y Hailuo 2.3 para imagen a vídeo. La página
pública de Hailuo declara soporte para anime, ilustración y CGI, aunque el catálogo de precios no lo mencione.
No se incorpora Ideogram Character hasta medir una mejora que justifique el coste. La voz y la dirección siguen
los caminos existentes; si el motor hablado no conserva el dibujo, se usa el camino de lip-sync con audio propio.

La etiqueta visible de contenido sintético sigue siendo obligatoria también en proyectos totalmente animados
hasta la revisión legal de 0.41.0. No se interpreta que un dibujo exima automáticamente de transparencia.

## Consecuencias

El primer retrato aprobado es requisito para generar escenas animadas. Una nueva guía exige volver a aprobar
retrato y vistas; la interfaz explica el bloqueo. El coste se estima, confirma, reserva y concilia por el mismo
camino que cualquier generación. La prueba real debe medir reconocimiento entre dos escenas, fidelidad de los
tres estilos y habla dentro del máximo de 200 créditos autorizado por el propietario.
