# M2-02 Rompedor: personaje y colisiones en el núcleo

Tests: `tests/prop/personaje-rompedor.test.ts` (21 tests, 20 pasan, 1 falla a propósito).

## Fallos
- S3: la cache de `mapaTransitabilidad` se indexa solo por `cauce` y `obstaculos` (referencias) e ignora `aparicion` y `valle`. Dos estados que comparten esas referencias pero cambian `aparicion` reciben el mismo mapa (alcanzabilidad calculada desde la otra aparición). En el juego actual la aparición es constante, por lo que es latente. Test: "cache ignora la aparicion...".

## Atacado y resiste
- Conectividad: 400 semillas, todo el suelo libre es alcanzable (vados cruzan el cauce, también ríos con desvío).
- Configs extremas (valle 1x1, casillasPorParcela 1/2/3, densidades máximas, vados 64, ancho 64, 2x2 de 1): sin excepciones, serializable, aparición en casilla libre.
- Colisión: paseos aleatorios con ±1e-300, -0, ms hasta 5000, bordes exactos en 8 direcciones: la caja nunca toca bloqueo ni sale. Entradas NaN/Infinity/ms negativo se rechazan.
- Sin atasco: de cada casilla libre a su vecina libre (este y sur) en 3 semillas.
- 1000 comandos de 0,001 ms equivalen a uno de 1 ms. Distancia por comando <= velocidad·ms (diagonal normalizada).
- No se pisa agua fuera de vado. Reconstruir el estado con JSON da el mismo mapa.
- 10 000 comandos mezclados: determinista y sin colisión indebida.
- Rendimiento: mapa en frío < 50 ms y MoverPersonaje < 0,5 ms/llamada (umbrales del test, pasan).

## Verificación visual
`npm run capturas -- /?semilla=42 /?semilla=1` (semilla-42 y semilla-1, 3 vistas; semilla-1 móvil horizontal no se revisó). La cámara inicial enseña solo la zona central del valle: en semilla-42 se ve un tramo de río azul sin vado y en semilla-1 ninguno. No pude comprobar visualmente que los vados se distinguen (no aparecen en ninguna captura por defecto). Nada raro en lo visible: sin solapes ni cortes; árboles y rocas legibles.
