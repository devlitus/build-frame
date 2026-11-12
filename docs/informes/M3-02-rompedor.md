# M3-02 · Informe del rompedor

Tests nuevos: `tests/prop/parcelas-rompedor.test.ts` (30 tests; 2 fallan a propósito, por un solo fallo).

`npm run check`: lint, formato y tipos pasan. Los tests dan 466 en verde y 2 en rojo (los dos de abajo). El build no llega a ejecutarse porque los tests fallan. El test de rendimiento de `tests/prop/camino.test.ts` pasó a la primera.

## Fallos

- S3 · **Un `dinero` manipulado que no es entero seguro rompe el criterio «el dinero baja exactamente el precio».** `parcelaComprable` solo comprueba `dinero >= precio`, y el comando resta en coma flotante:
  - con `dinero` 1e300 o 2^60, la compra sale gratis (el dinero no cambia);
  - con `Infinity`, la compra se acepta y el dinero sigue en `Infinity`, así que se pueden comprar las 36 parcelas;
  - con `precio + 0.1`, el dinero queda en 0.10000000000002274.

  Hoy no se puede provocar, porque `crearEstadoInicial` ya exige un entero seguro ≥ 0 y la compra solo resta enteros. Llegará con un guardado manipulado (M7). Se arregla tratando un `dinero` que no sea entero seguro como no comprable (como ya se hace con `comprasHechas`), o validándolo al cargar en M7.

  Tests:
  - «[S3] con dinero que no es entero seguro la compra no puede salir gratis»
  - «[S3] con dinero fraccionario la resta no es exacta (0,1 de más)»

## Resiste
- **Comando ⇔ `parcelaComprable`:** probado con fast-check en 3000 casos, sobre estados aleatorios que incluyen propias no conexas, `dinero` NaN, -1, -0, ±Infinity y 0,5, `comprasHechas` -1, 1,5, NaN, 1e6 e Infinity, e índices enteros y `double`. Siempre se cumple que es comprable ⇔ el comando da ok. Cuando no se puede comprar, el error coincide con el motivo y el estado se devuelve con la misma referencia. Cuando se compra, el evento lleva el precio de `parcelaComprable`, que coincide con `precioParcela`, y `comprasHechas` sube en 1. Las reglas también coinciden con un oráculo independiente, que calcula la adyacencia a partir del índice y no de `fila`/`columna`, y respeta la prioridad de motivos acordada. La función es pura: con el estado congelado en profundidad no lanza ningún error ni muta nada.
- **Índices:** dan `parametro-invalido` sin tocar el estado -1, la longitud, 36,5, ±0,5, 1+1e-10, 3+4ε, NaN, ±Infinity, 2^53, 1e21, `'0'`, `'3'`, `null`, `undefined`, `{}`, `[0]`, `true`, `new Number(3)` y un comando sin el campo `indice`. `-0` compra la parcela 0 y deja un estado idéntico a comprarla con `0`. Una segunda compra con `0` o con `-0` da `ya-propia`. Comprar dos veces la misma parcela cobra una sola vez.
- **Frontera de dinero:** en las 36 parcelas, con dinero igual al precio se compra y el dinero queda en `+0`; con un euro menos sale `fondos-insuficientes`, con el precio incluido. Con dinero justo, la segunda compra usa el precio ya subido. Con los ahorros reales (40 semillas), la parcela más cara se compra si cabe y, si no, da `fondos-insuficientes`.
- **Inmutabilidad:** el estado anterior, congelado en profundidad, no cambia. Las 35 parcelas que no se compran comparten la referencia. Se conservan las referencias de `rio`, `cauce`, `obstaculos`, `personaje` y `aparicion`, y el resto de los campos del estado y del valle quedan iguales. La compra no toca `dia`, `minutoDelDia`, `modo`, `pausado`, `velocidad` ni `rng`, tampoco en pausa ni en Modo Plano.
- **Adyacencia y valles raros:**
  - En un valle 1×1 se compra la única parcela, y después da `ya-propia`.
  - En un valle 2×2, desde cada esquina, la diagonal da `no-adyacente` y los dos lados se pueden comprar.
  - Entre bordes no hay adyacencia cíclica: 0 con N-1, 0 con N(N-1), y final de fila con principio de la siguiente.
  - En un valle manipulado con `parcelas.length` distinto de n², no lanza ningún error.
  - Con propias aleatorias no conexas (1000 casos), solo se compra una parcela si tiene alguna propia a distancia Manhattan 1.
- **Partidas largas:**
  - Con dinero de sobra (60 partidas de 36 compras en un orden aleatorio válido), lo que acepta `parcelaComprable` es exactamente la frontera del bloque en cada paso. Se llega siempre a las 36, el bloque es 4-conexo en todo momento, `comprasHechas` coincide con el número de propias, dinero + gastado es igual a los ahorros iniciales y el dinero final es un entero seguro ≥ 0 (el total ronda 4·10^8, lejos de 2^53).
  - Con dinero limitado (200 partidas, de 0 a 5·10^7), la compra se rechaza solo si no alcanza el dinero, y siempre con `fondos-insuficientes`. Cuando no cabe nada, no hay ninguna parcela comprable. El dinero nunca baja de 0.
  - Las secuencias mezcladas con tiempo, movimiento y modo (150 casos) son deterministas y mantienen los invariantes.
- **Caché de `mapaTransitabilidad`:** el mapa es idéntico por valor después de cada una de las 36 compras. Tras una compra, la segunda consulta sale del caché (misma referencia). Mover al personaje con 5 parcelas compradas da el mismo resultado que sin comprar.
- **Estados manipulados con un comportamiento razonable:**
  - Con `dinero` NaN, negativo o -Infinity, da `fondos-insuficientes`.
  - Con `comprasHechas` corrupto, da `precio-invalido`, nunca un precio de 0, como pedía el comentario del issue.

## Observaciones (sin test que falle)
- **Caché tras comprar:** cada compra crea un `valle` nuevo, así que la primera consulta posterior recalcula el mapa (unos 0,22 ms; desde el caché, unos 0,001 ms). El caché guarda una sola entrada por cauce y obstáculos: si algo alterna entre el estado anterior y el nuevo (por ejemplo, la interfaz con un estado viejo y la escena con el nuevo), se recalcula en cada llamada. Hoy cuesta poco y el resultado es correcto. Si llegara a importar, la clave del caché podría ser `valle.rio` en lugar de `valle`, ya que el mapa no depende de `estado` de las parcelas. Lo mide el test «alternar entre el estado anterior y el nuevo…» (con un umbral de 5 ms por llamada).
- **Parcela con un estado desconocido** (p. ej. `'vendida'`): cuenta como en venta, se puede comprar y pasa a `propia`. Ningún criterio lo cubre; tocará validarlo al cargar el guardado (M7). Queda documentado en un test que pasa.
- **`comprasHechas` que no coincide con las propias:** solo cambia el precio (se usa el contador, no el número de propias), y la diferencia se arrastra. Es lo esperable sin validación al cargar (M7). Queda documentado en un test que pasa.
- ~~**Evento con `-0`:**~~ *Resuelta en c1d21b4 (el evento normaliza el índice).* `ComprarParcela` con `indice: -0` emite `{ indice: -0 }` y no normaliza a 0. Es inocuo (`String(-0)` es `'0'`, como clave de `Map` equivale a 0 y en JSON se guarda como 0), pero es mejor emitir el índice de forma canónica.
- ~~**`ya-propia` sin precio:**~~ *Resuelta: se ajustó el comentario.* el comentario de `parcelaComprable` dice que «`precio` se incluye siempre que se conozca», pero con `ya-propia` no se incluye, aunque `precioParcela` sí lo conoce. Es una diferencia con la documentación, no con los criterios: o se ajusta el comentario o se añade el precio.
- La adyacencia usa `fila`/`columna` guardadas en la parcela y no las calcula a partir del índice. Con valles generados es lo mismo (lo comprueba el oráculo); solo cambiaría con un guardado en el que no coincidan.

## No probado
- No hay interfaz de compra (M3-03/04), así que no hay e2e ni capturas.
