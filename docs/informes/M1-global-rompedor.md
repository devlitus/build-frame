# M1 · Pasada global del rompedor (estabilización)

Rama `fix/M1-estabilizacion` (= `hito/M1-valle`, `f84e6ec`). Tests nuevos:
`tests/e2e/m1-global-rompedor.spec.ts` y `tests/prop/estado-m1-global-rompedor.test.ts`.

## Fallos

| Sev. | Test | Descripción |
|---|---|---|
| S3 | `DPR alto: el lienzo se dibuja a la resolución del dispositivo (nitidez)` (falla en los dos proyectos) | Con `deviceScaleFactor: 3` y 412 px CSS, el lienzo mide 412 px de búfer (`{"w":412,"cssW":412,"dpr":3}`). `Phaser.Scale.RESIZE` no tiene en cuenta `devicePixelRatio`: todo se dibuja a 1/3 de la resolución y el navegador lo amplía. Se ve en las capturas de móvil (Pixel 7, DPR 2,625): bordes de casilla, rocas y el texto «NN fps» salen borrosos. A zoom 2,5 se suma que las texturas horneadas están a 1 texel por px de mundo y se amplían con filtrado lineal. No impide jugar; es la primera impresión en el móvil. |

No encontré fallos S1 ni S2. Todos los fallos de los rompedores de M1-01 a M1-04 tienen ya su test en verde, incluidos el S2 del contexto WebGL y los 4 S3 de la cámara.

## Aceptación del ROADMAP: «se recorre todo el valle»
Test `se recorre todo el valle › …` (6 casos, todos pasan). Con zoom máximo (2,5) y mínimo (encuadre), en escritorio 1280x720 con ratón y en móvil 412x915 y 915x412 con gestos táctiles (CDP), desde el centro se arrastra hacia las 8 direcciones. Se alcanzan las cuatro esquinas y los cuatro bordes exactamente (±0,5 px de mundo) y la vista nunca sale del mundo. Con zoom mínimo, el eje corto encuadra el mundo entero y el largo lo centra.

## Rendimiento (escritorio headless, Chromium sin GPU, SwiftShader)
- Prueba aislada (1 worker), `?semilla=42`, 1280x720: **reposo 36,9 fps** (rAF); **durante 5 s de arrastre y rueda continuos, 36,4 fps** (rAF) y 43,3 fps según `game.loop.actualFps`. Arrastrar y hacer zoom no cuesta fotogramas respecto al reposo.
- Con la suite completa en paralelo (CPU compartida), 10-11 fps de rAF. El techo lo pone el renderizado por software, no el juego.
- No es comparable con los 60 fps del ROADMAP: hace falta medir con GPU real (PC y móvil medio) en la demo.

## Lo que resiste
- **Flujo completo** (escritorio y móvil, sin errores de consola ni de página): portada → «Nueva partida» → zoom y arrastre → girar y volver a girar → recargar (vuelve a la portada) → «Nueva partida». La segunda partida tiene otra semilla y la cámara vuelve al encuadre inicial centrado. Girar tras dejar la portada no da errores, aunque `EscenaPortada` deja su oyente de `resize` vivo (ver observaciones).
- **`?semilla` con «Nueva partida»**: con `?semilla=abc` se abre la portada; «Nueva partida» da un uint32, y abrir `?semilla=<esa>` reproduce la misma cámara inicial.
- **Horneado en los bordes**: con zoom 2,5 en las cuatro esquinas, menos del 2 % de la pantalla tiene el color de fondo (no aparecen trozos sin hornear ni huecos).
- **Contador de fps con zoom y giro**: sigue en la esquina superior izquierda (píxel oscuro de su fondo en (10,10)), con el texto `^\d+ fps$`.
- **`reiniciarValle` y cámara** (3 reinicios con zoom y arrastre previos): la cámara vuelve exactamente al encuadre inicial; un arrastre de 100 px mueve 100/zoom, así que los oyentes no se duplican; redimensionar después deja la vista dentro de límites.
- **Núcleo**: `crearEstadoInicial` con valle es JSON puro (sin `undefined`, NaN, -0, clases ni funciones; 200 semillas). La ida y vuelta por JSON y `structuredClone` es exacta, y el estado restaurado responde igual a los comandos. Con la semilla 42 ocupa unos 3,6 KB.

## VERSION_FORMATO 2 (solo informativo, para M7)
- Es coherente: v2 = v1 + `valle`, y no hay partidas v1 guardadas. La primera migración real será la de M7 o posterior.
- El estado guarda las 36 parcelas y el cauce, pero **no** las casillas de río ni la decoración: la capa de juego las recalcula a partir de `valle` y `semilla` (`casillasRio`, `decorarValle`). Al cargar una partida de M7 el aspecto solo será idéntico si esas funciones no cambian. Si cambian, el terreno guardado sigue siendo válido pero los árboles y rocas se mueven. Conviene decidir en M7 si eso es aceptable o si se versiona el algoritmo de decoración.
- ADR 0001 prevé «36 parcelas × 256 casillas»; el estado actual no guarda casillas (3,6 KB). Cuando los cultivos y edificios vivan por casilla habrá que subir la versión.
- `dineroInicial` no se valida: `NaN` o `Infinity` producirían un estado que JSON no conserva (`null`). Hoy siempre se pasa 0; habrá que validarlo en M3.

## Observaciones (sin test, deuda)
- `EscenaPortada.create` hace `this.scale.on('resize', …)` y no lo quita al parar la escena: tras «Nueva partida» cada giro sigue reajustando la imagen ya destruida. No da errores (lo cubre el flujo completo), pero es una fuga de oyente.
- Los tests largos del e2e (8 direcciones × 2 zooms, 25 pellizcos) tardan entre 1 y 4 min con la CPU compartida; llevan `test.setTimeout` amplio. Con la suite en paralelo, el del contador falló una vez por tiempo antes de ampliarlo, y luego pasó 3 de 3 en solitario.

## Verificación visual (`npm run build` + `scripts/capturas.mjs`, puerto 4175 libre, build `v0.0.0+f84e6ec`)
Sin errores de página en ninguna captura.
- `inicio--escritorio.png`: portada ilustrada; título, lema y «Nueva partida» legibles y centrados; versión abajo a la derecha. Correcta.
- `inicio--movil-horizontal.png`: igual, con el botón grande (más de 44 px) sobre el puente. Correcta.
- `inicio--movil-vertical.png`: encuadre recortado en el río y el puente; botón grande y centrado. La versión («v0.0.0+f84e6ec») queda sobre las flores con poco contraste, pero es legible.
- `semilla-42--escritorio.png`: valle a zoom 0,6, unas 4x2,5 parcelas, río en L arriba a la izquierda, bordes claros y nítidos. Correcta.
- `semilla-42--movil-horizontal.png`: unas 3x2 parcelas; se ve **borroso** (DPR) y hay un marco oscuro de 1 px en todo el borde de la pantalla.
- `semilla-42--movil-vertical.png`: 2x3,5 parcelas con el río vertical a la izquierda; borroso y con el mismo marco oscuro.
- `semilla-42-debug-propias-0-1-6--escritorio.png`: contador «47 fps» arriba a la izquierda, legible. Tapa parte de la esquina de la parcela propia 0 (borde dorado); solo se ve esa propia en el encuadre inicial.
- `semilla-42-debug-propias-0-1-6--movil-horizontal.png`: contador «38 fps» legible pero con el texto borroso; no se ve ninguna propia en el encuadre inicial (ya se sabía por M1-03).
- `semilla-42-debug-propias-0-1-6--movil-vertical.png`: contador «37 fps», borroso; tampoco se ve ninguna propia.
- `semilla-7--escritorio.png`: valle distinto (sin río visible en el encuadre, más bosque), terrenos bien distinguibles. Correcta.
- `semilla-7--movil-horizontal.png`: bosque, prado y rocoso distinguibles; borroso y con el marco oscuro.
- `semilla-7--movil-vertical.png`: lo mismo en vertical; borroso y con el marco oscuro.

Ninguna vista tiene texto solapado ni elementos cortados, y nada depende del *hover*. El único botón (portada) supera los 44 px en las tres vistas. El problema visual común a las seis capturas de valle en móvil es la falta de nitidez (fallo S3 de DPR); el marco oscuro de 1 px probablemente sea el mismo efecto de ampliación en el borde del lienzo.
