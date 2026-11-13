# M4-01 · Informe del rompedor

Tests nuevos: `tests/prop/zonas-rompedor.test.ts` (55 tests; 3 fallan a propósito). `npm run check`: lint, formato, tipos y build bien; en tests solo fallan esos 3 (603 de 606 pasan).

## Fallos

Los tres son S3: solo se pueden provocar con un estado corrupto (guardado manipulado, M7). Hoy `src/save/` no guarda el estado y ningún comando produce esos estados.

- S3 · **`aplicarZonas` no comprueba que `estado.zonas` mida lado².** Con una cadena corta (10 caracteres) pintar todo el valle devuelve `ok` con una cadena de 8772 caracteres (los huecos del array disperso desaparecen en `join`), así que los índices se desplazan y la rejilla queda desalineada. Con una cadena larga (lado² + 50) devuelve una de 9266: conserva la basura al final. Debería devolver `parametro-invalido` (o un error propio) cuando `zonas.length !== lado²`. Tests: «[S3] cadena demasiado corta…» y «[S3] cadena demasiado larga…».
- S3 · **`zonas` ausente (`undefined`) lanza `TypeError: Cannot read properties of undefined (reading 'split')`.** `aplicarComando` no debe lanzar nunca; vale la misma comprobación de longitud/tipo. Test: «[S3] zonas ausente no lanza excepción».

## Resiste

- **Rectángulos extremos:** `±MAX_SAFE_INTEGER` en las cuatro esquinas se recorta al valle y tarda ms (el bucle va acotado por el recorte); pinta exactamente lado² menos las casillas de agua, con un evento `casillas` correcto. Un rectángulo fuera del valle (positivo, negativo o con esquinas invertidas) da `sin-casillas-validas`. `-0` equivale a 0. Esquinas en cualquier orden.
- **Parámetros inválidos:** 1,5, NaN, ±Infinity, 2^53, 1e300, cadenas, `null`, `undefined`, `{}`, `[0]`, `true`, BigInt y coordenadas ausentes dan `parametro-invalido`, tanto en `PintarZona` como en `BorrarZona`; nunca lanzan.
- **Zonas inválidas:** `Cultivo`, `CULTIVO`, `.`, vacía, `c`, `toString`, `__proto__`, `constructor`, con espacio, `none`, `undefined`, `null`, números, objetos y arrays dan `parametro-invalido` y el estado es el mismo objeto. El error de parámetro tiene prioridad sobre `sin-casillas-validas`.
- **Agua y parcelas:** nunca se pinta río ni vado (los vados quedan dentro del agua calculada); sin parcelas propias da `sin-casillas-validas`; con una parcela comprada solo cambian casillas de esa parcela; árboles y rocas permiten pintar.
- **Borrar y repintar:** borrar lo pintado restaura exactamente la cadena inicial; borrar o repintar sin cambios devuelve el mismo objeto sin eventos; sobrescribir cuenta solo las casillas cambiadas.
- **Aislamiento:** el resto de campos del estado conserva la misma referencia (dinero, reloj, personaje, modo, parcelas, rng, etc.). No muta la entrada (probado con estado congelado a fondo).
- **JSON:** ida y vuelta idéntica y sigue aceptando comandos con el mismo resultado.
- **Propiedades (fast-check, 200 y 300 casos):** con secuencias mezcladas de PintarZona, BorrarZona, ComprarParcela y CambiarModo (coordenadas con extremos, -0 y ±MAX_SAFE_INTEGER): la cadena mide siempre lado², solo contiene `.chva`, nunca hay zona en agua ni en parcela no propia, el resultado es determinista y serializable. Pintar es idempotente y borrar tras pintar restaura la cadena vacía.
- **Valles de otro lado** (1×16, 2×8, 3×5, 8×4; lo que el generador acepte): la cadena mide lado² y el recorte y el número de casillas pintadas son correctos (propias y no agua).
- **Coste:** 1000 comandos de rectángulo máximo en menos de 3 s, y 1000 de una casilla en menos de 1 s, aunque cada comando recalcula `casillasRio` completo.
- **`zonaEn`:** coordenadas fuera del valle, decimales, NaN y 1e300 dan `undefined`.

## Observaciones (sin test)
- Las parcelas no pueden dejar de ser propias (no hay comando de venta), así que no hay zonas huérfanas por ese camino. Si M7 o un futuro comando lo permite, habrá que decidir si se limpian.
- `aplicarZonas` calcula `casillasRio` y un `Set` en cada comando: es lineal en el lado², suficiente hoy; se podría cachear si M4-03 pinta por arrastre en cada movimiento del puntero.
- `casillaConEdificio` es un gancho que siempre devuelve `false`; sus criterios («no cambia casillas bajo edificio») no se pueden atacar hasta M4-02.
- En un valle 8×8 con parcelas de 4 casillas no todas las parcelas son comprables (por la regla de conectividad de M3-02); es decisión de M3, no de zonas.
- No hay e2e ni capturas: la historia no cambia nada visible.
