# Medir el rendimiento

Guía corta para comprobar, en tu navegador, cómo va Escenara en un móvil medio. Los objetivos del proyecto (desde la
0.45.0, ADR-0039) son:

| Medida | Qué es | Objetivo |
|---|---|---|
| **LCP** (Largest Contentful Paint) | Cuánto tarda en verse lo principal de la página | **< 2,5 s** |
| **INP** (Interaction to Next Paint) | Cuánto tarda en responder a un toque o una tecla | **< 200 ms** |
| **CLS** (Cumulative Layout Shift) | Cuánto «salta» la página mientras carga | **< 0,1** |
| **JavaScript por ruta** | Lo que descarga cada página al abrirla, comprimido | **200 KB** de meta; el build falla si una ruta pasa de su tope |

## 1. El presupuesto de JavaScript (automático)

`bun run build` termina con una tabla de cada ruta, su tamaño y su tope, y **falla** si:

- una ruta pasa de su tope: 200 KB, o el tope propio de las que hoy superan la meta (su tamaño medido más 3 KB, con el
  motivo, en `apps/web/presupuesto-js.json`; es deuda);
- hay una **pantalla nueva sin dar de alta**: el error dice cómo hacerlo. Si cabe en 200 KB, basta con añadirla a
  `dentroDeLaMeta`; si no, necesita un tope propio con su motivo y su «Medido: X KB.», y eso es una decisión, no un
  arreglo.

También **avisa** (sin fallar) si el «Medido» de un tope ya no es lo que pesa la ruta: toca actualizarlo.

La cifra del build sale de los manifiestos de Next y sobreestima un poco (del orden de un 1–2 %) frente a lo que
descarga el HTML servido: el error va del lado seguro.

**Si un despliegue urgente se bloquea por el presupuesto**, la variable `PRESUPUESTO_JS_SOLO_AVISO=1` en el entorno
del build lo convierte en aviso: el build sigue y el registro dice que el presupuesto no se cumple. Es una salida de
emergencia, no una forma de trabajar: quítala en cuanto esté arreglado.

## 2. Dos formas de medir el LCP, y por qué dan distinto

Lighthouse puede estrangular la carga de dos maneras. **Las dos cuentan**, y hay que anotar siempre con cuál se ha
medido:

- **Estrangulamiento real («DevTools throttling»)**: el navegador carga de verdad con la red y la CPU limitadas. Es lo
  más parecido a **lo que ve una persona** con un móvil medio.
- **Modo por defecto de Lighthouse («Simulated throttling»)**: carga rápido y **estima** cómo habría ido en un móvil.
  Es **más severo** en esta aplicación porque su modelo cuenta la descarga del JavaScript antes de pintar, aunque en
  la traza real la página se pinta antes de que llegue.

### Resultados de la 0.45.0 (mediana de 3 pasadas)

Medido en local sobre el build de producción (`next start`), perfil móvil de Lighthouse 12 (CPU ×4, 4G lento),
sin latencia de servidor real (todo en el mismo ordenador):

| Pantalla | LCP estrangulamiento real | LCP modo por defecto | TBT | CLS | Accesibilidad |
|---|---:|---:|---:|---:|---:|
| Portada | 1,44 s | **3,49 s** | 7–17 ms | 0 | 100 |
| Entrar | 1,38 s | 2,47 s | 16–18 ms | 0 | 100 |
| Tu biblioteca | 1,38 s | **3,22 s** | 18–37 ms | 0 | 100 |
| Crear (sin clave de KIE) | 1,39 s | 2,18 s | 27–48 ms | 0 | 100 |

- **El objetivo LCP < 2,5 s se cumple con estrangulamiento real** en las cuatro pantallas, **en local**.
- **Con el modo por defecto de Lighthouse no se cumple en la portada ni en la biblioteca.** En «Crear» el modo por
  defecto ha variado entre pasadas y versiones (de 2,2 a 2,9 s): tómalo como en el límite.
- **«Crear» se midió sin clave de KIE**, es decir, con el aviso de que falta la clave y no con el formulario entero.
  Su JavaScript es el mismo (lo descarga la página igual), pero el trabajo de pintar el formulario completo no está en
  la cifra.
- El INP no se mide así (hace falta tocar la página: ver la sección 4). El TBT, que es su indicador en laboratorio,
  queda por debajo de 50 ms.
- Qué objetivo manda (el real o el del modo por defecto) es una decisión del propietario. Acercar el modo por defecto a
  2,5 s pasa por bajar el JavaScript común de las pantallas con sesión.

## 3. Medir en Comet

1. Compila y arranca la versión de producción, no la de desarrollo (que no está optimizada): `bun run build` y después
   `bun --filter @escenara/web start` (usa el puerto 3021: para antes `bun run dev` si lo tienes abierto, y vuelve a él
   al terminar).
2. Abre **Comet** en una ventana de incógnito (sin extensiones que interfieran) y entra en tu instalación.
3. Abre la página que quieras medir y las herramientas de desarrollo: **Cmd + Opción + I** (macOS) o
   **Ctrl + Mayús + I**.
4. Pestaña **Lighthouse** → **Mode: Navigation**, **Device: Mobile**, marca **Performance** y **Accessibility**.
5. Mide **las dos veces**, tres pasadas cada una, y quédate con la del medio:
   - con el engranaje en **Throttling method: Simulated throttling** (el de por defecto);
   - con **DevTools throttling (advanced)**.
6. Anota LCP, CLS, Total Blocking Time (TBT) y la puntuación de accesibilidad **con el método de cada cifra**.

Si tu versión de Comet no trae la pestaña **Lighthouse**, la pestaña **Performance** (sección 4) enseña también el LCP
y el CLS en sus **Live metrics** al recargar la página.

## 4. INP (hace falta interactuar)

1. Herramientas de desarrollo → pestaña **Performance**.
2. En el engranaje: **CPU: 4× slowdown** y **Network: Slow 4G** (un móvil medio).
3. Mira el panel **Live metrics**: usa la página como siempre (abre un selector, marca una casilla, cambia de paso en
   «Crear»). El **INP** se actualiza con cada interacción; por debajo de 200 ms está bien.

## 5. Qué hacer si algo no llega

- **LCP alto:** mira en Lighthouse el elemento LCP y sus fases. Si el retraso es de carga, busca imágenes o vídeos que
  se descargan al abrir sin estar a la vista (deben ir con `loading="lazy"`). Si el modo por defecto va muy por detrás
  del real, lo que pesa es el JavaScript de la página.
- **INP o TBT altos:** busca componentes grandes que se hidratan al abrir y se podrían cargar al usarlos
  (`next/dynamic` con su `LimiteDeCarga`), como ya se hace con el editor de imagen y el diálogo de la biblioteca.
- **CLS:** una imagen o un vídeo sin tamaño reservado. Las tarjetas usan `aspect-*` para reservarlo.
