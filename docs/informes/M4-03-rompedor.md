# M4-03 · Informe del rompedor

`npm run check` sobre d1784c0, antes de añadir nada: **pasa** (lint, formato, tipos, 771 tests en 57 ficheros, build).

Tests nuevos en `tests/prop/obras-rompedor.test.ts`: 18 tests, de los que 4 fallan a propósito. Todos los fallos son de estados corruptos, que hoy solo se dan con un guardado manipulado (la carga llega en M7). Con estados reales no he encontrado ningún fallo.

## Fallos

- **S3: el desmayo lanza si `edificios` es `undefined` o `null`.** Sale `TypeError: estado.edificios is not iterable` desde `terminarObras`. Es una regresión: antes de M4-03 el desmayo no miraba `edificios`. `MoverPersonaje`, `Construir` y las zonas sí devuelven `estado-invalido`, pero `AvanzarTiempo` no comprueba `edificiosValidos`. Test: «[S3] desmayo con `edificios` ausente o null lanza».
- **S3: el desmayo lanza con un `null` dentro de `edificios`.** El error es `Cannot read properties of null (reading 'obra')`. Test: «[S3] desmayo con un `null` dentro de `edificios` lanza».
- **S3: el desmayo lanza con un edificio sin el campo `obra`.** `e.obra !== null` deja pasar `undefined` y después se lee `undefined.diaFin`. Le pasaría a un edificio heredado o hecho a mano, igual que el `pagado` opcional que ya se contempla. Una comprobación del tipo `e.obra != null && typeof e.obra === 'object'` lo evitaría. Test: «[S3] desmayo con un edificio sin campo `obra` lanza».
- **S3 (cuelgue): con una casa terminada en coordenadas enormes, el desmayo entra en un bucle infinito.** Pasa con `x` o `y` iguales a 2^54, 1e300 o ±Infinity. En `personajeAlDespertar`, el bucle del anillo hace `x++` sobre un número donde `x + 1 === x`, así que nunca termina (el juego se congela). Con 2^53 o menos, o con NaN, no se cuelga. Hoy solo pasa con un estado manipulado. Cuando exista la carga de guardados (M7) sería un S1, porque es un cuelgue. Bastaría con exigir `Number.isSafeInteger` en `casa.x` y `casa.y` (o acotar la huella al valle) antes de buscar. El test corta a 1 s con `vm` (ERR_SCRIPT_EXECUTION_TIMEOUT). Test: «[S3, cuelgue] casa terminada con coordenadas enormes…».

## Resiste

- **Momento exacto, con comandos reales:** pinto la zona, paso a Plano y construyo la casa, la caja y el cobertizo. Después, con desmayos de uno en uno, cada obra sigue abierta hasta el día d+n−1, se cierra en d+n con su único evento `obra-terminada` y no vuelve a emitir nada.
- **Obra y desmayo en la misma tirada** (`AvanzarTiempo` de MAX_SAFE_INTEGER minutos): sale un solo día, a las 06:00. Los eventos son `[desmayo, obra-terminada id 3, obra-terminada id 9]`, ordenados por id aunque la lista esté desordenada. La obra que vence otro día sigue abierta y el orden de la lista no cambia.
- **Frontera de las 02:00:** llegar justo a 1560 no provoca desmayo ni termina obras. Un minuto más, sí.
- **Plano y pausa:** con una obra ya vencida, `AvanzarTiempo(1e9)` devuelve el mismo objeto de estado.
- **Límite de MAX_SAFE_INTEGER:** una obra con `diaFin = MAX` termina al llegar a ese día. El siguiente desmayo da `limite-de-dia` y Construir ese día también da `limite-de-dia`.
- **Oráculo independiente de `personajeAlDespertar`** (fast-check, 400 casos). Uso BFS y agua propios y una búsqueda por fuerza bruta sobre todo el valle según la documentación: primero la puerta; si no está libre, la menor distancia Chebyshev a la huella, luego la distancia euclídea a la puerta, luego la `y` y luego la `x`. Pruebo casas en cualquier sitio seco, en bordes y esquinas, junto al río, con rocas, cajas y cobertizos alrededor (algunos todavía en obra). Coincide siempre. El personaje queda centrado, mirando al sur, alcanzable desde la aparición y con la caja de colisión sin tocar nada.
- **Puerta en un vado:** despierta en el vado, que es transitable y alcanzable.
- **Casa rodeada por dos anillos de rocas:** despierta fuera de los anillos, donde dice el oráculo.
- **La casa todavía en obra no cuenta:** despierta en la aparición.
- **Encierro tras despertar:** el personaje despierta en la puerta y en Plano intento tapar sus tres lados libres con cajas. Las dos primeras se aceptan y la tercera da `bloquea-paso`. Luego, en Vida, sale andando.
- **Pureza:** el desmayo no muta el estado de entrada. Mantiene por referencia dinero, materiales, zonas, valle, rng, semilla, `siguienteIdEdificio`, cauce, obstáculos, aparición, `comprasHechas`, velocidad, modo y pausa. Repetirlo desde el JSON de ida y vuelta da un resultado idéntico, porque las cachés por referencia no influyen.
- **Estados raros que no lanzan:** `diaFin` igual a 1,5, NaN, ±Infinity, `'2'` o `null`, y también `obra` igual a `{}`, `5`, `'obra'` o `[]`. Tampoco lanzan los tipos `constructor` y `__proto__`, ni `id` o `x` NaN, coordenadas negativas, fraccionarias o en cadena.
- **Partidas largas:** 3 semillas × 60 partidas de 10 a 70 pasos (cada partida se juega dos veces). Mezclan Construir directo, pintar y construir (los tres tipos), PintarZona, CambiarModo, Pausar, Reanudar, MoverPersonaje fraccionario, AvanzarTiempo de 1 a MAX_SAFE_INTEGER y dormir. En el conjunto hay más de 300 cambios de día y más de 100 obras terminadas (el test lo exige). En cada comando se cumple lo siguiente:
  - Un comando rechazado devuelve el mismo objeto.
  - El número de edificios solo crece con Construir.
  - Dinero, materiales y rng solo cambian al construir.
  - Con tiempo detenido no cambia nada.
  - El día solo sube de uno en uno y siempre con `desmayo` como primer evento.
  - Toda obra vigente tiene `diaFin > dia`, ninguna obra resucita y cada una termina exactamente el día `diaFin`.
  - Los eventos `obra-terminada` coinciden uno a uno con los edificios que han cambiado, en orden de id.
  - El personaje nunca toca una casilla bloqueada o inalcanzable y al despertar coincide con el oráculo.
  - La partida es determinista.

## Observaciones (sin test)

- `terminarObras` acepta `diaFin` fraccionario o en cadena por la coerción de `<=` (`'2' <= 2`), y nunca termina una obra con `diaFin` NaN o `undefined`. No lanza, pero cuando haya validación del guardado (M7) conviene rechazar esas obras allí.
- Para la búsqueda en anillos de una casa fuera del valle (con coordenadas manipuladas pero seguras), el coste es O(lado³), unos 10 ms. Es aceptable.
- No hay e2e ni capturas: la historia no cambia nada visible.
