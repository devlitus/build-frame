# M4-05 · Informe del rompedor

Rama `feat/M4-05-construir` sobre 9c712a0. Antes de añadir nada, `vitest` pasa entero (836 tests) y también las specs `construir`, `humo` y los proyectos `escritorio-solo` y `movil-solo`.

Tests nuevos:
- `tests/prop/construir-m405-rompedor.test.ts`: 15 tests, de los que 2 fallan a propósito. Los dos solo se dan con estados extremos o corruptos.
- `tests/e2e/construir-rompedor.spec.ts`: 18 tests por proyecto (escritorio y móvil), de los que 5 fallan a propósito.

Con estados reales, el núcleo (economía, catálogo, silueta) no tiene ningún fallo. Los fallos están en la interfaz.

## Fallos

- **S2: en 640×320 la silueta aparece debajo del panel.** Al elegir un edificio, la silueta se sitúa bajo el panel Construir. Se ve «✓ Aquí se puede construir» y se puede pulsar «Construir aquí» y confirmar sin haber visto dónde. En esa pantalla, la franja libre entre el HUD y el panel no existe (`puntoClicCasilla` de la silueta inicial da `undefined`). Capturas: `m405-silueta-inicial--baja.png` y `m405-silueta-roja--baja.png`. Test: «[S2] 640×320: catálogo, colocación y confirmación caben y la silueta se ve» (escritorio y móvil).
- **S3: en 640×320 el catálogo tapa el HUD.** El catálogo (`max-height: 60vh`, anclado a 72 px del borde inferior) sube hasta y≈60. Tapa los materiales, el dinero y los controles de tiempo justo cuando hacen falta para elegir. Además, el Cobertizo queda cortado y solo se ve desplazando el panel. Captura: `m405-catalogo--baja.png`. Lo comprueba el mismo test anterior, con una aserción blanda: «Materiales tapado por el catálogo».
- **S3: un doble toque en «Construir» de la confirmación elige otro edificio.** El primer toque construye y vuelve a pintar el catálogo, y el segundo cae sobre la opción que queda debajo (en Pixel 7, el Cobertizo). El jugador acaba colocando un cobertizo que no ha pedido. Solo se construye una vez y no se cobra nada de más. Test: «[S3] doble clic en «Construir» de la confirmación…» (falla en móvil; en escritorio pasa porque ahí cae en hueco).
- **S3: mantener Enter construye sin una segunda pulsación.** Enter en el lienzo abre la confirmación con el foco en «Construir». La repetición automática de la misma tecla (`repeat: true`) llega al botón y construye sin que el jugador suelte la tecla ni lea la pregunta. El lienzo ya ignora `ev.repeat`, pero el botón no. Test: «[S3] mantener Enter (repetición) no debe construir sin una segunda pulsación».
- **S3: con ratón, la ayuda del panel dice «Toca o arrastra para mover la silueta; confirma con el botón».** Existe el texto `construirAyudaSiluetaTeclado` («Mueve la silueta con el ratón o las flechas; Enter construye»), pero no se usa en ningún sitio. Captura: `m405-silueta-verde--escritorio.png`. Test: «[S3] con ratón la ayuda del panel no habla de tocar…».
- **S3 (estado corrupto): «Te faltan Gratis».** Con un dinero que no es un entero seguro (100,5, 2^60 o NaN), `faltaPagar` da `fondos-insuficientes`, pero `faltan` sale todo a 0. El catálogo muestra entonces «Te faltan Gratis», también en la casa, que es gratis. Test: «[S3] con dinero no entero (o > 2^53) el catálogo dice «Te faltan Gratis»».
- **S3 (límite): la silueta es verde pero Construir da `limite-de-dia`.** Con `dia = MAX_SAFE_INTEGER - 1`, `colocacionValida` acepta y `Construir` rechaza, así que la silueta miente. Si se confirma, el jugador ve el aviso de rechazo. No es alcanzable jugando. Test: «[S3] con el día en el límite la silueta es verde pero Construir da limite-de-dia».

### Visuales (sin test)

- **S3: el cartel de las obras no se lee con el zoom inicial del Plano.** El texto mide unos 5 px en móvil vertical y unos 8 px en escritorio. Capturas: `m405-obras--movil-vertical.png` y `m405-obras--escritorio.png`.
- **S3: el cartel de una obra 1×1 es más ancho que la obra.** Mide 54 px y la caja 32 px. Tapa casi todo el andamio de la caja y se monta sobre la obra vecina: en `m405-obras--escritorio.png`, «1 día» pisa el andamio de la casa.
- **S3: con el zoom inicial, la silueta de 1×1 mide unos 16 px.** En escritorio cuesta encontrarla. El bermellón sobre el amarillo del Almacén tiene poco contraste, aunque el aspa ayuda a distinguirla. Capturas: `m405-silueta-verde--escritorio.png` y `m405-silueta-roja--escritorio.png`.
- **S3: en 915×412 la franja libre entre el HUD y el panel mide unos 90 px.** La silueta queda pegada al borde del panel y, en la confirmación (que es unos px más alta), queda tapada. Capturas: `m405-silueta-verde--movil-horizontal.png` y `m405-confirmacion--movil-horizontal.png`.
- **Bien:** contorno sepia en la casa, la caja, el cobertizo y el andamio (`m405-edificios--*.png`). En vertical el catálogo y la confirmación se leen enteros (`m405-catalogo--movil-vertical.png`). La silueta roja lleva aspa y se distingue sin depender del color.

## Resiste

- **Refactor sin cambio de comportamiento.** Probé `colocacionValida` y `faltaPagar` con un oráculo que copia las reglas de pago anteriores (600 casos), con dinero y materiales negativos, NaN, ±Infinity, fraccionarios, 2^53 y -0, y con `ignorarCostes`. Coinciden siempre. `unicoYaExiste` también, con y sin `ignorarId`.
- **El catálogo y la confirmación coinciden con Construir** (1.500 casos con importes en la frontera de cada coste, y con la casa en obra o sin ella):
  - un motivo del catálogo implica que `Construir` rechaza con ese mismo motivo;
  - sin motivo, `Construir` acepta, y `restoTrasPagar` es exactamente lo que queda;
  - `pagado` es el coste mostrado;
  - nada queda en negativo.
- **Partidas de hasta 60 construcciones (200 partidas).** Cada pago es exactamente el coste del catálogo, el dinero y los materiales nunca son negativos y nunca hay dos casas.
- **La silueta no miente** (1.500 casos). Probé estados con zonas aleatorias (vivienda, almacén y cultivo encima) y obras construidas por comandos reales, centros en el interior y fuera del valle, y bordes (-3…lado+4). Verde siempre implica que `Construir` acepta, y roja que rechaza con el mismo motivo. La huella siempre queda dentro del valle y contiene la casilla apuntada. `esquinaDeSilueta` es correcta en huellas pares e impares de 1 a 6.
- **Partida y confirmación:**
  - `construirAqui` dos veces seguidas construye una sola vez;
  - pedir de nuevo la confirmación sin edificio no hace nada;
  - en 40 intentos de segunda casa, ninguno se acepta;
  - si el dinero cambia con la confirmación abierta, se rechaza sin cobrar;
  - volver a Vida con la confirmación abierta la cierra.
- **D1, D2, D3** coinciden con `data/edificios.json`.
- **Cartel:** con desmayos reales, cada tipo cuenta n, n−1, …, 1 y la obra termina el día `diaFin`. En e2e, la casa muestra 3, 2 y 1 y luego aparece el edificio.
- **Doble clic en «Construir aquí» y en el valle** (escritorio y móvil): abre la confirmación con el foco en «Cancelar» y no construye. Una pulsación de Espacio (bajar, 150 ms, soltar) tampoco construye.
- **Esc a destiempo:** la secuencia Esc ×4 desde la confirmación primero cancela, luego cierra el modo y las demás no hacen nada. El foco no se queda en `<body>`. **M** con la confirmación abierta pasa a Vida sin cobrar y, al volver, no queda nada abierto.
- **Segundo dedo** a mitad de arrastre: la silueta vuelve a la casilla anterior, no se confirma nada y el siguiente toque vuelve a colocar.
- **Zona borrada con la confirmación abierta:** la confirmación se cierra, la silueta pasa a roja y no se cobra.
- **320×640:** el catálogo, la colocación y la confirmación caben, los botones miden al menos 44 px y la silueta se ve.
- **Contexto WebGL perdido y recuperado:** con una obra y una caja, `edificios()` no cambia y la imagen es la misma (diferencia dentro del ruido).
- **Fugas:**
  - 5 obras dan exactamente 2 objetos cada una (Graphics y Text);
  - tras 3 desmayos queda 1 objeto por edificio y ninguna textura más que al empezar;
  - 4 reinicios de escena con una obra a medias dejan los mismos objetos y texturas.
- **Rendimiento:**
  - `escritorio-solo` (6 pasan, 3 omitidos) y `movil-solo` (5 pasan, 4 omitidos) en verde;
  - en escritorio, mover la silueta del cobertizo sobre un valle con 5 edificios da un mínimo de 36,5 fps (45,4 con el valle quieto en la misma máquina).

## Observaciones (sin test)

- Con el ratón, mientras se coloca no se puede arrastrar la cámara (`dedosParaArrastrar = 2` también afecta al ratón). Un arrastre lleva la silueta y, al soltar, abre la confirmación en el punto de destino. No construye nada, porque hace falta otro clic, pero sorprende a quien arrastra para mover la vista.
- En Plano el tiempo está detenido, así que el personaje no puede entrar en la huella después de elegir posición. Los únicos cambios de estado posibles con la silueta quieta vienen de los ganchos de depuración, y los cubren los tests anteriores.
