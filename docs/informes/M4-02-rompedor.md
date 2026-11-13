# M4-02 · Informe del rompedor

Tests nuevos en `tests/prop/construccion-rompedor.test.ts`: 59 tests, de los que 3 fallan a propósito. En `npm run check` pasan lint, formato y tipos; en tests fallan solo esos 3 (727 de 730 pasan). Como los tests fallan, `check` no llega al build, así que lo lancé aparte con `npm run build` y sale bien.

## Fallos

- **S1 (conocido, misma raíz que el ya reportado): cuatro cajas de envío alrededor de la aparición la encierran.** Cada una vale porque no cubre la aparición ni toca al personaje. Después, `mapaTransitabilidad` solo deja libre la casilla de aparición y el personaje no sale de ella aunque lo muevas o se desmaye. Es una variante de «una hilera de edificios aísla al personaje»: el motivo nuevo de la ronda siguiente tiene que cubrir también que la aparición quede conectada con el resto (no basta con que la casilla del personaje siga alcanzable). Test: «[conocido S1] cuatro cajas alrededor de la aparición la encierran y el personaje no puede salir».
- **S3: Construir no valida `materiales` como valida `dinero`.** Con un estado corrupto (guardado manipulado, M7) acepta `madera: 20.5` (quedan 0,5), `madera: Infinity` (queda Infinity) y `madera: '100'` (la cadena se convierte en el número 80). El dinero sí exige un entero seguro. Test: «[S3] materiales no enteros o infinitos: Construir los acepta y deja materiales inválidos».
- **S3: `MoverPersonaje` con un estado sin `edificios` lanza `TypeError: Invalid value used as weak map key`.** `mapaTransitabilidad` y `casillasOcupadas` usan `undefined` como clave de un WeakMap. Construir, PintarZona y BorrarZona sí devuelven `estado-invalido`, pero `aplicarComando` no debería lanzar nunca (el mismo criterio que en M4-01). Hoy solo pasa con un estado v7 o manipulado. Test: «[S3] MoverPersonaje con un estado sin `edificios` no debe lanzar».

## Balance (200 semillas, de la 1001 a la 1200; 1100 de ahorros, 80 madera y 20 piedra)

Medido con comandos reales: comprar la primera parcela, pintar la huella de cada edificio, pasar a Plano y construir casa, cobertizo y caja dentro de esa parcela. El sitio se busca exhaustivamente en la rejilla (sin agua, árboles, rocas ni aparición).

- En **el 100 % de las semillas** hay al menos una parcela donde caben los tres y se pueden pagar.
- **La parcela de la aparición** (la que compraría casi cualquier jugador) vale en el **82,5 %**. En el 17,5 % restante cuesta más de 750, así que después de comprarla quedan menos de 350 para la caja y el cobertizo. Su precio va de 260 a 1010, con mediana 540.
- El **80 %** de las parcelas deja al menos 350 tras comprarla. De esas, **el 99,9 % tiene sitio** para los tres.
- Por terreno: prado, asequible el 66 % y con sitio el 100 %; bosque, asequible el 89 % y con sitio el 99,7 % (a pesar de una densidad de árboles de 0,16); rocoso, asequible el 100 % y con sitio el 100 %.
- **Dinero que queda tras los tres edificios:** mínimo 50, mediana 210, máximo 490.
- **Materiales que quedan:** 10 de madera y 10 de piedra. No llega para una segunda caja (pide 20 de madera) hasta que haya tala (M5).
- No medí si la colocación encontrada parte el valle (ver el S1): la búsqueda coge el primer hueco, no el que mantiene el valle conectado.

## Resiste

- **Comparación con una implementación independiente** escrita a partir de la documentación de `MOTIVOS_COLOCACION` (fast-check, 1500 casos). El estado sale de pintar zonas y construir al azar, con todas las parcelas propias o con 18 de 36. El personaje se coloca en cualquier punto o pegado a la huella, en posiciones fraccionarias, sobre bordes de casilla y a ±0,3. Las consultas van ancladas a la aparición, a una obra existente o a cualquier sitio, con dinero y materiales justos o con uno menos. El resultado coincide siempre: válida si no se cumple ningún motivo y, si no, el primero según el orden documentado. El test exige que salgan al menos 11 de los 12 motivos. El comando `Construir` da el mismo error que la función y devuelve el mismo objeto de estado.
- **Bordes del valle:** pegada al borde vale y una casilla más allá (o con coordenadas negativas o ±MAX_SAFE_INTEGER) da `fuera-del-valle`.
- **Fronteras entre parcelas:** a caballo entre dos propias vale; entre propia y ajena da `no-propia` por los cuatro lados.
- **Río:** cada casilla de agua da `agua`, vados incluidos (los vados están dentro del agua), y también una huella que solo roza el agua por una esquina. La orilla seca vale salvo en la aparición.
- **Caja del personaje:** el límite exacto es un intervalo semiabierto, igual que en `chocaCaja`. Tocar por 1e-9 en cualquier lado o esquina da `personaje`; la diagonal exterior no toca. Propiedad con 300 casos: tras construir, el personaje nunca queda dentro de la huella, y empujando 3 s en las 8 direcciones no entra. Se desliza por la pared.
- **Casa única:** los intentos fallidos previos no gastan el «único». Tras la primera casa, veinte intentos en sitios válidos dan `unico-ya-existe` sin cambiar el estado. La casa es gratis y se puede construir con 0 de dinero y 0 de materiales.
- **Costes justos:** con lo exacto se construye y todo queda a 0; con una unidad menos de dinero, madera o piedra se rechaza con el motivo correcto. Si falta dinero y material a la vez, gana `fondos-insuficientes`. El lote inicial cubre caja y cobertizo.
- **Parámetros basura:** como tipo, `toString`, `__proto__`, `constructor`, `hasOwnProperty`, `valueOf`, `Casa`, `casa ` (con espacio), una cadena vacía, `materialesIniciales`, NaN, -0, `null`, `{}`, `[]`, `['casa']`, `true`, un objeto con `toString` y `Object.create(null)`. Como coordenadas, NaN, ±Infinity, 1,5, 2^53, 1e300, `'3'`, `null`, `{}`, `[3]`, `true` y BigInt. Nunca lanza, devuelve el mismo estado y da `parametro-invalido` o `tipo-desconocido`. `-0` se normaliza a 0 en el edificio y en el evento.
- **Cachés:** probé el mismo cauce y los mismos obstáculos con edificios nuevos. El mapa nuevo bloquea la huella y el del estado viejo no cambia aunque se alternen. También resiste la misma lista de edificios con otro valle u otra aparición, una copia de la lista y `casillasOcupadas` con otro lado. `casillaConEdificio` es coherente antes y después de construir. Pintar o borrar todo el valle después de usar las cachés no cambia la zona bajo los edificios.
- **`buscarCamino` con destino dentro de un edificio:** nunca pisa ninguna huella ni una casilla bloqueada y termina pegado al edificio.
- **Partidas largas** (2 × 150 partidas de 20 a 80 pasos, con 1100 y 80/20 de verdad y con mucho dinero): mezclan Construir (con o sin pintar la huella antes y con tipos basura), PintarZona, BorrarZona, ComprarParcela, CambiarModo, MoverPersonaje con ejes fraccionarios y AvanzarTiempo con desmayos. En todos los pasos se cumple lo siguiente:
  - No hay solapes ni nada sobre agua, obstáculos, parcelas ajenas, la aparición o una zona incompatible.
  - El personaje nunca está dentro de un edificio.
  - Dinero y materiales son enteros ≥ 0, y lo gastado es la suma de parcelas y edificios.
  - Hay como mucho una casa, los ids son consecutivos y cada obra dura lo que dice su `dias`.
  - Un comando rechazado devuelve el mismo objeto y nada muta el estado.
  - Repetir la secuencia da el mismo estado (determinismo) y el JSON de ida y vuelta es idéntico y responde igual al siguiente comando.
- **Opciones para mover:** con `ignorarId` la casa se puede mover una casilla sobre sí misma; con otro id choca. `ignorarCostes` deja colocar sin dinero.
- **Esquema** (31 casos de rechazo): falta un tipo o sobra uno; ancho 0, 1,5 o 65; alto negativo o como cadena; zonas vacías, desconocidas, repetidas o que no son una lista; coste negativo, fraccionario, con un material desconocido o sin piedra; días 0, 1,5 o 2^53; `unico` que no es booleano; falta `demolible`; claves de más; reembolso fuera de [0, 1] o como cadena; materiales iniciales negativos, fraccionarios o con claves de más; `edificios` a `null`; `__proto__` como tipo.
- **Estados raros** con Construir (edificios ausentes, materiales `null`, `siguienteIdEdificio` NaN, zonas cortas, dinero NaN, un edificio de tipo desconocido o con coordenadas NaN o 1e300): no lanza.

## Observaciones (sin test)
- La prioridad pone `zona-incompatible` antes de `unico-ya-existe`. Si intentas una segunda casa sobre almacén, la interfaz dirá «zona incompatible» y no «ya tienes casa». Coincide con lo documentado, pero quizá no es lo más útil para el jugador. Es decisión de la PO.
- No hay e2e ni capturas: la historia no cambia nada visible.

## Ronda 2

Cambios en tests del rompedor (autorizados por el orquestador): el oráculo conoce `bloquea-paso` y la nueva prioridad (`unico-ya-existe` segunda); el test de mover la casa espera `unico-ya-existe` y añade el caso equivalente con una caja (no única), que sigue dando `ocupada`; la búsqueda de balance (`colocarTres`) confirma cada candidato con comandos reales y retrocede si el núcleo lo rechaza.

Balance tras `bloquea-paso` (mismas 200 semillas): sin cambios salvo dos cifras: las parcelas asequibles con sitio pasan del 99,9 % al 99,7 % (bosque del 99,7 % al 99,2 %). Semillas con alguna parcela válida 100 %; parcela de la aparición 82,5 %; dinero restante mínimo 50, mediana 210, máximo 490.
