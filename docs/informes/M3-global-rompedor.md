# M3 · Pasada global del rompedor (Parcelas)

Rama `test/M3-global-rompedor` sobre `hito/M3-parcelas` (#27 M3-01, #28 M3-02, #30 M3-03, #32 M3-04). Tests nuevos:
- `tests/prop/m3-global-rompedor.test.ts` (4 tests; pasan).
- `tests/e2e/m3-global-rompedor.spec.ts` (10 tests, 20 ejecuciones entre escritorio y móvil; 1 falla a propósito en escritorio, 5 se omiten por proyecto).

## Fallos

- S3 (accesibilidad) · **No se puede comprar una parcela solo con teclado.** En Plano no hay forma de seleccionar una parcela sin puntero: Tab recorre los botones del HUD (pausa, velocidades, modo) pero ninguno abre una parcela, y Enter, Espacio y las flechas sobre el lienzo solo mueven la cámara. Todo lo que hay *dentro* del panel sí funciona con teclado (ver «Resiste»), así que el hueco es solo la selección. El criterio de M3-03 pedía «clic o toque corto», así que no incumple la historia, pero sí el recorrido con teclado que pide la pasada global y la accesibilidad del GDD §8. Arreglo posible: con el lienzo enfocado en Plano, las flechas (o Tab) mueven un cursor de parcela y Enter la selecciona; o una lista de parcelas navegable en el DOM. Test: «se puede elegir una parcela y comprarla solo con teclado (Tab, flechas, Enter, Esc)» (escritorio).

Visuales (sin test, por captura):
- S3 · **El aviso «¡Parcela X comprada por N!» tapa la parcela recién comprada o la siguiente seleccionada en móvil.** En vertical el aviso queda bajo el HUD de dos filas, encima del borde superior de la parcela seleccionada (`m3-global-segunda--movil-vertical.png`); en horizontal tapa la esquina superior izquierda de la parcela comprada (`m3-global-tras-compra--movil-horizontal.png`). Dura 6 s y no capta toques (`pointer-events: none`), así que solo molesta a la vista. La guía de cámara no cuenta el aviso como zona ocupada.
- S3 (conocido, se confirma) · La moneda de «se vende» de la fila superior asoma por detrás del dinero del HUD (`…seleccion-33--movil-vertical.png`, `m3-global-confirmacion--movil-vertical.png`). Ya estaba en el informe de M3-04.

No he encontrado fallos S1 ni S2. Los fallos de M3-03 y M3-04 están corregidos en la rama (sus tests pasan; ver «Resultado de las suites»).

### Observaciones (sin test que falle)
- **`?debug` · `reiniciarValle` reconstruye la partida desde la URL.** `create()` vuelve a llamar a `crearEstadoInicial` y hace `partida.reemplazar(...)`: tras reiniciar, el dinero vuelve a los ahorros (o a `?dinero`), las compras se pierden (solo quedan las `?propias`) y el reloj vuelve a la hora inicial. Es el comportamiento de M2 y solo se llega con el gancho de depuración, así que no es un fallo del jugador. Pero la `Partida` que «sobrevive a los reinicios» no conserva el estado: cuando llegue el guardado (M7) o cualquier otra vía que reinicie la escena, habrá que crear el estado solo la primera vez. Lo coherente sí se cumple: tras 5 reinicios, HUD, estado y dibujo cuadran y una compra cobra una sola vez.
- Tras una compra, los toques y clics en el lienzo se ignoran 400 ms (anti doble clic de M3-04). Si el jugador toca otra parcela en ese margen, el toque se pierde sin aviso. Es corto y razonable; lo anoto porque los e2e lo notan si van rápido.
- Pulsar el botón de modo con un segundo dedo mientras el joystick está activo no cambia de modo en Chromium emulado (el navegador no genera `click` con dos dedos), pero el joystick se suelta. Es el mismo comportamiento que M2 vio con el botón de pausa; no hay nada colgado después.
- En el móvil, al pasar de Vida a Plano la cámara conserva el zoom de Vida y solo se ven unas pocas parcelas (en vertical, 2×4); para la compra hay que alejar. Es lo diseñado («cámara libre»), pero el jugador del móvil no ve el valle entero al entrar en Plano desde Vida (con `?modo=plano` sí se centra).

## Atacado y resiste

- **Partida completa por la interfaz** (escritorio y móvil, clics y toques reales sobre el lienzo): Vida con el reloj en marcha (`acelerar=30`) sin que cambie el dinero; Plano con el botón; primera compra en la parcela donde está el personaje; una no adyacente da botón desactivado con «Debe tocar una de tus parcelas» y no abre confirmación ni con clic forzado; adyacentes hasta que nada es comprable (todo lo que queda es `no-adyacente` o `fondos-insuficientes`). Tras cada compra cuadran HUD (`.dinero-cifra` y `data-dinero`), `__raices.dinero()`, `parcelaInfo(*).dinero` y el estado visual de las 36 parcelas, y las propias son 4-conexas. El reloj no se mueve en Plano; al volver a Vida sigue desde el mismo día y minuto; la selección y el panel desaparecen. Paseo con teclado (escritorio) o joystick CDP (móvil) por propias y ajenas: el dinero no cambia y el personaje nunca queda en casilla bloqueada. Sin errores de consola.
- **Desmayo con compras** (`hora=01:58`, `dinero=3000`): dos compras y una tercera parcela seleccionada en Plano; 2,5 s parado sin que el reloj se mueva; M a Vida cierra el panel; el desmayo llega, sale el aviso y no toca dinero, propias ni selección; de vuelta en Plano todo cuadra y siguen siendo exactamente dos propias.
- **Pausa, x2 y x3 con la confirmación abierta** (botones y P): la confirmación sigue abierta, el reloj no se mueve, se cobra una vez y al volver a Vida el reloj corre a x3.
- **Selección y personaje**: destino tocado en Vida, M a Plano lo cancela; Esc cancela la confirmación y el segundo Esc cierra el panel; M con la confirmación abierta cierra todo sin comprar; el toque de la parcela no queda como destino en Vida; al volver a Plano no hay selección vieja.
- **Joystick y modos** (móvil, CDP con una sola sesión): joystick activo + M → Plano suelta el joystick y el personaje no se mueve aunque el dedo siga; al soltar no se selecciona nada; panel + confirmación abiertos con toques y botón de modo → Vida sin compra; joystick en Vida anda y se para al soltar; tocar destino y volver a Plano cancela la ruta; un toque selecciona.
- **Reinicio de escena 5 veces** con propias y dinero modificados tras una compra: en cada reinicio HUD, estado, panel y dibujo cuadran; un solo `.hud`, un solo `.joystick-base`, una compra posterior cobra una vez, un aviso, un Esc cierra el panel (un solo oyente). Sin errores.
- **Teclado dentro del panel**: con una parcela seleccionada, Tab desde el lienzo llega a «Comprar por N»; Enter abre la confirmación con el foco en «Cancelar»; Esc vuelve a «Comprar por N»; Shift+Tab a «Comprar» y Enter compra; el foco no se pierde en `<body>`.
- **Girar el móvil en cada paso** (915×412 ↔ 412×915): Vida, Plano, selección, confirmación, tras comprar y vuelta a Vida; reloj, dinero, botón de modo y los botones del panel dentro de la pantalla; el dinero no se solapa con los controles de tiempo ni con el botón de modo; el panel no tapa el dinero ni el botón de modo; en Vida el personaje queda a la vista.
- **Núcleo, partida larga con fast-check** (150 casos de 60 a 300 comandos: `ComprarParcela` con índices −2..37 y basura —1,5, `'3'`, NaN, −0, sin índice—, `AvanzarTiempo` hasta 1500 y desmayos forzados, `MoverPersonaje`, `CambiarModo`, `Pausar`, `Reanudar`, `CambiarVelocidad`; ahorros 0, 259, 260, 1100, 3000, 50 000 y 1e9). En cada paso: dinero entero seguro ≥ 0; dinero + gastado = inicial; `comprasHechas` = número de propias; propias 4-conexas; personaje fuera de casillas bloqueadas; un comando rechazado devuelve el mismo objeto; el precio del evento coincide con `parcelaComprable` previo y el índice nunca es −0; la compra no toca reloj, personaje, modo ni pausa; el tiempo, el personaje y los modos no tocan dinero, compras ni valle; el desmayo no toca dinero, compras ni valle y lleva al personaje a la aparición.
- **Determinismo y JSON** (120 casos): misma semilla y comandos ⇒ JSON idéntico; la entrada no se muta; el estado pasa por `JSON.parse(JSON.stringify())` sin cambiar y, con más comandos, el deserializado juega exactamente igual que el original.
- **`Partida`** (100 casos): el desmayo y la pausa no tocan la selección; Vida la suelta; se avisa una vez por comando que cambia el estado o trae eventos, y ninguna si se rechaza o no cambia nada.

## Balance con la economía real (1100 monedas, +40 % por compra; 500 semillas)

| Medida | Resultado |
| --- | --- |
| Parcelas asequibles al empezar | las 36 en las 500 semillas (la más cara cuesta 1010) |
| Máximo de parcelas que se pueden comprar | 2 en todas las semillas; nunca 3 |
| Semillas con alguna primera que permite una segunda adyacente | 500 de 500 |
| Semillas en que toda primera compra deja atascado | 0 |
| Primeras compras (semilla × parcela) que dejan sin ninguna segunda adyacente asequible | 10 069 de 18 000 (55,9 %) |
| Semillas en que comprar la más barata deja atascado | 44 de 500 (8,8 %) |
| Partidas atascadas tras la segunda compra | 100 % (no cabe una tercera) |

Cumple GDD §6.2 («alcanza para 1 o 2»). Más de la mitad de las primeras compras posibles dejan al jugador sin segunda: la primera decisión importa de verdad, como pide el GDD, pero sin ingresos hasta M6 toda partida queda sin poder comprar nada tras una o dos parcelas. Es lo esperado hasta M6.

## Rendimiento (escritorio 1280×720, Chromium sin GPU, 20 propias, `dinero=1e8`)

Test «fps en Vida, en Plano y en Plano con muchas propias y el panel abierto», aislado con 1 worker, tres pasadas (rAF durante 3 s):

| Situación | fps |
| --- | --- |
| Vida, quieto | 41,8 – 42,2 |
| Plano, sin selección | 37,6 – 38,0 |
| Plano con el panel abierto | 35,8 – 36,0 |
| Plano con la confirmación abierta | 36,2 – 36,4 |

Plano cuesta un ~10 % frente a Vida (lo ya conocido: 41 frente a 47 en otra carga de máquina) y el panel otro ~5 %; la confirmación no añade nada. Con 2 workers en paralelo las cifras bajan a 29–33 / 26–29, con el mismo orden. El test falla si con el panel se baja de 15 fps o del 60 % de Vida. Los 60 fps del ROADMAP no son comprobables sin GPU.

## Verificación visual

Rutas con `npm run capturas` (PUERTO_CAPTURAS=4398): `/?semilla=42`, `/?semilla=42;modo=plano`, `…;debug;modo=plano;seleccion=33`, `…;debug;modo=plano;dinero=200;seleccion=33` y `…;debug;modo=plano;hora=23:00;propias=32,33;seleccion=27` (esta agotó el `page.goto` de 30 s por la carga de la máquina y se repitió sola con `node scripts/capturas.mjs`). La confirmación, la compra y la segunda parcela sin fondos se capturaron con un script de Playwright aparte (`m3-global-*`). Ninguna dio errores de página.

- `semilla-42--escritorio` / `--movil-horizontal` / `--movil-vertical` (Vida inicial): reloj y dinero «🪙 1.100» juntos arriba a la izquierda, velocidades a la derecha, «Vida» abajo. En vertical las velocidades bajan a una segunda fila sin solaparse. Las parcelas no muestran estado en Vida (solo líneas). Limpias.
- `semilla-42-modo-plano--*` (Plano sin selección): borde crema discontinuo y moneda grande en todas (todas comprables con 1.100), «En pausa (Plano)» junto a los botones, botón «Plano» marrón. En vertical la insignia y los botones en segunda fila tapan la línea discontinua superior; legible.
- `…seleccion-33--*` (comprable seleccionada): parcela D6 con doble contorno, panel con terreno, fertilidad, agua, precio 860, «Se puede comprar» y «Comprar por 860 monedas». En vertical el borde inferior de D6 queda unos píxeles bajo la hoja (fila inferior, borde del valle); se ve bien.
- `m3-global-confirmacion--*`: «¿Comprar esta parcela por 860 monedas? Te quedarán 240 monedas» con «Comprar» (oscuro) a la izquierda y «Cancelar» (claro) a la derecha; botones grandes. En vertical el texto ocupa dos líneas sin cortarse.
- `m3-global-tras-compra--*`: dinero «240», aviso «¡Parcela D6 comprada por 860 monedas!», «★ Ya es tuya» y «Tuya» en el precio; el resto del valle pasa a rayado (no comprable) con la parcela comprada clara. En móvil horizontal el aviso tapa la esquina de la parcela (S3).
- `m3-global-segunda--*` (vecina sin fondos): «✕ No te llega el dinero (te faltan 590)» y el botón desactivado con borde discontinuo. En vertical el aviso tapa el borde superior de E6 (S3).
- `…dinero-200-seleccion-33--*` (sin fondos desde el principio): todo rayado; el panel explica «te faltan 660». En horizontal los atributos pasan a dos columnas y cabe todo. Limpia.
- `…hora-23-00-propias-32-33-seleccion-27--*` (noche en Plano): el tinte azul oscurece el valle; el HUD y el panel se leen perfecto; el rayado de las no comprables sigue visible, el doble contorno de la selección destaca y el borde dorado de las propias se ve, aunque más apagado.

Recomendadas para la PO: `m3-global-confirmacion--movil-vertical.png`, `m3-global-tras-compra--escritorio.png`, `semilla-42-modo-plano--escritorio.png` y `semilla-42-debug-modo-plano-hora-23-00-propias-32-33-seleccion-27--escritorio.png`.

## No cubierto

- Lector de pantalla real (solo roles y nombres accesibles).
- Multitáctil con dos dedos sobre botones del HUD: el emulador no genera `click` con dos dedos, así que no se puede comprobar qué haría un móvil real.
- Rendimiento en móvil real y con GPU.
- `env(safe-area-inset-*)`, como en M2.

## Resultado de las suites

- `npm run check`: lint, formato, tipos, 533 tests unitarios y de propiedades (45 archivos) y build, todo en verde.
- `PUERTO_E2E=4397 npx playwright test --workers=2` (lo mismo que `npm run e2e` con 2 workers): **362 pasan, 1 falla, 127 se omiten, 14 no se ejecutan** (12,5 min). El único fallo es el nuevo test de teclado (S3, a propósito). Los 14 «no se ejecutan» son los proyectos `escritorio-solo` y `movil-solo`, que dependen de que `escritorio` y `movil` pasen enteros; los lancé aparte con `--no-deps`, uno cada vez: `escritorio-solo` 4 pasan y 3 se omiten; `movil-solo` 3 pasan y 4 se omiten. En total, 369 pasan, 1 falla y 134 se omiten.
- `DPR alto` (S3 de M1) pasó en esta ejecución en los dos proyectos.
- No hubo timeouts de carga en la ejecución completa; el test de rendimiento de `tests/prop/camino.test.ts` pasó a la primera.
