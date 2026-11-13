# M4-06 · Informe del rompedor

Rama `feat/M4-06-mover-demoler` sobre c03bef9. Antes de añadir nada, `vitest` pasa entero salvo el test inestable conocido del implementador (ver abajo). También pasan las specs `mover-demoler`, `humo` y `construir-rompedor` y los proyectos `escritorio-solo` (6 pasan, 3 omitidos) y `movil-solo` (5 pasan, 4 omitidos).

Tests nuevos:
- `tests/prop/mover-demoler-rompedor.test.ts`: 11 tests, todos pasan. El núcleo resiste.
- `tests/e2e/mover-demoler-rompedor.spec.ts`: 17 tests por proyecto. Fallan a propósito 6 en escritorio y 3 en móvil.

El núcleo (economía, mover, D9) no tiene ningún fallo. Todos los fallos están en la interfaz y son S3.

## Fallos

- **S3: un doble clic o doble toque en «Sí, demoler» elige una parcela.** El primer toque demuele y cierra el panel. El segundo cae en el lienzo y abre el panel de la parcela que hay debajo. Solo se demuele una vez y no se cobra nada de más. Es el mismo caso que M4-05 resolvió en Construir con la ventana antidoble, que aquí falta tras confirmar. Test: «[S3] doble clic o doble toque en «Sí, demoler»…» (escritorio y móvil).
- **S3: un doble clic o doble toque en «Mover aquí» elige una parcela.** Es el mismo caso: el modo mover se cierra y el segundo toque selecciona la parcela de debajo. Test: «[S3] doble clic o doble toque en «Mover aquí»…» (escritorio y móvil).
- **S3: en su mismo sitio, la silueta de mover es verde y el panel dice «✕ Ahí está ahora: elige otro sitio».** `comprobarMover` acepta el sitio actual, así que `silueta().resultado.valida` es `true` y el lienzo la pinta verde. El panel, en cambio, la da por mala y desactiva «Mover aquí». Es lo primero que se ve al pulsar «Mover». Captura: `m406-mover-inicio--*.png`. Test: «[S3] en su mismo sitio la silueta de mover no se pinta verde…» (escritorio y móvil).
- **S3: Enter con la silueta en su mismo sitio sale del modo mover.** Viene de lo mismo. El teclado mira `resultado.valida`, que es `true`, y llama a `moverAqui()`. Esta acepta el comando sin cambios y cierra el modo, aunque el panel diga «elige otro sitio» y el botón esté desactivado. Si el jugador pulsa «Mover» con Enter y vuelve a pulsar Enter, sale sin haber hecho nada. Test: «[S3] Enter con la silueta de mover en su mismo sitio no sale del modo…».
- **S3: en escritorio queda un rectángulo transparente bajo el panel del edificio.** Es el «rectángulo blanco» que vio el implementador, pero no es transitorio: con el panel abierto se ve siempre, también 3 s después. Mide 292×112 px, el ancho del contenido del panel, y está unos 60 px por debajo de él. En la captura hay 32.704 píxeles con alfa 0 que el visor pinta de blanco. No es ningún elemento del DOM: `elementsFromPoint` solo devuelve el lienzo. Desaparece al ocultar `.edificio-acciones` o al ponerle `position: static`, así que la causa es el `position: sticky` de `.panel-parcela-acciones` dentro de este panel. El panel de parcela usa la misma clase y no lo produce. Puede ser un fallo de composición de Chromium sin GPU, pero se reproduce siempre y también en vertical y en 640×320. Capturas: `m406-panel--escritorio.png`, `m406-confirmacion-demoler--escritorio.png`, `m406-confirmacion-demoler--baja.png` (franja blanca sobre el HUD), `m406-confirmacion-demoler--movil-vertical.png` y `m406-casa--movil-vertical.png`. Test: «[S3] escritorio: con el panel del edificio abierto la captura no tiene huecos transparentes».
- **S3: en 640×320 el panel tapa el HUD y «Zonas» tapa «No, conservar».** El panel queda centrado sobre «En pausa (Plano)», «II» y «x1»: el texto de la píldora se transparenta en la cabecera del panel y «x1» no se puede pulsar. En la confirmación, el botón «Zonas» cae encima de la mitad derecha de «No, conservar» y de «No, seguir con la obra». Pulsar ahí abre el pincel en vez de cancelar. No destruye nada, porque «Sí» queda libre. El aviso de arriba a la izquierda también queda cortado. **Viene de antes:** el panel de parcela hace lo mismo en 640×320, y el de edificio lo hereda. Capturas: `m406-panel--baja.png`, `m406-confirmacion-demoler--baja.png` y `m406-confirmacion-cancelar--baja.png`. Test: «[S3] 640×320: el panel del edificio y su confirmación no tapan el HUD…».

### Visuales (sin test)

- **S3: con la casa elegida, el resalte tapa el tejado.** El tejado sobresale de la huella y queda bajo el relleno crema del resalte, cortado por arriba. Captura: `m406-casa--*.png`.
- **S3: con una obra 1×1 elegida, el resalte apenas se distingue** del andamio y del cartel. Captura: `m406-obra--escritorio.png`.
- **Bien:**
  - el panel, la casa con su nota («La casa es única…») y sin «Demoler», la obra con «Cancelar obra» y las confirmaciones con el reembolso exacto se leen enteros en escritorio, 915×412 y vertical;
  - los botones miden al menos 44 px;
  - la silueta verde y la roja (con aspa) se ven en las cuatro vistas, también en 640×320 (`m406-mover-verde--baja.png` y `m406-mover-rojo--baja.png`).

## Resiste

- **Economía (fast-check, 150 partidas de hasta 30 pasos en 3 valles con edificios ya levantados).** Las partidas mezclan construir, mover a sitios, mover a ±4 casillas, mover a cualquier casilla (dentro o fuera del valle), demoler, cancelar y pasar días. Se comprobó con una semilla fija que hay cientos de movimientos, demoliciones, cancelaciones y rechazos: `ocupada`, `fuera-del-valle`, `en-obra`, `agua`, `obstaculo`, `bloquea-paso`, `no-demolible` y `no-es-obra`. Resultados:
  - el patrimonio (dinero y materiales más lo pagado por lo que sigue en pie) no cambia al construir, mover ni cancelar;
  - al demoler baja exactamente en `pagado − floor(pagado/2)`;
  - nada queda en negativo ni deja de ser entero;
  - al quitar todo, nunca hay más que al empezar.
- **Reembolso:** el previsto (`reembolso()`, que es lo que muestra la confirmación) coincide con el del evento y con lo que se aplica. Demoler o cancelar dos veces, con cualquiera de los dos comandos, da `edificio-inexistente` sin tocar el estado.
- **Redondeo:** probé 400 valores de `pagado` arbitrarios (impares y hasta 2^40). Demoler devuelve `floor(p/2)` y cancelar devuelve `p`.
- **`limite-de-recursos`** (600 casos con dinero y materiales cerca de `MAX_SAFE_INTEGER`): aparece si y solo si alguna suma deja de ser un entero seguro, y entonces el estado no cambia.
- **Mover = construir sin ese edificio** (300 casos): `comprobarMover` da exactamente el veredicto de `colocacionValida(estadoSinEl, …, ignorarCostes)` en cualquier casilla, también a −5…lado+5 y a ±3 de la huella actual (solape consigo mismo). Una obra siempre da `en-obra`.
- **Tras cada movimiento aceptado:**
  - la huella queda dentro del valle;
  - no hay solapes;
  - no tapa la aparición ni la caja del personaje;
  - toda casilla que era alcanzable antes lo sigue siendo, salvo la nueva huella.
- **La casa** no se puede mover sobre la aparición en ninguna de sus 12 esquinas posibles, ni sobre el personaje.
- **D9 con la casa movida** (120 casos, en la mitad con una caja en la puerta): tras el desmayo, el personaje siempre está en una casilla alcanzable y libre. Si la puerta está libre, aparece en ella o a ≤2 casillas. Si está tapada, se usa el respaldo.
- **Refactor `estadoDeEdificiosValido`:** en 1.500 casos con materiales, ids, zonas y edificios corruptos (NaN, ±Infinity, 1,5, 2^53, -0, cadenas, null), `comprobarConstruir` coincide exactamente con una copia de la versión de `hito/M4-zonas-construccion`. No cambia nada.
- **Interfaz:**
  - mantener Enter sobre «Demoler» abre la confirmación pero no demuele;
  - un doble toque en «Mover» deja el modo mover abierto;
  - Esc ×5 desde la confirmación primero la cancela, luego cierra el panel, y el resto no hace nada (el foco no cae en `<body>`);
  - **M** con la confirmación abierta, o a mitad de mover, pasa a Vida sin demoler ni mover, y al volver no queda nada abierto.
- **Que se vea** (escritorio, 915×412, 640×320 y 412×915): el cobertizo elegido, con y sin la confirmación, no queda tapado. La guía de la cámara lo deja a la vista, incluso con el sitio más alejado del centro. La silueta de mover empieza visible. «Sí, demoler» cabe en la pantalla.
- **Dibujo:**
  - 6 ciclos de construir, mover (la casa incluida, que va y viene), demoler, construir y cancelar dejan exactamente un objeto más que al empezar (la casa) y ninguna textura nueva;
  - la profundidad de cada edificio es siempre `(y + alto) × 32` después de cada movimiento;
  - tras mover y con un edificio elegido, perder y recuperar el contexto WebGL deja la misma imagen y los mismos edificios.

## Notas

- **Test inestable del implementador:** `tests/prop/mover-demoler.test.ts`, «las partidas aleatorias llegan a mover, demoler y cancelar de verdad». También falló en mi ejecución completa de `vitest` (1 de 917). Sin semilla fija, sus generadores rara vez terminan un edificio antes de demolerlo. En mi generador eso se resolvió partiendo de valles con edificios ya terminados y fijando la semilla del test de cobertura.
- En 640×320 `puntoClicCasilla` devuelve `undefined` en toda la pantalla aunque no haya ningún panel, porque las reservas del HUD se comen la zona libre. Los ganchos `puntoClicEdificio` y `sitios` no sirven allí. Mis tests proyectan la casilla con la cámara y comprueban `elementFromPoint`.

## Resolución (orquestador)
- **Fallos 1 y 2 (doble toque en «Sí, demoler» y en «Mover aquí»):** resueltos en `731d3fb`. `seleccion.bloquearClics` hace que el lienzo ignore durante 400 ms el toque que sigue a la confirmación.
- **Fallos 3 y 4 (silueta en su mismo sitio):** resueltos en `731d3fb`. La silueta se pinta neutra y Enter no hace nada. `comprobarMover` no cambia.
- **Fallo 5 (hueco transparente bajo el panel):** resuelto en `731d3fb`. `.edificio-acciones` pasa a `position: static`.
- **Fallo 6 (640×320):** resuelto en `731d3fb`. Los paneles de parcela y de edificio pasan a tarjeta lateral en apaisado de alto ≤ 520 px.
- **Resaltes de la casa y de una obra 1×1:** resueltos en `731d3fb` con un aro exterior de tinta, amarillo y crema.
- **Test inestable del implementador:** resuelto en `731d3fb` con semilla fija y un valle que ya tiene edificios.
- **Inestabilidad de los e2e en `movil`** (detectada por el revisor): resuelta en `66da7ff`. Un centrado explícito anula el salto de cámara pendiente del desmayo, y los tests esperan a que la cámara deje de moverse (gancho `guiando`).
- **Textos de ayuda:** corregidos en `d38fad4` y en el commit final. La rueda acerca y aleja, y la vista se mueve con WASD o con dos dedos.
