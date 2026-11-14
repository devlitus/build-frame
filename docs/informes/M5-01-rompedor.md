# M5-01 · Rompedor (Inventario y herramienta activa)

Rama `feat/M5-01-inventario-herramientas`, sobre `f91cac8`. Tests nuevos:
- `tests/prop/inventario-rompedor.test.ts`: 6 tests del núcleo. Pasan todos.
- `tests/e2e/inventario-rompedor.spec.ts`: 20 ejecuciones entre escritorio y móvil, 7 omitidas por proyecto. **6 fallan a propósito**; ver «Fallos».

Test antiguo tocado: `tests/e2e/tactil-rompedor.spec.ts`, «clic en el agua (casilla bloqueada) va a la casilla libre más cercana». Lo decidió el orquestador. Ahora busca la casilla bloqueada a una distancia de Chebyshev ≥ 2: desde M5-01, un clic en una de las 8 vecinas usa la herramienta. Lo que comprueba no cambia: el destino es una casilla libre a ≤ 2,5 de la bloqueada. Pasa en escritorio y en móvil.

## Fallos

No hay S1. El núcleo resiste. Los fallos están en el foco del teclado y en la disposición en pantalla.

- **S2 · Si el inventario se cierra al cambiar de modo con M, las teclas de herramienta dejan de funcionar y un clic en el valle no lo arregla.**
  - Pasos: con I, el foco entra en el panel. Con M (atajo global de Phaser) se pasa al Plano y el panel se desmonta con el foco dentro, así que el foco cae en `<body>`. Con M se vuelve a Vida.
  - Desde ahí, 1–6, E, Espacio e I no hacen nada: `teclaVida` exige que el evento salga del lienzo o de `#juego`. WASD sí funciona, porque Phaser escucha en `window`.
  - Un clic en el lienzo no devuelve el foco (sigue en `BODY`), porque Phaser cancela el `mousedown`. Solo se recupera pulsando un botón del HUD o con Tab.
  - Medido con `document.activeElement`: `SECTION.panel-inventario` → `BODY` → `BODY` tras el clic.
  - Arreglo posible: devolver el foco a `#juego` cuando el panel se cierra con el foco dentro, por cualquier vía (`PanelInventario.cerrar` o un efecto al desmontar).
  - Test: «tras cerrar el inventario cambiando de modo con M, las teclas de herramienta siguen vivas» (escritorio).
- **S3 · Con el inventario abierto por teclado, un clic en el valle no saca el foco del panel.**
  - El personaje camina, pero 1–6 y E no responden hasta pulsar I, Esc o Tab. El origen es el mismo: el `mousedown` del lienzo no mueve el foco.
  - Arreglo posible: al recibir `pointerdown` en el lienzo, enfocar `#juego` si el foco está en el panel.
  - Test: «con el inventario abierto por teclado, un clic en el valle devuelve las teclas al juego» (escritorio).
- **S3 · En la esquina inferior izquierda del valle, la barra de herramientas tapa al personaje.**
  - La cámara está acotada al valle, así que con el personaje en (0,3; 95,7) queda debajo de la barra en las tres vistas: en (6, 657) en escritorio y en (6, 776) en móvil vertical.
  - Las casillas de alrededor tampoco se pueden tocar, porque las cubre la barra; E y el botón de acción sí funcionan.
  - Capturas: `m501-esquina-izq--escritorio.png`, `m501-esquina-izq--movil-horizontal.png` y `m501-esquina-izq--movil-vertical.png`.
  - Arreglo posible: margen de cámara bajo el HUD, o barra translúcida o que se aparte.
  - Test: «en la esquina inferior izquierda del valle, la barra de herramientas no tapa al personaje» (escritorio y móvil).
- **S3 · En móvil vertical, el panel de inventario tapa al personaje.**
  - El panel ocupa x 72–404 e y 242–703 de 412×839. Con el personaje lejos de los bordes, la cámara lo centra en (206, 419), debajo del panel: no se ve mientras se elige la semilla.
  - En escritorio y en móvil horizontal el panel queda justo a su izquierda y no lo tapa.
  - Captura: `m501-semilla-fresa--movil-vertical.png`. En ella el personaje se ve porque está en el borde sur, pero el panel cubre el centro de la pantalla.
  - Test: «con el personaje en medio del valle, el inventario abierto no lo tapa» (móvil).
- **S3 · En móvil vertical, el panel de inventario se monta 4 px sobre la barra de herramientas.**
  - El panel empieza en `left: 72px` y la barra acaba en x = 76: el borde del panel pisa el de la barra entre y = 505 y y = 703.
  - Captura: `m501-semilla-fresa--movil-vertical.png`, en el borde derecho de la columna de herramientas.
  - Test: «el panel de inventario no se solapa con la barra de herramientas ni con los botones de Vida» (móvil).

### Visuales (sin test, por captura)

- **S3 (menor) · En móvil horizontal, el panel solo enseña la primera fila de ranuras entera; la segunda queda cortada y hay que desplazarse** (`m501-semilla-fresa--movil-horizontal.png`). Se puede usar porque la caja tiene desplazamiento, pero no hay ninguna pista de que haya más ranuras debajo.
- **Observación · En móvil vertical, la barra de herramientas es una columna de 68×322 px en el borde izquierdo y ocupa casi el 40 % del alto.** No tapa al personaje en la aparición, pero deja poco sitio para apoyar el pulgar izquierdo (el joystick nace donde se apoya el dedo, así que no queda bloqueado). Captura: `semilla-42-debug--movil-vertical.png`.
- **Observación (latente, M5-05) · `Partida.elegirHerramienta('semillas')` deja una `semillaElegida` agotada si no queda ninguna semilla.** La barra diría entonces «Semillas (Semillas de fresa)» sin tener ninguna. Hoy no se alcanza, porque ningún comando gasta semillas; el núcleo sí la rechaza bien (`sin-semillas`, cubierto). Conviene revisarlo cuando M5-05 gaste semillas.
- Todo es legible en las tres vistas y no hay nada cortado fuera de pantalla. Los botones táctiles cumplen el mínimo: los de herramienta miden 48×48, «Cerrar» 70×44, las ranuras unos 95×88, «Usar …» 130×48 e «Inventario» 48 de alto. Capturas: `semilla-42-debug--*.png` y `m501-inventario-abierto--*.png`.

## Resiste

- **`UsarHerramienta` frente a un oráculo escrito aparte** (3000 casos, con cada veredicto visto más de 5 veces):
  - Estados aleatorios: Vida o Plano, con o sin pausa, el personaje en cualquier punto (también en los bordes, a 0,3 casillas), las 6 herramientas, semilla elegida o `null` e inventarios válidos aleatorios.
  - Coordenadas: vecinas a ±2 casillas, `-0`, 0,5, 1,0000001, `NaN`, ±∞, 2^53, −1, `lado`, `'3'`, `null`, `undefined`, `{}`, `[]` y dobles cualesquiera.
  - El veredicto coincide siempre. En los rechazos se devuelve el mismo objeto de estado; en los éxitos también, porque el efecto aún está vacío. El evento normaliza `-0`, el estado no se muta (JSON idéntico) y dos aplicaciones dan lo mismo.
- **`ElegirHerramienta` y `ElegirSemilla` con valores raros** (`'__proto__'`, `'constructor'`, `'toString'`, `'madera'`, `'piedra'`, productos, mayúsculas, espacios, números, `NaN`, objetos y arrays): rechazan con el mismo estado. Cuando aceptan solo cambia su campo, y elegir semilla no cambia la herramienta.
- **Semilla elegida agotada**: «Semillas» da `sin-semillas`, otra herramienta funciona, no se puede volver a elegir esa semilla y `ElegirSemilla(null)` la suelta.
- **Pilas en el límite**:
  - 98 + 2 da [99, 1], 99 + 1 da [99, 1] y 99 de golpe da una ranura.
  - Con el inventario justo en su capacidad se rellena la ranura incompleta, pero no se abre otra (todo o nada).
  - Las cantidades 0, −1, −0, 0,5, `NaN`, ±∞, 2^53 y `'3'` se rechazan al añadir y al quitar; también los objetos inexistentes y las capacidades raras.
- **Cobertizos y capacidad** (500 secuencias de hasta 80 pasos): construir (una obra no suma), terminar, demoler o cancelar, todo mezclado con añadir y quitar objetos.
  - Al bajar la capacidad no se pierde nada y el inventario no cambia.
  - Por encima de la capacidad no entra nada; quitar siempre funciona si hay bastantes.
  - La capacidad nunca baja de la base y el inventario siempre es válido.
- **Estado inicial**: es determinista, sobrevive a JSON, trae el lote de regalo y la herramienta inicial, y no comparte el array de `inventarioInicial`.
- **Clic y toque con DPR 1, 2 y 3** (escritorio con ratón y Pixel 7 con toque): las 9 casillas al alcance, incluida la propia, usan la herramienta exactamente en la casilla pulsada, sin destino. Una casilla a distancia 2 hace caminar y no usa la herramienta. La posición en pantalla se calcula con la cámara, no con `puntoClicCasilla`.
- **Joystick que empieza en una casilla pegada**: mueve al personaje y no usa la herramienta.
- **Teclado**:
  - E y Espacio mirando fuera del valle (borde oeste) dan `fuera-del-valle`, con aviso, sin destino y sin errores.
  - Shift+3, Shift+E y Alt+I no hacen nada.
  - Con el foco en un botón de herramienta, Espacio pulsa el botón y no usa la herramienta.
- **Giro con el inventario abierto** (915×412 → 412×915 → 915×412): el panel sigue dentro de la pantalla, con «Cerrar» de al menos 44 px, y elegir semilla funciona.
- **Exclusividad con los paneles de M4**: todos esos paneles son solo del Plano y `Partida.emitir` los cierra al volver a Vida, así que no pueden coincidir con el inventario. Al pasar al Plano, el inventario se cierra.
- `tsc` (los dos proyectos), `eslint` y `prettier` limpios en los ficheros tocados.

## No cubierto

- Lector de pantalla real (NVDA o TalkBack): solo se revisaron los roles, `aria-pressed`, `aria-label` y `aria-live` por DOM.
- Esquina inferior derecha frente a los botones de Vida: los árboles me impidieron llegar con `MoverPersonaje`.
- Teclados no QWERTY (AZERTY): se usa `ev.code`, así que debería funcionar, pero no se probó.

## Ronda 2

Sobre `6f79a6e` (arreglos de `110546e` y `6f79a6e`). Test nuevo: `tests/e2e/inventario-rompedor-r2.spec.ts`. Cada vista o esquina crea su propio contexto, así que casi todo corre solo en el proyecto `escritorio`.

Para separar regresiones de fallos antiguos, los tests que fallan también se lanzaron contra un build de `110546e` (el commit anterior a los arreglos).

### Fallos de la ronda 1

Los 6 tests de `inventario-rompedor.spec.ts` que fallaban **pasan ahora** en escritorio y en móvil (19 pasan y 7 se omiten por proyecto):
- foco tras M;
- clic en el valle con el panel enfocado;
- barra en la esquina suroeste;
- panel sobre el personaje en vertical;
- solape del panel con la barra.

La semilla agotada (punto 5) y los iconos (punto 6) también están resueltos.

### Fallos nuevos

- **S2 · Regresión: en Vida la cámara deja de estar acotada al valle y, en cualquier borde, enseña media pantalla de vacío.**
  - Causa: `margenesVida` pasa márgenes a `limitarEje`, y en cuanto un margen es mayor que 0, el rango del centro se abre a `[0, mundo]` **en los dos extremos del eje**. Ese comportamiento es el del Plano: «cualquier casilla puede quedar en el centro».
  - Efecto: en Vida la cámara centra al personaje aunque esté pegado al borde.
  - Medido:
    - Escritorio: 349 px de vacío bajo el borde sur, cuando la barra solo justifica 117, y 350 px sobre el borde norte, que no tiene ningún HUD.
    - Móvil horizontal: 195 px abajo y 196 arriba.
    - Móvil vertical: 196 px a la izquierda, cuando la columna justifica 100, y 195 px a la derecha, sin ningún HUD.
  - Rompe 2 tests que ya existían y que pasan con `110546e`:
    - `personaje.spec.ts:29` («…la cámara lo sigue»): la cámara queda 494 px lejos del centro esperado.
    - `m5-00-final-rompedor.spec.ts:64` (DPR en caliente, 1280×720): el toque cae 2 casillas más al sur, porque la cámara se recoloca después de calcular el punto.
  - Capturas: `m501r2-esquina-so--*.png`, `m501r2-esquina-ne--*.png` y `m501r2-esquina-so-abierto--movil-horizontal.png`.
  - Arreglo posible: en Vida, ampliar solo el extremo del eje que tapa la barra (`hi += abajo/zoom` o `lo -= izq/zoom`) y no abrirlo hasta `[0, mundo]`.
  - Tests: los 12 de «…, esquina …: la vista no enseña más fuera del valle que lo que tapa la barra» y «al girar el móvil en el borde oeste, la franja fuera del valle se ajusta a la barra».
- **S3 · En 320×568, el texto de «Cerrar» no cabe en su botón (desborda 13 px) y la caja del panel lo corta: se lee «Cerra».**
  - Captura: `m501r2-abierto--movil-320x568.png`.
  - Test: «320×568: el texto de «Cerrar» cabe en su botón y el botón en el panel».
- **S3 · En pantallas verticales bajas, la pista «▼» tapa la cantidad de la primera fila.**
  - El degradado de 26 px cae sobre «10» y «5»:
    - En 360×640, la cantidad ocupa y 473–489 y la pista empieza en y 478; la flecha queda encima del «10» de la patata.
    - En 320×568, la cantidad no se ve.
  - Con `max-height: max(150px, …)` solo cabe una fila, y sin su cantidad.
  - Captura: `m501r2-abierto--movil-320x568.png`. En 360×640 se vio en una captura de sondeo; no hay PNG en `capturas/`, pero lo reproduce el test.
  - Tests: «360×640 / 320×568: la pista «▼» no tapa la cantidad de la primera fila de ranuras».
- **S3 · Con el personaje pegado al borde oeste, el inventario abierto lo tapa en escritorio y en móvil horizontal.**
  - El panel ocupa la esquina izquierda: x 8–628 en escritorio y x 8–448 en horizontal. El personaje queda en (10, 350) y en (10, 196).
  - Ya pasaba con `110546e`: no es una regresión, pero la ronda 1 no lo cubrió (solo miré el centro del valle).
  - Captura: `m501r2-esquina-so-abierto--movil-horizontal.png` (el personaje asoma por detrás del borde izquierdo del panel).
  - Tests: «escritorio / móvil horizontal: con el personaje pegado al borde oeste, el panel abierto no lo tapa».
- **S3 (antiguo) · En el borde norte, la cabeza del personaje queda fuera de la pantalla.**
  - La cámara pone el borde del valle en el borde de la pantalla, y el sprite sobresale una casilla por encima de los pies: cabeza en y = −9 y pies en y = 10.
  - Hoy solo se ve en móvil vertical, porque en las otras vistas la regresión S2 centra al personaje. Volverá en las tres vistas cuando se arregle la S2.
  - Captura: `m501r2-esquina-ne--movil-vertical.png`.
  - Test: «ninguna esquina deja al personaje bajo el HUD ni fuera de la pantalla (las tres vistas)». Contra `110546e` fallaban además el suroeste de escritorio y el de vertical, bajo la barra; eso ya está arreglado.

### Visuales (sin test)

- La franja fuera del valle (verde oscuro liso) se ve en todas las capturas de borde (`m501r2-esquina-*`). Es la S2 de arriba.
- En móvil horizontal y en vertical, la pista «▼» se lee bien sobre las ranuras vacías (`m501r2-abierto--movil-horizontal.png` y `--movil-vertical.png`).
- Nada cortado ni ilegible en `m501r2-cerrado--*`, `m501r2-abierto--escritorio`, `m501r2-abierto--movil-vertical`, `semilla-42-debug--*` ni en los iconos de las semillas, que tienen el arte final.

### Resiste

- **Listener en `window`:**
  - Con el foco en `<body>`, 2, E e I actúan una sola vez: I abre y la siguiente I cierra.
  - Con el foco en `#juego`, E y Espacio usan una vez. I abre, el foco entra en el panel, y la siguiente I lo cierra sin reabrirlo; el foco vuelve a `#juego`.
  - No hay doble disparo: el `target` del evento es fijo, y el listener de `window` solo actúa con el `target` en `body` o en `html`.
  - En el Plano, con el foco en `<body>`, 1–6, E e I no hacen nada.
  - Con el foco en un botón del HUD, 1 y E no actúan sobre el juego.
  - Contra `110546e`, el test del foco en `<body>` fallaba, así que confirma el arreglo.
- **Diálogos de confirmación y paneles de M4:** son solo del Plano y el listener exige `modoAplicado === 'vida'`, así que no pueden recibir atajos de Vida. La portada no tiene la escena del valle activa.
- **`pointerdown` del lienzo:** en el Plano no roba el foco de la barra de zonas. Tab desde el lienzo va al primer botón del HUD; tras un clic en el valle el foco vuelve a `#juego` y Tab repite el mismo orden. Contra `110546e`, este test fallaba.
- **Clic o toque en la franja fuera del valle:** el personaje camina a la casilla libre más cercana del borde, sin errores. El joystick en el borde funciona igual.
- **Pista «▼»:** aparece cuando hay más ranuras, desaparece al desplazarse hasta el final y vuelve al subir (320×568). Tiene `pointer-events: none`: tocar una ranura justo bajo la flecha la elige (360×640 y 320×568).
- **Iconos `semilla-<id>`:** `@1x` con DPR 1 y `@2x` con DPR 2 y 3, `naturalWidth` mayor que 0 y ninguna respuesta 4xx.
- **Botón «Inventario»:** se oculta mientras el panel está abierto, así que el panel no lo tapa. Con el panel abierto, el resto del HUD sigue visible y se puede tocar en 412×839, 360×640 y 320×568.
- **Otros e2e:** `camara`, `personaje`, `valle`, `tactil`, `modos`, `hud`, `inventario.spec`, `humo` y `m5-00`: 265 pasan y fallan 3.
  - Dos son la regresión S2.
  - El tercero, `m5-00-rompedor.spec.ts:400`, ya fallaba con `110546e`: el toque en 412×915 no fija ningún destino. Ahora falla antes, en 915×412, por la S2.
