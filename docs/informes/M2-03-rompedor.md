# M2-03 Rompedor: personaje en pantalla, cámara y teclado

Tests: `tests/unit/personaje-render-rompedor.test.ts`, `tests/e2e/personaje-render-rompedor.spec.ts` (todos pasan en solitario con `--workers=1`).

## Fallos
Ningún fallo S1/S2. Hallazgos menores:

- S3 (diseño, sin test que falle): el delta acotado a 100 ms hace que, por debajo de ~10 fps, el personaje y el reloj pierdan tiempo (a 5 fps, la mitad). Con 4 workers de Playwright en paralelo (~11 fps) el reloj midió 0,55 min/s en vez de 1,33. Documentado en un test unitario.
- S3: la decoración (árboles/rocas) está horneada con depth 0, así que el personaje (depth = y) queda siempre delante, también al pasar al norte de un árbol cuya copa se solapa. El orden por y solo funcionará cuando la decoración sea objetos reales (o se hornee por separado). Aceptable para el placeholder.
- S3 (visual): en una partida normal el personaje empieza en la entrada (47,5; 95,5) y la cámara en el centro: no se ve en pantalla (`semilla-42--*`). Los vados se distinguen bien (azul claro con piedras) y el personaje (círculo rojo) se lee, aunque queda pequeño en móvil vertical.
- Nota de proceso: la primera ejecución de `npm run capturas` con dos rutas dejó las capturas del vado como portada; repetida con una sola ruta salió bien. No se reprodujo.

## Velocidad (pregunta del orquestador)
No se pierde movimiento: a 144/60/30 fps la simulación (Partida + bucle) da 4,00 casillas/s; diagonal normalizada. En el navegador (~43 fps sin GPU) se midieron 3,7 y 4,17 casillas/s en s/w durante ~1 s (d/a chocaban con obstáculos). Los ~2,5 vistos por el implementador se explican por fps bajos bajo carga paralela y por colisiones, no por pérdida a 60 fps.

## Reloj
A 60 fps simulados: 1200 min de juego en 15 min reales (sin pérdida ni duplicado, el resto fraccionario se conserva). En navegador a ~43 fps: entre 1,1 y 1,5 min/s.

## Atacado y resiste
Ctrl+L, F5 y Ctrl+D no se bloquean (defaultPrevented false); teclas opuestas se anulan (salvo un fotograma de carrera); mantener tecla al reiniciar escena no deja al personaje andando solo; 5 reinicios no duplican objetos ni oyentes de rueda; la cámara queda dentro del valle caminando en las 4 direcciones con redimensionado y rueda a mitad.
No cubierto: Alt+Tab real y pestaña oculta real (solo se simuló blur en el e2e del implementador); girar móvil táctil.
