# M5-00 · Rompedor (Integración del arte)

Rama `feat/M5-00-integracion-arte`. Tests nuevos: `tests/e2e/m5-00-rompedor.spec.ts` (39 ejecuciones en escritorio; 5 fallan a propósito, ver «Fallos»). Tests antiguos tocados: `tests/e2e/m1-global-rompedor.spec.ts` y `tests/unit/valle-rompedor-m102.test.ts`.

## Fallos

No hay S1 ni S2 de datos o juego roto, pero sí un fallo de profundidad que el jugador verá en cada árbol.

- **S2 (visual, mecánica de ver) · El protagonista se dibuja siempre encima de árboles y rocas, aunque pase por detrás.** Árbol y roca se hornean en el `RenderTexture` del terreno (`depth 0`) y el sprite del protagonista tiene `depth = y`, siempre mayor. Con los pies una media casilla al norte de un árbol, el cuerpo tapa la copa (64,6 % de los píxeles de la copa difieren con y sin personaje). Ocurre con cualquier árbol, no solo en un caso límite. Los edificios sí lo hacen bien (son `Image` con profundidad por la base). Capturas: `semilla-42-debug--movil-vertical.png` (el personaje sobre la copa del árbol de su derecha), `semilla-42-debug--movil-horizontal.png`, `m5-00-prof-con.png`. Arreglo posible: no hornear los árboles (sprites con `depth` = base, solo los visibles) o hornear solo el terreno y poner la decoración como imágenes. Test: «[S2] el protagonista que pasa por detrás (al norte) de un árbol queda tapado por la copa» (escritorio).
- **S3 · El relleno de zonas (`depth 1`) tiñe la copa de un árbol que está justo al sur de la zona.** La copa sobresale 3 casillas hacia el norte y la capa de zonas va por encima de la decoración horneada: la zona dibuja un rectángulo sobre la copa (53,5 % de los píxeles de la copa cambian al pintar la zona). Capturas: `m5-00-zona-copa.png` (el recuadro sobre el árbol). Mismo origen y mismo arreglo que el anterior. Test: «[S3] el relleno de una zona justo al norte de un árbol no tiñe su copa».
- **S3 · Rendimiento a DPR 2 (sin GPU): las fps caen a ~35-40 % de las de DPR 1.** Medido en 412×915, Chromium con renderizado por software: Vida 60,4 → 22,2 fps; Plano 51,1 → 19,1. El barrido «móvil vertical, zoom máximo» de M1 tarda ahora 3,1 min con un tope de 240 s (pasa, con 77 s de margen; el móvil emulado Pixel 7 usa factor 2). Es el coste previsto de 4 veces más píxeles y, sin GPU, no demuestra nada sobre un móvil real, pero deja poco margen: si el tope del test se reduce o la máquina va justa, vuelve a fallar. Tests: «[S3] vida: …» y «[S3] plano: a DPR 2 las fps no caen por debajo del 60 % de las de DPR 1» (fallan a propósito; el umbral es una pregunta para el orquestador, no un tope de producto).

### Visuales (sin test, por captura)

- **S3 (menor) · Costura tenue entre tiles de hierba al acercar.** En `m5-00-costuras-dpr2-5.png` y `m5-00-costuras-dpr1-3.png` se ve una trama de saltos verticales y horizontales cada casilla (a DPR 1 el salto de brillo en el borde es unas 3 veces el medio, ~3 niveles de gris). No hay hueco de fondo (ver «Resiste»), solo variantes de tile que no encajan del todo. Visible solo cerca del zoom máximo.
- **S3 (menor) · Las tarjetas translúcidas del HUD dejan ver árboles y rocas detrás** (la fecha, en `semilla-42-debug--movil-vertical.png`: el árbol se transparenta tras «Día 1 de Primavera»). Antes no se notaba con el dibujo procedural. Legible, pero ensucia.
- **S3 (menor) · En el vado, el camino es una caja de arena recortada** (`semilla-7-debug-en-vado--movil-horizontal.png`): el tile de camino no tiene transición con el agua. Es limitación del arte (no hay tile de orilla).
- Nada ilegible, cortado ni demasiado pequeño en las vistas escritorio, móvil horizontal y vertical de Vida y Plano, ni en la portada.

## Tests antiguos (decisiones del orquestador)

1. `m1-global-rompedor.spec.ts` «DPR alto…»: sin `test.fail`, comprueba `canvas.width = CSS × min(DPR, 2)` (con DPR 3 el tope es 2, con margen de ±1 %). Pasa.
2. `valle-rompedor-m102.test.ts` «ninguna forma de la decoración se sale de su casilla»: **reescrito** para el dibujo real (`rectDecoracion`/`escalaDecoracion`: la base cae en su casilla, el sprite queda centrado, la escala va de 0,9 a 1,1, y la roca no sobresale por los lados). Ya no importa `dibujarDecoracion`: el implementador puede borrarla de `src/game/valle/dibujar.ts` (sin más usos en `src/` ni en `tests/`; quitar también el comentario que cita el test).

## Resiste

- **Puntero y táctil con DPR 1, 2 y 3** (contexto móvil 412×915, CDP táctil): el toque en Vida fija el destino exactamente en la casilla tocada; el toque en Plano elige la parcela esperada; un arrastre con un dedo con el pincel de zonas pinta exactamente el rectángulo bajo los dedos (ni una casilla de más o de menos); tocar una casilla con una silueta de la caja la coloca sobre esa casilla; el pellizco acerca y deja el punto bajo los dedos a menos de media casilla; el joystick respeta 10 px = toque y 11 px = joystick, mueve al personaje y se dibuja a tamaño y posición correctos (capturas `m5-00-joystick-dpr2.png` y `-dpr3.png`).
- **Giro y redimensionado a DPR 2** (915×412, 412×915, 640×320 y de vuelta): el lienzo es siempre CSS × 2, la cámara informa en píxeles CSS y el toque sigue cayendo en su casilla.
- **Carga @1x/@2x**: con DPR 1, 1,25 y 1,49 solo se piden archivos `@1x`; con 1,5, 1,75, 2, 2,625 y 3 solo `@2x`; el lienzo mide CSS × min(DPR, 2) en todos. Sin errores de consola.
- **Texturas y portada**: la portada y el valle se alternan sin errores y con más texturas al jugar; cinco reinicios del valle dejan el mismo número de texturas y de objetos.
- **Costuras con fondo**: a DPR 1, 2 y 3, en seis zooms de la rueda y en el cruce de los trozos horneados del centro, no aparece ni un píxel del color de fondo en el valle (sin huecos).
- **Edificios en sus tres estados**: casa, cobertizo y caja de envío durante 4 días: cimientos el primer día de una obra de varios días (la casa y el cobertizo; capturas `m5-00-edificios-dia1.png`), andamio el segundo, terminado al final (`dia4`); cada día cambia lo dibujado, los carteles («3 días», «2 días», «1») se leen, `edificios()` y las obras cuadran, y no hay avisos de textura ni errores de consola.
- Núcleo: `npx vitest run` pasa entero (978 tests, más el reescrito); `tsc`, `eslint` y `prettier` limpios.

## No cubierto

- Móvil real con GPU: la medida de fps es de Chromium por software.
- Cambio de DPR en caliente (arrastrar la ventana entre monitores, zoom del navegador): el factor se recalcula en el `ResizeObserver`, no probado.
- Edificio tapando al protagonista con píxeles en el estado terminado (tras un desmayo el personaje reaparece en la puerta y no pude situarlo detrás sin teletransporte; la profundidad por la base se ve correcta en `m5-00-edificios-dia4.png`).
- Colocar edificios con el ratón con DPR alto en escritorio (solo táctil).

## Ronda 2

Tras `678077e` y `9a2016c` (árboles y rocas como `Image` con profundidad por su base, en una capa con pool).

### S2 y S3 de la ronda 1: resueltos

Eran fallos de la geometría de mis tests, no del juego. La región (`−62..−22`) caía sobre el aire de las ~30 filas transparentes de arriba de `arbol@1x.webp` (64×96). Ahora la región sale de la máscara de alfa del PNG (filas con alfa >= 250 en las columnas medidas), con la escala de la variante (0,9 a 1,1) y la base `(y+1)·32` de `rectDecoracion`. Se guardan capturas con la región en rojo (`capturas/m5-00-region-s2.png`, `-s2-lado.png`, `-s3.png`) y se comprobó a ojo que cae sobre la copa.
- **S2 (al norte)**: el personaje pegado al árbol por el norte solo solapa unos píxeles de la copa (la colisión lo deja con los pies en y·32−6 aprox.). Test válido pero débil, así que añadí «[S2] … en la fila del árbol, a su lado»: pies a `x·32−10`, `y·32+12` (detrás de la base), con el cuerpo solapando el borde de la copa. Diferencia con y sin personaje: **0,000** (umbral 0,05).
- **S3 (zona al norte)**: diferencia en la copa **0,000** (umbral 0,02). Control añadido: el suelo despejado entre la copa y el borde norte de la zona sí cambia (73,7 %), así que la zona se pinta de verdad.
- Los tests no bajan umbrales ni intención.

### Fallos nuevos

- **S3 · `contarEn` (el `enVista` de `objetosCapa()`) cuenta objetos repetidos cuando la vista sobrepasa el borde este del valle** (zoom mínimo: se vio 880 con solo 657 obstáculos en el valle). `seleccionar` solo acota índices de cubeta por abajo (`Math.max(0, …)`): con `bx1 >= n` la clave `by·n+bx` se solapa con la fila siguiente y se visita dos veces. `actualizar` no se ve afectado (indexa por `id` en un `Map`), solo el gancho; no hay efecto visible. Arreglo: acotar `bx1`/`by1` a `n−1`. Test: `tests/unit/capa-objetos-rompedor.test.ts` (2 tests, ambos fallan).
- **S3 (infraestructura de tests, ya existía) · «sin costuras ni huecos de fondo con zooms fraccionarios y medio píxel» (`rendimiento-rompedor.spec.ts`) nunca se ejecuta.** Está en la regex `SOLO` (excluido de `escritorio`) y se salta por nombre de proyecto `!== 'escritorio'` en los proyectos `-solo`. Ejecutado a mano (copia sin skip) falla con 272 px de racha de fondo a zoom 0,94: el punto de aparición está cerca del borde sur del valle y la vista se sale del mundo, que enseña el color de fondo. No es regresión del arte, pero el test está muerto y su criterio ya no vale con ese encuadre.
- **S3 (flaky) · «al girar el móvil el lienzo sigue a CSS×2 y el toque sigue cayendo en su casilla» falló una vez** con la tanda completa en paralelo (destino 23,74 en vez de 49,91 a 915×412) y pasó 3 de 3 a solas. Sospecho la espera de 250 ms tras redimensionar con carga alta. No reproducible.
- **S3 de arte, sin test**: la costura tenue entre tiles de hierba es de las 4 variantes con brillo distinto (decisión del orquestador: es del arte).

### Resiste

- **Pool de la capa**: 40 pasos aleatorios (salto de cámara, rueda de zoom a ráfagas, arrastres rápidos con ratón) en Plano; tras cada paso `0 < activos <= enVista`, y cada 10 pasos la pantalla con el pool es idéntica (< 0,5 % de píxeles distintos) a la misma vista con la capa rehecha desde cero y `objetosCapa()` es igual. Sin objetos que se queden, falten o parpadeen en el borde, y sin errores de consola.
- **Pérdida de contexto WebGL**: perder el contexto, mover la cámara a otro sitio y volver durante la pérdida, y restaurar deja la misma pantalla y el mismo recuento (captura `m5-00-contexto-pool.png`).
- **Revalidado con los cambios** (escritorio y móvil): puntero y táctil a DPR 1, 2 y 3, costuras a DPR 1, 2 y 3, edificios en sus tres estados, portada y texturas, reinicios del valle, carga `@1x`/`@2x`. Todo pasa (36 pasan, 39 omitidos por proyecto, 1 flaky arriba).
- **Rendimiento con `workers=1`** (`escritorio-solo` y `movil-solo`): pasan los que no se omiten; fps sin GPU de ~34 de día y ~26 de noche en escritorio. Los tests de fps a DPR 2 se omiten sin GPU.
- **Visual**: `semilla-42-debug--*` son la portada, nítida y legible en las tres vistas. En `m5-00-contexto-pool.png` los árboles y el personaje (detrás de un árbol) se ven bien.

## Ronda final

Sobre `bcffdd7`. Tests nuevos: `tests/e2e/m5-00-final-rompedor.spec.ts` (DPR en caliente, ganchos durante la carga, capturas y escala de grises) y 5 casos más en `tests/unit/capa-objetos-rompedor.test.ts` (fake ampliado con `setAngle`, `setAlpha`, `clearTint`, `setVisible`).

### 1. Fallos sin atribuir (comparados con `hito/M5-cultivos-herramientas`, worktree temporal ya borrado)

Con `workers=1` y los 4 ficheros (116 tests) en `bcffdd7`: **91 pasan, 0 fallan** (25 omitidos por diseño). En la base: 91 pasan, 2 fallan (`DPR alto` de `m1-global`, que M5-00 arregla). Con workers en paralelo (carga) fallan 21 en `bcffdd7` y 8 en la base.

- **`seleccion-parcela` (2, escritorio)**: fallan igual en la base con carga y pasan con `workers=1`. Ya existía; inestable por carga. No es regresión.
- **`m4-global-rompedor` (móvil)**: con `workers=1` pasa en ambas ramas. Con carga fallan por timeout de 30 s «exclusión mutua», «mover un edificio…» y «fps granja llena»; en la base fallan los dos primeros en escritorio y «Vida con cada panel» en ambos. Inestable por carga; en móvil con DPR 2,625 es algo más sensible (lienzo con 4x píxeles, software). No es regresión.
- **`modos-rompedor` «el personaje empieza en pantalla»**: **sí es específico de M5-00** (con 8 workers: 10 de 16 fallan en `bcffdd7`, 0 de 24 en la base; siempre semilla 1, la primera carga, a 2240-2600 px). Causa: `EscenaValle.init` asigna `_partida`, así que `estado`, `camara()` y `personaje()` devuelven datos mientras el arte aún se carga (`escenaActiva()` todavía no es `valle`) y la cámara está sin configurar (zoom 1, scroll 0,0). El arte final alarga el `preload` y la ventana se ve con carga. **S3**, sin efecto para el jugador (es solo de ganchos; el comentario de `partida` dice «undefined hasta `create()`», que no es cierto). Test determinista (frena `/assets/**` 700 ms): `m5-00-final-rompedor.spec.ts` «[S3] mientras el arte se carga…» (falla). Arreglo: que `camara()`/`personaje()` exijan `e.scene.isActive()` y la cámara creada, o asignar `_partida` en `create()`.
- **`m1-global-rompedor` «zoom máximo» (móvil)**: no es un fallo, es tiempo. Con `workers=1`: móvil vertical y horizontal **2,9 min** en `bcffdd7` contra **1,3 y 1,2 min** en la base (escritorio 1,3 contra 1,2 min; «horneado» 52 s contra 28 s). El límite del test es 240 s. Con carga superan los 240 s (4,0 min, timeout) en `bcffdd7` y pasan en la base. La causa es el DPR 2 de M5-00 (la base dibujaba a DPR 1: su test `DPR alto` falla), no la capa de objetos (escritorio no cambia). **S3 de infraestructura**: conviene subir `setTimeout` de 240 a 420 s o fijar `deviceScaleFactor: 1` en ese barrido. Los demás fallos de `m1-global` («Vida tras el Plano», con carga) también fallan en la base.

### 2. Capturas finales (`capturas/m5-00-final--*`, las tres vistas, Vida y Plano)

Personaje tras un árbol (`vida-arbol`): bien, el árbol le tapa los pies. Tras la casa (`vida-edificio`): el tejado lo oculta por completo (profundidad por la base, esperado). Zonas y obras (`plano-zonas`): se leen, los árboles quedan sobre el relleno. Problemas:
- **S3** `plano-zonas--movil-horizontal`: el aviso «Obra empezada…» tapa el cartel «3 días» y parte de la obra; el bloque de recursos del HUD tapa el borde norte de la parcela.
- **S3** `barra-zonas--movil-horizontal`: la barra tapa el tercio inferior de la parcela (donde están Cultivo y Huerto) con el pincel activo; en `movil-vertical` no ocurre.
- Sin problema: botones de la barra de más de 44 px en móvil, texto legible, nada fuera de pantalla. En Vida la cámara no centra al personaje cerca del borde sur (queda abajo): es el tope del mundo, esperado.

### 3. Barra de zonas en escala de grises

Luminancia media de las muestras (Cultivo, Huerto, Vivienda, Almacén; Borrar aparte): 141,7 / 121,3 / 131,1 / 134,3 (escritorio); la diferencia mínima entre dos zonas es **2,6 a 4,9 sobre 255** (1 a 2 %) en las tres vistas. En `m5-00-final--barra-gris--*.png` las cuatro muestras de 22 px parecen cuadrados grises casi idénticos, solo con textura distinta. **S3 (accesibilidad)**: no se distinguen sin color; la etiqueta de texto lo compensa, pero la muestra no sirve para casar con el mapa. Test (falla, con `expect.soft` para recorrer las tres vistas): «árbol, edificio, zonas, barra de zonas y escala de grises…», umbral 18/255. Arreglo: variar la luminosidad de las muestras o añadir un borde/patrón distinto por zona.

### 4. Ataques nuevos

- **DPR en caliente** (`setDeviceMetricsOverride` 1→2→1→3→1,25→2→1 sin cambiar el tamaño CSS, 412x915 y 1280x720): pasa. Nota: Chromium con CDP cambia `devicePixelRatio` pero **no dispara `change`** en las `MediaQueryList` (ni siquiera en las del propio test), así que se envía el evento a mano a las listas que crea el juego (espía de `matchMedia`). Con eso: el lienzo es CSS × min(DPR, 2), la cámara informa el tamaño CSS, el toque cae en su casilla y el juego rearma la consulta con el nuevo valor. El navegador real sí avisa; lo no cubierto es esa parte. Las texturas siguen siendo las del primer DPR (@1x tras 1→2: algo borrosas hasta recargar; no lo considero fallo).
- **Id por casilla, reutilización y `reemplazar`** (unit, 5 casos, todos pasan): quitar un obstáculo del medio mantiene la misma imagen en los demás; una imagen con ángulo, alfa, tinte e invisible vuelve limpia al reutilizarse; `reemplazar` parcial conserva la imagen y la animación de lo que no cambia, resetea la de lo que cambia, libera la de lo que desaparece y no filtra imágenes; cambiar solo el `rect` no deja huérfanos; el conjunto vacío libera todo y se puede repoblar. No hay forma de quitar obstáculos desde `__raices` aún.

### Resiste

Pool de la capa, id por casilla, `reemplazar` sin invalidar, DPR en caliente (con el evento enviado), halo, y los 91 tests de los 4 ficheros con `workers=1`.
