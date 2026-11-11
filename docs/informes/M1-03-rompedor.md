# Informe del rompedor · M1-03 Cámara

Tests: `tests/prop/camara-rompedor.test.ts` (pasan), `tests/e2e/camara-rompedor.spec.ts` (4 fallan, a propósito).

## Fallos (un test que falla cada uno)
- S3 · Pellizco con dedos superpuestos: `controlCamara.alCambiar` calcula `factor = ahora.distancia / antes.distancia` sin proteger `ahora.distancia = 0`, así que el zoom se hunde al mínimo. `pasoPellizco` de `matematica.ts` sí lo protege, pero no se usa. Test: «dedos superpuestos (distancia 0) no hunden el zoom al mínimo» (móvil).
- S3 · El clic derecho y el central arrastran la cámara (no se filtra el botón). Test: «clic derecho o central arrastrando…» (escritorio).
- S3 · Rueda con `deltaMode` de líneas (Firefox): `alRueda` usa `dy` crudo; una muesca de 3 líneas da un factor de 1,0045 (la rueda casi no hace zoom en Firefox). Test: «rueda con deltaMode de líneas…» (escritorio).
- S3 · Al redimensionar o girar, la cámara no conserva el centro de la vista: `alRedimensionar` reutiliza `scrollX` y se desplaza (190 px en el test, de 1280x720 a 900x500 con zoom 2,5). Queda dentro de límites, pero el jugador pierde lo que miraba. Test: «redimensionar con zoom máximo y desplazado…» (escritorio).

## Atacado y resiste
- Propiedades con fast-check sobre `matematica.ts` (500 secuencias de gestos, factores 0, Infinity, 1e300, puntos fuera de pantalla): siempre finito, en límites y zoom en [min, max]. Tampoco falla con dedos a distancia 0 en `pasoPellizco`, `limitarVista` es idempotente y el zoom inicial es >= 0,6.
- Rueda con deltaY 0, ±1e9 y ±1e300 (por evento sintético).
- Ctrl+rueda, PageDown y Espacio no desplazan ni hacen zoom nativo.
- Un dedo no desplaza la página.
- Soltar el ratón fuera de la ventana no deja arrastre fantasma.
- Levantar un dedo a mitad del pellizco y seguir arrastrando no salta.
- Tres dedos no dan NaN ni saltos.
- Ventanas de 20x20, 1x1 y 300x5: sin NaN y se recupera.
- Girar con zoom máximo queda dentro de límites.
- Zoom inicial en móvil vertical >= 0,6.

No cubierto: rendimiento (asignaciones por fotograma). `medir`, `vista` y `transformar` crean objetos por evento, pero no lo medí. Pantalla de tamaño 0 en la matemática pura: no probado con zoom 0.

## Verificación visual (puerto 4199, build de esta rama)
Los 6 PNG (`semilla-42` y `semilla-42-debug-propias-0-1-6`, en escritorio, móvil horizontal y móvil vertical) muestran el valle de esta rama, no la portada. No vi texto solapado ni elementos cortados. El zoom inicial de 0,6 deja ver unas 4x2 parcelas en escritorio y unas 2x3 en móvil, con las casillas legibles. En móvil las parcelas propias 0, 1 y 6 del modo debug no entran en el encuadre inicial centrado (solo se ve el marco amarillo de la 0 en escritorio). No es un fallo, pero conviene saberlo. No hice capturas tras zoom o arrastre.
