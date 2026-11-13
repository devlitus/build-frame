# M4 · Pasada global del rompedor (Zonas y construcción)

Rama `fix/M4-estabilizacion` sobre `hito/M4-zonas-construccion` (M4-01 a M4-06). Tests nuevos:
- `tests/prop/m4-global-rompedor.test.ts` (2 tests; pasan).
- `tests/e2e/m4-global-rompedor.spec.ts` (14 tests, 28 ejecuciones entre escritorio y móvil; 3 tests fallan a propósito en 4 ejecuciones, ver «Fallos»).

## Fallos

No he encontrado fallos S1 ni S2. El núcleo resiste todas las partidas aleatorias (ver «Resiste»).

- **S3 (regresión de tests, bloquea la tanda completa) · Tres e2e de M1 fallan siempre desde M4-06:** `camara-rompedor.spec.ts` «rueda con deltaY enorme, 0 y negativo…» y «ventana diminuta…» (escritorio) y «tres dedos no producen NaN…» (móvil). No es un fallo de la cámara: comprueban `Number.isFinite` sobre **todos** los valores de `__raices.camara()`, y M4-06 (`af77670`) le añadió el campo `guiando`, que es booleano (`Number.isFinite(false)` es `false`). Fallan también aislados y con 1 worker. Como son tests de rompedor, decide el orquestador: o se filtran los campos numéricos en esos tres tests, o `guiando` sale a otro gancho. Hasta entonces, `npm run e2e` no puede quedar en verde para la PR del hito.

- **S3 · Con la casa terminada, el aviso del desmayo dice «Despiertas en la entrada del valle», pero el personaje despierta en la puerta de la casa.** `avisoDesmayo` es el texto de M2-06 y M4-03 no lo cambió cuando añadió el despertar en casa (`personajeAlDespertar`). El jugador lee una cosa y ve otra, justo el día en que termina su primera casa. Arreglo posible: un segundo texto («Despiertas en casa») cuando hay casa terminada, decidido por el evento o comparando la posición con la aparición. Test: «[S3] con la casa terminada, el aviso del desmayo dice «Despiertas en la entrada del valle» aunque despiertas en la casa» (escritorio y móvil).
- **S3 · Teclado: con el zoom del Plano, un edificio de la parcela de la aparición no se puede elegir con Enter.** Enter elige «el edificio del centro de la vista», pero con el zoom del Plano (0,6 en 1280×720) la cámara no puede centrarse más allá de la fila 77,3 ni fuera de las columnas 33 a 63: el valle se acaba. La parcela de la aparición (filas 80 a 95) es la primera que compra casi todo el mundo, así que la casa, la caja y el cobertizo suelen quedar ahí. Con las flechas la vista se para en el borde y Enter elige la parcela, no la casa. Solo se puede acercando antes con `+` (el recorrido de teclado completo lo hace así y pasa). La ayuda de lector de pantalla no lo dice. Arreglo posible: que Enter mire también el edificio bajo la parcela elegida, o un ciclo de edificios con Tab o con una tecla. Test: «[S3] teclado, zoom del Plano: un edificio de la parcela de la aparición no se puede elegir con Enter…» (escritorio).
- **S3 · Móvil vertical, zoom inicial: con el panel Construir abierto, la parcela de la aparición queda bajo el panel y la cámara no baja más.** Es la parcela de la fila inferior del valle (la aparición está siempre al sur). El panel ocupa la mitad baja de la pantalla y la cámara no pasa del borde del valle, así que ni arrastrando con dos dedos se ven más que sus 4 últimas filas (92 a 95), en la franja entre el panel y el borde. Además, la silueta nace en la zona libre de arriba, en tierra ajena (roja, «Parte de la huella no es tuya»). Se puede construir pellizcando para acercar o tocando en esa franja con la silueta medio tapada, pero el primer «construye tu casa» en el móvil en vertical es confuso. La barra de zonas tiene el mismo problema, más pequeño. Arreglo posible: que con el panel abierto la cámara pueda pasar del borde lo que mide el panel (la `extension` que ya usa la selección de parcela), y que la silueta nazca en la parcela propia más cercana. Test: «[S3] móvil vertical, zoom inicial: con el panel Construir la parcela de la aparición queda bajo el panel…» (móvil). Capturas: `m4-final--panel-construir--movil-vertical.png` y `m4-final--panel-construir--baja.png`.

### Visuales (sin test, por captura)

- **S3 · El aviso junta dos frases sin punto:** «Te quedaste dormido… Despiertas en la entrada del valle Obra terminada: Cobertizo». `Aviso.tsx` une las partes con un espacio (`partes.join(' ')`). Pasa siempre que un desmayo termina una obra. Captura: `m4-final--vida--movil-vertical.png`.
- **S3 · En 640×320, con la silueta elegida, el panel Construir tapa la píldora «En pausa (Plano)».** Se transparenta «En p…no)» bajo la cabecera del panel. Con el catálogo (sin silueta) M4-05 lo dejó bien, pero con la silueta elegida el panel es más alto y vuelve a subir. Los botones de tiempo siguen libres. Captura: `m4-final--panel-construir--baja.png`.
- **S3 (menor) · Las casillas del fondo del valle que quedan bajo los botones de abajo no se pueden tocar al zoom inicial** (por ejemplo (40, 93) y (40, 94) bajo «Construir» en vertical), porque la cámara no pasa del borde. Es el mismo origen que el fallo anterior; basta con otra columna o con acercar. Lo anoto sin test aparte.

## Resiste

- **Partida completa por la interfaz** (escritorio y móvil; clics, toques y arrastres reales; economía real de 1.100 monedas, 80 de madera y 20 de piedra). Pasos: Plano con el botón, primera parcela con el panel y la confirmación (en escritorio la 32 de la aparición por 540; en móvil la 24 por 700, por el fallo de arriba), vivienda y almacén con el pincel, y casa, caja y cobertizo con catálogo, silueta, «Construir aquí» y confirmación (quedan 210 o 50 monedas, 10 de madera y 10 de piedra). Después: Vida, 600 minutos sin desmayo (el día no cambia y las obras siguen igual), tres desmayos (la caja termina el día 2, el cobertizo el 3 y la casa el 4; hasta entonces se despierta en la aparición y después en la puerta), mover la casa (gratis) y desmayo con la casa movida (se despierta en la puerta nueva), mover la caja, demolerla (la confirmación dice «25 monedas y 10 de madera» y es lo que se cobra), construir otra caja y cancelar la obra (devuelve todo), y borrar y pintar cultivo sobre todo el rectángulo. En cada paso cuadran `data-dinero`, la cifra del HUD con su punto de millar, `data-madera` y `data-piedra`, los ganchos `dinero()`, `materiales()` y `reloj()`, y lo dibujado (`edificios()`: id, tipo, posición, obra y días del cartel), contra un modelo propio. Lo que hay bajo los edificios conserva su zona compatible y el resto pasa a cultivo. El patrimonio no crece. Sin errores de consola.
- **Interacciones** (escritorio y móvil):
  - Comprar una parcela con una obra activa: la obra no cambia (sitio, obra y cartel) y se cobra una sola vez. Un cobertizo a caballo de las dos parcelas es válido.
  - Mover una caja a una zona y borrar la zona con el pincel: la casilla bajo la caja conserva su zona, el hueco viejo conserva la suya y moverla una casilla hacia lo borrado da `zona-incompatible`.
  - Pasar a Vida (M o el botón) con cada cosa abierta: la confirmación de compra de una parcela vecina, el pincel a mitad de arrastre (ratón pulsado o dedo puesto), Construir con la confirmación, una obra con la confirmación de cancelar y el modo mover con la silueta desplazada. Todo se cierra, al volver a Plano no queda nada abierto y no cambian dinero, materiales, edificios, zonas ni parcelas.
  - Exclusión mutua de los paneles (parcela, pincel, Construir y edificio) en 12 aperturas cruzadas: nunca hay dos abiertos. El botón Construir se oculta con un panel de parcela o de edificio abierto (es lo diseñado). Tocar una obra con la parcela de debajo elegida cambia de panel.
- **Solo teclado** (escritorio): M a Plano, Enter para elegir la parcela, flechas hasta la 32, Tab hasta «Comprar por 540», Enter, Shift+Tab hasta «Comprar», Enter y Esc. Después, Tab hasta «Zonas» y, para cada herramienta, Tab, Enter, Tab al lienzo, Enter para el cursor, flechas, Enter y flechas y Enter (pinta lo esperado). Esc suelta el cursor y cierra la barra. Para la casa y la caja: Tab hasta «Construir» y el edificio, Enter, flechas para la silueta, Enter para la confirmación y Enter para construir. Para mover la casa: `+` para acercar, Enter, Tab hasta «Mover», Enter, flechas y Enter. Para demoler la caja: Enter, Tab hasta «Demoler», Enter, Shift+Tab hasta «Sí, demoler» y Enter. Dinero y edificios cuadran. El foco nunca se pierde en `<body>`.
- **Núcleo, partidas largas con fast-check** (300 partidas de 150 a 400 acciones, con semilla aleatoria; ahorros de 1.100, 5.000 o 100.000 y lote de 80/20 o 600/150). Mezclan todos los comandos de M2 a M4: tiempo, desmayo, andar, modos, pausa, velocidad (también inválida), compra, pintar, borrar, construir, mover, demoler y cancelar. Las acciones se resuelven contra el estado para que muchas se acepten: en una pasada, 789 construcciones, 659 cancelaciones, 85 movimientos, 43 demoliciones, 300 compras, 7.739 pintados y 3.731 borrados aceptados, además de rechazos de todos los motivos, incluido `bloquea-paso`. Invariantes en cada paso, todos cumplidos:
  - dinero y materiales son enteros seguros ≥ 0;
  - no hay solapes; cada huella está dentro del valle, en parcela propia, fuera del río (vados incluidos) y de los obstáculos, sin tapar la aparición y siempre sobre una zona compatible;
  - hay como mucho una casa, los ids son únicos y menores que `siguienteIdEdificio`, y ninguna obra vencida sigue en pie;
  - el patrimonio (dinero + madera + piedra + lo pagado por lo que sigue en pie) solo baja al comprar (el precio exacto) o al demoler (exactamente lo no devuelto); construir, cancelar, mover, las zonas y el tiempo no lo cambian;
  - el personaje y el punto donde despertaría son alcanzables desde la aparición (con un recorrido propio, sin `mapaTransitabilidad`), y si la puerta de la casa está libre se despierta en ella;
  - las zonas miden lado², solo tienen caracteres válidos y solo están en parcelas propias y fuera del río;
  - un comando rechazado devuelve el mismo objeto, y el estado sobrevive a JSON.

  Al final, tres desmayos terminan siempre todas las obras. Además, 30 partidas repetidas dan el mismo estado (determinismo).
- **Granja llena** (las 36 parcelas propias, zonas en franjas por todo el valle, casa y 3 cajas; el lote de bienvenida no da para más, porque no hay gancho de materiales). Seis rondas de construir y cancelar una obra, mover las cajas y la casa ida y vuelta, borrar y pintar todo el valle dos veces, desmayo, elegir un edificio y abrir y cerrar Zonas y Construir. Después quedan los mismos objetos, `Graphics` y texturas que con la granja terminada (escritorio y móvil). Las texturas bajan respecto al valle vacío, no suben.
- **Contexto WebGL** perdido y recuperado con la granja llena, de noche (`hora=23:00`), con un edificio elegido: se restaura, los edificios son los mismos, la imagen es idéntica (diferencia media 0,00–0,01 sobre 255, con 4 repeticiones) y después se puede abrir el pincel. Al principio el test fallaba a veces. La causa era el propio test: el aviso «Obra empezada…» desaparecía entre las dos fotos. Ahora espera a que se vaya.
- **Rendimiento**: ver la tabla de abajo.

## Rendimiento (Chromium sin GPU)

Test «fps con la granja llena…» (rAF durante 2,5 s; las 36 parcelas propias, zonas en franjas por todo el valle, casa y 3 cajas), en la tanda completa con 2 workers:

| Proyecto | Valle vacío | Plano lleno | Plano + panel del edificio | Vida (en pausa) |
| --- | --- | --- | --- | --- |
| escritorio 1280×720 | 26,6 | 20,5 | 19,1 | 20,0 |
| móvil (Pixel 7) | 60,3 | 60,3 | 60,2 | 60,3 |

En escritorio, las zonas por todo el valle cuestan un ~23 % y el panel otro ~7 %. En el móvil emulado, con un lienzo más pequeño, no se nota. El test falla por debajo de 15 fps o del 60 % del valle vacío. Los proyectos `escritorio-solo` y `movil-solo` (lanzados aparte con `--no-deps`, uno cada vez) pasan: 6 pasan y 3 se omiten, y 5 pasan y 4 se omiten. Entre ellos está «pintar todo el valle repetidamente no hunde los fps».

## Verificación visual

Capturas finales de la granja de ejemplo en `capturas/m4-final--<vista>--<pantalla>.png`, generadas por el último test del spec. La granja tiene economía real: la parcela 32, vivienda, almacén, cultivo y huerto, casa, cobertizo y caja de envío. Pantallas: `escritorio` (1280×720), `movil-horizontal` (915×412), `baja` (640×320, táctil) y `movil-vertical` (Pixel 7). Vistas:
- `vida`: día 3, con la casa todavía en obra;
- `plano`;
- `panel-parcela`, `panel-zonas`, `panel-construir` (caja elegida), `panel-edificio` (cobertizo), `confirmar-demoler` y `panel-obra` (casa en obra);
- `vida-terminada` y `plano-terminada`: día 4, con todo terminado.

Las he mirado:
- `plano-terminada--escritorio` y `vida-terminada--escritorio`: la granja se lee bien: casa con su tejado sobre vivienda (verde azulado), cobertizo y caja sobre almacén (amarillo con cuadros), cultivo (franjas) y huerto (puntos) debajo. El HUD marca 210 monedas, 10 de madera y 10 de piedra. Limpias. La parcela queda pegada al borde inferior porque es la fila baja del valle.
- `plano-terminada--movil-vertical`: la granja ocupa el tercio inferior y se ve grande. «Construir» y «Zonas» tapan parte del cultivo y del huerto, pero se ve igual.
- `panel-construir--movil-vertical` y `--baja`: ver los fallos de arriba (la parcela bajo el panel, la silueta en tierra ajena y la píldora tapada en 640×320).
- `confirmar-demoler--movil-vertical`: «Recuperas: 150 monedas, 25 de madera y 5 de piedra», con los botones grandes. El cobertizo elegido se ve sobre el panel. Limpia.
- `panel-edificio--baja`: la tarjeta lateral no tapa el HUD; el cobertizo elegido se ve a la derecha. Limpia.
- `panel-zonas--movil-horizontal`: la barra en una fila, el pincel de huerto elegido y la granja encima (con la casa en obra y su cartel «1 día»). Limpia.
- `vida--movil-vertical`: ver el aviso sin punto.

Recomendadas para la PO: `m4-final--plano-terminada--escritorio.png`, `m4-final--plano-terminada--movil-vertical.png`, `m4-final--vida-terminada--escritorio.png`, `m4-final--confirmar-demoler--movil-vertical.png` y `m4-final--panel-zonas--movil-horizontal.png`.

## No cubierto

- Una granja con muchos edificios: no hay gancho de depuración para materiales y el lote de bienvenida da para la casa y 3 o 4 cajas. El rendimiento con decenas de edificios queda sin medir.
- Pellizco real en móvil para comprobar el rodeo del fallo de móvil vertical; el arrastre con dos dedos sí lo probé.
- Lector de pantalla real, móvil real con GPU y `safe-area`, como en M3.

## Resultado de las suites

- `npm run check` por partes: lint, formato y tipos en verde; `vitest run`: **920 tests en 67 archivos, todos pasan**. Con la tanda e2e corriendo a la vez, 7 tests de vitest dieron timeout; aislados pasan: es inestabilidad por carga.
- `PUERTO_E2E=4417 npx playwright test --project=escritorio --project=movil --workers=2` (19,8 min): **502 pasan, 7 fallan y 179 se omiten**. Los fallos:
  - los 4 nuevos a propósito: el aviso del desmayo (escritorio y móvil), el de teclado y el de móvil vertical;
  - los 3 de `camara-rompedor.spec.ts` que rompe el campo `guiando` (ver «Fallos»), que fallan también aislados.

  El resto de los e2e de M1 a M3 que tocan cámara, selección, compra, tiempo y personaje pasan.
- `escritorio-solo` y `movil-solo` con `--no-deps`: 11 pasan y 7 se omiten; ningún fallo.
