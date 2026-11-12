# M1-01 · Modelo del valle — informe del rompedor

Tests: `tests/prop/valle-rompedor.test.ts` (28 tests; los 5 fallos S3 ya están corregidos y sus tests pasan como regresión).

## Fallos

| Sev. | Test | Descripción |
|---|---|---|
| S3 | `[S3 corregido] rechaza pesos infinitos (1e999 en JSON)` | `JSON.parse('1e999')` da `Infinity` y el esquema lo acepta (`v.number()` + `minValue(0)`); con total infinito `elegirPonderado` siempre devuelve la última clave, aunque su peso sea 0. |
| S3 | `[S3 corregido] pesos enormes pero finitos cuya suma desborda no fuerzan la última clave` | `{prado:1e308, bosque:1e308, rocoso:1e308}` es válido, pero la suma desborda a `Infinity` y todo el valle sale `rocoso`. |
| S3 | `[S3 corregido] una clave con peso 0 nunca sale, aunque el otro peso sea diminuto` | Con pesos subnormales (`{pozo:5e-324, seca:0}`) `r*total` redondea a `total` y se elige `seca`, cuyo peso es 0. fast-check lo encontró solo (contraejemplo con `5e-324` en terreno/fertilidad/agua). |
| S3 | `[S3 corregido] rechaza tamaños absurdos que colgarían la generación` | `parcelasPorLado` y `casillasPorParcela` no tienen máximo: `1e6`, `2^31` o `1e300` pasan el esquema y la generación se cuelga o agota la memoria. |
| S3 | `[S3 corregido] valida el valle.json del proyecto aunque el build se lance desde otro directorio` | El plugin `validar-datos` lee `'data/valle.json'` respecto al cwd, no a la raíz del proyecto: desde otra carpeta valida un archivo ajeno o falla con ENOENT. |

Todos son S3: solo se activan con datos de balance que escribe el equipo, no con acciones del jugador. Arreglo sugerido: `v.finite()` y un tope razonable de pesos o de suma, `maxValue` en los tamaños, que `elegirPonderado` descarte las claves con peso 0 también en el caso de respaldo, y resolver la ruta con `config.root` o `import.meta.dirname`.

## Lo que resiste

- Configs válidas y degeneradas (lado 1–40, pesos con ceros, desvío 0, 1 o intermedio, 400 casos de fast-check): siempre n² parcelas coherentes, todas `en-venta`; el río es 4-conexo, va de borde a borde opuesto y no repite índices; `agua === 'rio'` coincide exactamente con el conjunto `rio`.
- Con desvío 0 el río mide n; con desvío 1 mide 2n (n > 1). Con lado 200 termina en milisegundos.
- El río sale con las dos orientaciones y arranca en las 2n−1 posiciones de borde posibles.
- Semillas extremas (0, 2^32−1, 2^32, negativas, 0.5, 1e20, NaN, Infinity): se normalizan con `>>> 0` a un entero de 32 bits, el valle es válido y se reproduce a partir de `semilla`. Nota: NaN, Infinity y 0.5 colapsan todas en la semilla 0 sin aviso; es aceptable si la UI solo genera enteros.
- El estado hace la ida y vuelta por JSON sin cambios (`toStrictEqual`). `generarValle` no muta la config y la salida no comparte referencias con ella.
- El `rng` del estado avanza: es el sucesor exacto en la secuencia mulberry32, con al menos 2 + n + 2n² pasos.
- El esquema rechaza lado no entero o 0, cadenas, probabilidades fuera de [0,1], NaN, grupos con todos los pesos a 0, claves extra o que faltan, y `null` o `[]`.
- El plugin de build sí aborta con un JSON inválido según el esquema y con un JSON sintácticamente roto.

## Correcciones (ronda 1)

| Fallo | Corrección | Commit |
|---|---|---|
| Pesos infinitos | `v.finite()` en los pesos del esquema | `abc4980` |
| Suma que desborda | `elegirPonderado` normaliza por el peso máximo antes de sumar | `abc4980` |
| Peso 0 elegido | El respaldo es la última clave con peso > 0 | `abc4980` |
| Tamaños sin tope | `maxValue(64)` en `parcelasPorLado` y `casillasPorParcela` | `abc4980` |
| Ruta dependiente del cwd | El plugin resuelve la ruta desde la raíz del proyecto y la recibe como parámetro; el orquestador ajustó dos tests para pasarla explícita | `abc4980`, `72289ff` |
