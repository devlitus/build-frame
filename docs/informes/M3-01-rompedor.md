# M3-01 · Informe del rompedor

Tests nuevos: `tests/prop/economia-rompedor.test.ts` (40 tests; 5 fallan a propósito).

## Fallos

- S2 · **Balance: los ahorros alcanzan para tres parcelas.** GDD §6.2 y el criterio de la historia piden que alcancen «para 1 o 2». Con `dineroInicial` 1300, tres parcelas baratas cuestan 260 + 320 + 410 = 990 (rocoso·baja·seca con 0, 1 y 2 compras). En 334 de 500 semillas hay tres parcelas contiguas (respetando ya la regla de adyacencia de M3-02) que se pueden comprar; sin la regla de adyacencia, en 483 de 500. Ejemplos: semilla 0, parcelas 20-21-26 por 1130; semilla 1, 18-19-24 por 1230; semilla 2, 13-14-19 por 1290. El criterio «la más cara + la más barata como segunda no caben» (1010 + 320 = 1330 > 1300) se cumple, pero no basta: obliga a `dineroInicial` ≥ 260 y < 1330, mientras que «nunca tres» obliga a < 990. Los dos criterios se cumplen a la vez con `dineroInicial` en [260, 990) (por ejemplo 900, aunque entonces la parcela más cara, de 1010, no se puede comprar al empezar), o subiendo `subidaPorCompra` o el mínimo de los factores. Es una decisión de diseño. Test: «[S2] en ninguna semilla los ahorros alcanzan para TRES parcelas contiguas».
- S3 · `precioParcela` no valida `comprasHechas`: con -1 da 300 (la mitad del precio con 0 compras, 600), con 1.5 da 520, con NaN da `NaN` y con 3200 da `Infinity`. Ahora no se puede provocar (el estado empieza en 0 y aún no hay compras), pero sí con un guardado manipulado (M7). Con un índice inválido devuelve `undefined`; con un `comprasHechas` inválido debería pasar lo mismo. Test: «[S3] con comprasHechas corrupto…».
- S3 · El esquema acepta `dineroInicial` y `precioBase` que no son enteros seguros (`1e300`, `2^60`): `v.integer()` usa `Number.isInteger`, que da `true` para 1e300. Faltan `v.safeInteger()` o un tope. Test: «[S3] rechaza ahorros y precio base que no son enteros seguros».
- S3 · Hay datos que pasan el esquema y dan un precio no finito: con `precioBase` 1e308, prado·alta·río da `Infinity`. Se arregla junto con el anterior (con un tope razonable de `precioBase`, factores y `subidaPorCompra`). Test: «[S3] ninguna config que acepta el esquema produce un precio no finito».
- S3 · `crearEstadoInicial` acepta `dineroInicial` -500, 0.5, NaN o Infinity y lo copia sin validar, mientras que `minutoInicial` sí se valida y lanza un error. Solo lo pueden provocar los tests y las herramientas, porque la capa de juego ya no pasa el valor. Test: «[S3] crearEstadoInicial rechaza ahorros negativos…».

## Resiste
- **Redondeo exacto:** para las 27 combinaciones de atributos y de 0 a 59 compras, el precio coincide con el calculado con aritmética racional exacta (BigInt, mitades hacia arriba). No aparece ningún error de coma flotante del tipo 674,999 → 670. Una mitad exacta (bosque·media·seca con 1 compra = 607,5) da 610. Siempre es entero seguro y múltiplo de 10.
- **Propiedad (fast-check, 500 casos):** con datos válidos y aleatorios (factores de 0,01 a 5, base hasta 1e5, subida de 0 a 1, de 0 a 35 compras), el precio es entero seguro, múltiplo de 10, ≥ 10 y no baja de una compra a la siguiente. Con 35 compras (el máximo en un valle 6×6) sigue siendo entero seguro (≈2,5 M).
- **Índices:** `-0` equivale a 0. Dan `undefined` -1, la longitud, ±2^53, 1e21, ±0,5, 1+1e-10, NaN y ±Infinity, y también índices que no son número: `'0'`, `null`, `undefined`, `{}`, `[0]` y `true` (los descarta `Number.isInteger`).
- **Pureza:** no muta la entrada, es determinista y el `estado` de la parcela (`propia`) no cambia el precio, como se acordó.
- **Esquema:** rechaza NaN, Infinity, cadenas, `null`, booleanos, `-0` como factor, `precioBase` decimal o negativo, claves extra en los factores, factores en forma de array y claves que faltan (además de los casos que ya probaba el implementador).
- **Plugin de build:** acepta los datos reales. Aborta con `economia.json inválido` aunque `valle.json` sea válido (en 4 variantes) y también si el JSON está roto o el archivo no existe.
- **Balance:** la primera parcela cuesta entre 260 y 1010 en todas las combinaciones. En 300 semillas siempre hay alguna asequible al empezar, y ninguna semilla de 200 permite comprar cuatro parcelas, ni siquiera sin la regla de adyacencia.
- **Integración:** `juego.ts` y `EscenaValle.ts` ya no pasan `dineroInicial`, así que usan el valor de los datos. `dineroInicial: undefined` explícito también toma el valor de los datos. `economia.ts` y `datos/economia.ts` no usan APIs prohibidas (ADR 0004).

## Observaciones (sin test)
- `src/save/` aún no guarda el estado, así que el paso a v6 sin migración no rompe nada.
- El esquema no exige un orden entre los factores (por ejemplo, que el rocoso sea más barato que el prado). Es una decisión de balance, no un fallo.
- `CONFIG_ECONOMIA` no está congelado (pasa lo mismo con las demás configuraciones).

## No probado
- La compra en sí (M3-02) y su interacción con `dinero` y `comprasHechas`.
- No hay e2e ni capturas porque la historia no cambia nada visible.

## Ronda 2 (balance 1100 / +40 %, fee3f90; arreglos S3, 916333b)

Actualicé los tres tests con valores fijos sin debilitarlos: el umbral teórico ahora es 260 + 360 + 510 = 1130, y el cálculo exacto pasa a ser genérico (lee la subida de los datos en centésimas y falla si algún dato tiene más de dos decimales). Los tests que fallaban en la ronda 1 quedan como `[S2 corregido]` y `[S3 corregido]`. Tests totales: 46; falla 1 a propósito.

### Fallos nuevos
- S3 · **El redondeo a la decena falla en mitades exactas por coma flotante.** `1,4` no es exacto en binario: con 175 × 1,4 = 244,99999999999997, el precio sale 240 en vez de 250. Con los datos reales de hoy no ocurre (lo comprueba el cálculo exacto en las 27 combinaciones con 0 a 59 compras), pero basta un cambio de balance plausible: base 250, prado·media·río y 1 compra da 450 en lugar de 460; base 750, prado·media·seca y 1 compra da 940 en lugar de 950. Pasa en 7 de 103 140 casos (bases de 100 a 2000 de 10 en 10, hasta 19 compras). Se arregla calculando con factores en centésimas enteras o sumando un épsilon relativo antes de `Math.round`. Test: «[S3] las mitades exactas suben aunque 1,4 no sea representable en binario».

### Comprobado
- **Balance:** no caben tres parcelas en ninguna de 60 semillas (con adyacencia) ni de 200 (sin adyacencia). En todas las de 300 hay dos parcelas contiguas asequibles. La más cara (1010) cabe sola y no cabe con una segunda barata (1010 + 360 > 1100). Nunca caben cuatro. La primera parcela cuesta entre 260 y 1010 y siempre hay alguna asequible.
- **Topes del esquema:** con todos los valores en el tope (base 1e6, factores 1000, subida 10), sin compras el precio es 1e15 (entero seguro). Con una compra (1,1e16) o con 400, `precioParcela` devuelve `undefined`. Pasar el tope por un poco se rechaza. Propiedad con fast-check (1000 casos) en todo el rango del esquema, con factores desde `MIN_VALUE` y hasta 5000 compras: el precio es siempre `undefined` o un entero seguro ≥ 10 múltiplo de 10, y sin compras nunca es `undefined`.
- **`comprasHechas`:** con -1, -100, 1,5, NaN, 3200, Infinity, `MAX_SAFE_INTEGER` y `'1'` devuelve `undefined`; `-0` equivale a 0.
- **`crearEstadoInicial`:** lanza un error con ahorros negativos, fraccionarios o no finitos. `undefined` explícito toma el valor de los datos.

### Observaciones (sin test)
- Ahora `precioParcela` también devuelve `undefined` con un índice válido, cuando el precio desborda. El comando de compra de M3-02 debe tratar `undefined` como «no se puede comprar», nunca como 0.
- `crearEstadoInicial({ dineroInicial: -0 })` deja `dinero` en `-0`. Es inocuo (al serializar queda 0).
