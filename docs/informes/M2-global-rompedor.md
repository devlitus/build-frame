# M2 · Pasada global del rompedor (Personaje y tiempo)

Rama `hito/M2-personaje-tiempo` (#13–#18). Tests nuevos: `tests/e2e/m2-global-rompedor.spec.ts` (12 tests; los de tiempo real están en `SOLO` de `playwright.config.ts`) y `tests/prop/m2-global-rompedor.test.ts` (4 tests).

## Fallos

No he encontrado fallos S1, S2 ni S3 nuevos en las interacciones entre historias: todos los tests nuevos pasan, así que no hay tests que fallen a propósito. Lo único que falla en `npm run e2e` es `DPR alto: el lienzo se dibuja a la resolución del dispositivo` (M1, S3 ya conocido, escritorio y móvil).

Observaciones menores (sin test):

- S3 · Con el tinte de noche el fps baja ~22 % en esta máquina sin GPU (ver Rendimiento). Con GPU real debería ser despreciable, pero hay que confirmarlo en la demo.
- S3 (diseño) · Pausar (botón o P) cancela la ruta en curso; al reanudar el personaje no continúa. Es coherente con M2-04, pero puede sorprender al jugador.
- S3 (visual) · En Modo Plano vertical (360 y 412 px) el HUD pasa a dos filas (reloj; insignia y botones debajo). No hay solape (cubierto por test) pero la zona ocupada crece ~90 px.
- S3 (visual) · El botón de pausa muestra siempre «II» o «▶»; con el reloj parado por el Modo Plano sigue en «II» (lo indica la insignia «En pausa (Plano)»).

## Atacado y resiste

- **Día completo jugando** (escritorio y móvil, `?debug&acelerar=200`): se mantiene D pulsada mientras se alternan M, P y velocidades x2/x3; en cada muestreo el minuto está en [360, 1560], la alfa del tinte en [0, 1] y el HUD concuerda con el estado (±1 min); al llegar el desmayo aparece un solo aviso, el HUD dice «Día 2» y el tinte a las 06:00 es < 0,3. Sin errores de consola ni de página.
- **Desmayo con ruta activa** (escritorio): destino cancelado, personaje a < 0,2 casillas de la aparición y a la vista.
- **Desmayo con el joystick activo** (móvil, CDP): el joystick sigue visible, el personaje reaparece en la aparición y retoma el camino mientras el dedo siga puesto; al soltar se para y no anda solo.
- **Plano con joystick**: pasar a Plano suelta el joystick, el personaje no se mueve aunque el dedo siga moviéndose, y al volver a Vida con el dedo levantado no queda destino ni movimiento colgado.
- **Segundo dedo sobre el botón de pausa durante un arrastre** (CDP): sin errores y, tras soltar, un toque en el suelo vuelve a fijar destino (no queda gesto atascado).
- **Girar el móvil** (915x412, 412x915, 360x640, 640x360) de noche, con aviso visible, en Vida y en Plano: reloj, controles y botón de modo dentro de la pantalla; el aviso no solapa nada; en Vida el personaje queda a la vista.
- **P y M a la vez** (6 veces con `down` simultáneo): cada una actúa una vez por pulsación; estado y botón coherentes.
- **Reiniciar la escena 6 veces** con W mantenida, pausa y ruta: HUD y estado coinciden (`aria-pressed`), una P = un cambio (sin oyentes duplicados), un único `.joystick-base` y un único `.hud` en el DOM, un solo aviso tras un desmayo, el personaje no anda solo. También con `?modo=plano` y pausa: botón e insignia siguen al estado.
- **Plano con ruta activa**: la ruta se cancela, no hay marca y al volver a Vida no se reanuda.
- **Accesibilidad** (escritorio): Tab recorre ≥ 5 botones, todos con nombre accesible, `:focus-visible` verdadero y un indicador (outline o sombra); Enter y Espacio sobre el botón de modo cambian una vez y conservan el foco; `aria-pressed` correcto en velocidad y pausa; el reloj es `timer` con nombre.
- **Núcleo, simulación de varios días** (fast-check, hasta 250 comandos: AvanzarTiempo hasta 3000 min, MoverPersonaje, Pausar, Reanudar, CambiarVelocidad, CambiarModo y comandos inválidos): estado siempre válido (minuto entero en rango, día seguro y monótono con +1 como máximo, modo y velocidad válidos, caja del personaje fuera de casillas bloqueadas); el evento `desmayo` coincide exactamente con el cambio de día, nunca ocurre con el tiempo detenido y deja minuto 360 y personaje en la aparición; con el tiempo detenido Avanzar y Mover devuelven el mismo objeto; `pausado` solo cambia con Pausar/Reanudar y `modo` solo con CambiarModo.
- **Determinismo**: misma semilla + mismos comandos ⇒ JSON idéntico, la entrada no se muta y el estado final sobrevive a `JSON.parse(JSON.stringify())`.
- **buscarCamino + MoverPersonaje** con desmayos y pausas intercalados, semillas y destinos arbitrarios (0..95): estado siempre válido.
- **Pausa en Plano y vuelta a Vida** conserva la pausa del jugador; Reanudar en Plano no arranca el reloj.

## Rendimiento (escritorio 1280x720, Chromium sin GPU, test aislado con 1 worker)

| Situación                   | fps (rAF, 3 s) |
| --------------------------- | -------------- |
| Día, quieto                 | 42,9           |
| Día, andando (D)            | 42,7           |
| Noche (23:00, tinte), quieto | 33,6          |
| Noche, andando              | 33,3           |

Andar no cuesta nada; el tinte de noche cuesta ~22 % (42,7 → 33,3 fps) con renderizado por software. Los 60 fps del ROADMAP no son comprobables aquí. El test falla si de noche andando se baja de 15 fps o si el cociente noche/día es < 0,6.

## Verificación visual (`npm run capturas`, sin errores de página)

La captura de `en=vado` falló la primera vez por timeout de carga (30 s, máquina saturada) y se repitió sola sin problema.

- `semilla-42--escritorio`: valle de día; reloj «06:00 · Día 1 de Primavera» arriba a la izquierda, botones II / x1 (activo, marrón) / x2 / x3 arriba a la derecha, botón «Vida» abajo a la derecha. Personaje (círculo rojo) en la entrada, abajo, pequeño. Limpia.
- `semilla-42--movil-horizontal`: igual; textos grandes, botones ≥ 44 px. Borrosa por el DPR (S3 conocido) y marco oscuro de 1 px. Muestra 06:01 (la página tardó en cargar).
- `semilla-42--movil-vertical`: reloj y botones caben en una fila, «Vida» abajo; personaje cerca del borde inferior. Limpia.
- `semilla-42-debug-hora-22-00--escritorio`: noche con tinte azul oscuro; el HUD (crema, sin tinte) se lee perfecto; contador «48 fps» arriba a la izquierda con el reloj debajo; personaje visible pero apagado. Buena para la PO.
- `semilla-42-debug-hora-22-00--movil-horizontal` y `--movil-vertical`: lo mismo; contraste del HUD correcto, árboles y rocas se distinguen, personaje legible. Buenas.
- `semilla-42-modo-plano--escritorio`: vista centrada en el valle con el río en L; insignia «En pausa (Plano)» junto a los botones; botón «Plano» (marrón, texto crema) abajo a la derecha. El personaje no se ve (fuera del encuadre inicial). Buena para mostrar el contraste Vida/Plano.
- `semilla-42-modo-plano--movil-vertical`: HUD en dos filas sin solapes; el río se ve; insignia y botones cubren algo de mapa. Aceptable.
- `semilla-42-modo-plano--movil-horizontal`: insignia y botones en una fila, legibles. Limpia.
- `semilla-42-debug-en-vado--escritorio` / `--movil-horizontal` / `--movil-vertical`: el personaje sobre el vado (azul claro con piedras) cruzando el río; el cauce se lee muy bien y el personaje queda centrado en horizontal y vertical (en escritorio queda a la izquierda porque la cámara se detiene en el borde del valle).

Recomendación para la PO: `semilla-42-debug-hora-22-00--escritorio`, `semilla-42-debug-en-vado--movil-vertical` y `semilla-42-modo-plano--escritorio`.

## No cubierto

- Alt+Tab y pestaña oculta reales (solo simulados en tests previos); `env(safe-area-inset-*)` no verificable en el emulador.
- Multitáctil real con tres o más dedos mientras se tocan botones del HUD; solo se probó un segundo dedo sobre el botón de pausa.
- No hay gancho para contar suscriptores de `Partida`; se dedujo por comportamiento (una P = un cambio, un aviso, un HUD, un joystick en el DOM).

## Resultado de las suites

- `npm run check`: lint, formato, tipos, tests y build OK.
- `npm run e2e` (`PUERTO_E2E=4395`, 2 workers): 235 pasan, 110 omitidos (tests que solo aplican a un proyecto), fallan solo los 2 de `DPR alto` (M1, S3 conocido). Todos los tests nuevos pasan, incluidos los de `SOLO` en `escritorio-solo` y `movil-solo` (el de fps solo corre en escritorio).
