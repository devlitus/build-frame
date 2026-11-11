# M1-04 · Informe del rompedor

Tests nuevos: `tests/prop/trozos-rompedor.test.ts`, `tests/unit/parametros-rompedor-m104.test.ts`, `tests/e2e/rendimiento-rompedor.spec.ts`.

## Fallos
- S3 · `?debug=FALSE` / `False` / `off` / `no` activan el contador (solo `false` y `0` en minúscula lo desactivan). Test: `parametros-rompedor-m104.test.ts`.

## Resiste
- `rejillaTrozos`: cubre el mundo exactamente (propiedad, 300 casos), rechaza 0, negativos, NaN, Infinity.
- Costuras: sin rachas de color de fondo con zooms fraccionarios y desplazamiento de medio píxel (además los bordes de parcela, cada 512 px, tapan las fronteras de 1024).
- Decoración: cabe en su casilla de 32 px y 1024 es múltiplo, así que ningún objeto cruza fronteras de trozo.
- Contador: un arrastre que empieza sobre él mueve la cámara; sobrevive a «Nueva partida»; `debug=0`/`false`/`DEBUG` no lo crean.
- Pérdida/recuperación de contexto WebGL: el terreno sigue visible (el test no demuestra que la pérdida fuese real en headless).

## No probado
- Fugas al recrear la escena y `Phaser.CANVAS`: no hay forma de reiniciar el valle ni forzar el renderizador sin tocar `src/` (no hay UI de «volver»; `window.__raices` no expone el juego).
- fps reales en móvil medio: sin GPU en este entorno (las capturas mostraron 40-49 fps en software).

## Verificación visual
Capturas de `/?semilla=42` y `/?semilla=42&debug&propias=0,1,6` en escritorio, móvil horizontal y vertical: todas muestran el valle (no la portada), sin costuras; el contador solo aparece con `debug`, legible y en la esquina superior izquierda. Sin fallos visuales. Observación menor: en la captura con `propias` solo es visible la parcela 0 (borde dorado) porque el zoom inicial no encuadra las otras.

## Ronda 2
- S2 · tras `webglcontextlost` y `webglcontextrestored` el terreno y la decoración horneados desaparecen (97 % del lienzo es fondo); el test de contexto ahora falla. La comprobación anterior daba falso verde porque buscaba el fondo puro y no el tintado de las parcelas en venta.
- Costuras: se reevalúa con fondo puro o tintado; sigue sin haber rachas de fondo.
