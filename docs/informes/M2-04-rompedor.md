# M2-04 Rompedor: controles táctiles (joystick y tocar el destino)

Tests: `tests/e2e/tactil-rompedor.spec.ts` (escritorio y móvil), `tests/prop/tactil-rompedor.test.ts`, `tests/prop/tactil-posiciones-rompedor.test.ts`.

## Fallos (tests que fallan)
- **S3** El clic derecho (y el central) fijan destino: `alSoltar` no mira `p.button`; además se abre el menú contextual. Test: `el clic derecho no fija destino` (falla en escritorio); el del botón central comparte causa (`p.button !== 0`).
- **S3** Un clic de ratón mantenido más de 300 ms sin mover no hace nada, aunque el criterio dice "o clic". El umbral de tiempo se aplica también al ratón. Test: `un clic mantenido más de 300 ms...` (falla).
- **S3** El joystick no se acota a la pantalla: tocando a 8 px del borde, la base (112 px) queda 48 px fuera por la izquierda. Test: `el joystick cerca del borde de la pantalla no sale de ella` (falla). Arreglo: fijar la base a ≥ 56 px de los bordes (el mando sigue al dedo).
- **S3** Girar el móvil con el joystick activo: la base queda en las coordenadas viejas (centro a y=800 en una pantalla de 412 de alto), fuera de pantalla, y el personaje sigue andando mientras dure el dedo. Test: `girar el móvil con el joystick activo...` (falla). Arreglo: `reiniciar()` al redimensionar.
- **S3 (latente)** Un desmayo emitido fuera de `update()` (hoy solo con el gancho de depuración; mañana, un "dormir" de la UI) no cancela la ruta: el personaje reaparece y sigue hacia el destino viejo. Test: `desmayo emitido fuera del bucle...` (falla). El desmayo del propio reloj sí se cancela. Conviene cancelar por cambio de estado (posición discontinua), no por el evento visto en `update()`.

## Hallazgos sin test que falle (visual, `capturas/`)
- `tactil-vertical.png` y `tactil-horizontal.png`: joystick (base 112 px, mando 48 px) bien visible y con contraste, no tapa el botón "Vida". En horizontal la base se superpone al personaje (aceptable, está bajo el dedo).
- S3 `tactil-rompedor-marca.png`: la marca de destino es un aro fino crema (4 px) sobre el verde claro: se ve, pero es pequeña y de poco contraste en el suelo claro; un destino a varios metros se puede perder de vista. Mejor un aro con borde oscuro o más grande.
- S3 `semilla-42--movil-vertical.png`: el personaje sigue pegado al borde inferior (ya señalado en M2-05).
- Sin `:hover` asociado al joystick; mando 48 px y base 112 px (>= 44 px, test propio).

## Atacado y resiste
- A*: propiedades con fast-check (60 + 60 + 150 casos, semillas arbitrarias, destinos 0..95, deltas de 8 a 100 ms): el seguimiento con la colisión real del núcleo llega siempre a 0,05 casillas del centro de la casilla final, incluso partiendo de posiciones arbitrarias dejadas por un joystick (60 pasos aleatorios, junto a obstáculos y río). No hay oscilación ni falsos atascos, ni en diagonales junto a obstáculos ni en vados.
- 20 destinos A* seguidos en el peor caso (esquina a esquina): < 150 ms en total. 20 clics y 20 toques en el navegador: sin errores y fps > 15.
- Destino en el agua: va a una casilla libre a <= 2,5 casillas; destino fuera del valle: queda dentro; en la propia casilla: llega y se cancela.
- Umbrales: 10 px es toque y 10,5 px es joystick (sondeado a 0, 5, 8, 9, 9,5, 10, 10,5 y 11); 600 ms quieto no es toque, 150 ms sí.
- Botón de modo: un toque no fija destino; un arrastre que empieza en él no crea joystick ni cambia de modo. Clic en el botón y vuelta a Vida: sin destino colgado.
- Multitáctil: segundo dedo cancela el joystick; levantar el primero dejando el segundo no deja el gesto atascado; tres dedos sin errores y luego todo funciona. `touchcancel` quita el joystick y el personaje se para. Pestaña oculta con joystick: se suelta y no sigue andando.
- Pausa cancela el destino y un clic en pausa no reaparece al reanudar; Plano y vuelta a Vida cancela la ruta; arrastre con ratón en Vida no mueve la cámara ni crea joystick.
- La base se centra bajo el dedo (±2 px) y el mando no pasa del radio.

## Notas
Ejecutado con `PUERTO_E2E=4391 --workers=2`: 5 tests fallan (los de arriba, en un solo proyecto cada uno), el resto pasa. El test del umbral de 10 px necesita coordenadas enteras (el escalado del emulador desplaza el borde). Rama local `rompedor-m2-04` empujada a `feat/M2-04-tactil` (la rama ya estaba en otro worktree).
