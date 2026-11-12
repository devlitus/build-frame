# M2-01 · Informe del rompedor

Tests nuevos: `tests/prop/tiempo-rompedor.test.ts` (29 tests; 6 fallan a propósito).

## Fallos
Todos son S3: ninguno es alcanzable con la API actual partiendo de `crearEstadoInicial`; son defensas que faltan ante estados corruptos (p. ej. un guardado manipulado en M7) o comandos mal formados.

- S3 · `aplicarComando` con un `tipo` desconocido devuelve `undefined` (el `switch` no tiene `default`), así que `.estado` revienta. Test: «un comando desconocido no devuelve undefined».
- S3 · `AvanzarTiempo(0)` sobre un estado con `minutoDelDia > horaFin` (p. ej. 1565) devuelve `desmayo: true` y salta de día. Con 0 minutos no debería haber desmayo. Test: «avanzar 0 sobre un estado fuera de rango…».
- S3 · Con `dia = Number.MAX_SAFE_INTEGER`, `dia + 1` deja de ser entero seguro y el día se atasca. Test: «el día no se queda atascado al pasar de 2^53».
- S3 · `fechaDe` con `dia` NaN devuelve `año: NaN` y estación `''`; con `Infinity`, valores no finitos. Día 0 o negativo se acota a día 1 (bien). Test: «fechaDe con día 0, negativo, NaN…».
- S3 · `horaDe({ minutoDelDia: -1 })` devuelve `horas: -1`, `minutos: -1` (el `%` de JS conserva el signo). Test: «horaDe con minuto negativo…».
- S3 · `minutosDeJuegoPorMs` con ms negativos da minutos negativos (`-1000 ms ⇒ -1.33`); con velocidad negativa, igual. `AvanzarTiempo` los rechazaría, pero un acumulador de la capa de juego con un `delta` negativo (salto de reloj) se desincronizaría. Test: «ms negativos, NaN o velocidad inválida…».

## Resiste
- Propiedades (fast-check, secuencias de hasta 80 comandos con avances de hasta `MAX_SAFE_INTEGER`, velocidades 0..4): `minutoDelDia` siempre en [360, 1560], `dia` monótono con +1 como máximo por comando, `desmayo` coherente con el cambio de día, velocidad siempre válida, determinismo y no mutación de la entrada.
- Llegar exactamente a 1560 no es desmayo; superarlo sí; un avance enorme cruza un solo día; en pausa `AvanzarTiempo` válido devuelve el mismo objeto de estado.
- Valores extremos: `-0` (ok, sin cambios), `MAX_SAFE_INTEGER`, `'5'`, `null`, `undefined`, `-Infinity` rechazados; velocidades `'2'`, `2.0000001`, `-0`, `null`, `{}`, `[2]` rechazadas y `2.0` aceptada.
- Calendario: `fechaDe` y `horaDe` coherentes para 10 millones de días (reconstruyen el día); día 85 es primavera del año 2 y 168 invierno del año 2.
- Deriva del reloj: simulación de un acumulador a 60 fps durante 3 días a x1, x2 y x3: exactamente 3 desmayos y duración de día dentro del 1 % de lo esperado (15, 7,5 y 5 min reales). El `floor` no pierde minutos por coma flotante en un día exacto de ms. Trocear el tiempo es lineal (error < 1e-6).
- Esquema de `tiempo.json` rechaza `NaN`, `Infinity`, fraccionarios, strings, cero, negativos, estaciones vacías y como string.

## Observaciones (sin test)
- El esquema acepta `velocidades: [1, 1000000000]` y `minutosRealesPorDia: 0.001` (avances de miles de minutos por frame). Solo es un riesgo con datos editados a mano.
- `CONFIG_TIEMPO` y sus arrays no están congelados; cualquier módulo podría mutarlos.
- Diseño: un frame con `delta` grande (pestaña en segundo plano, p. ej. 10 s a x3 ≈ 40 min de juego) puede cruzar las 02:00 y descartar el sobrante; la capa de juego debería acotar el `delta` por frame (M2-02/M2-03).

## No probado
- La capa de juego (acumulador real, Phaser) aún no existe en esta historia.
