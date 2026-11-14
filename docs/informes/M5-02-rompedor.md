# M5-02 · Rompedor (Energía y dormir)

Rama `feat/M5-02-energia-dormir`, sobre `8ff535a`. Tests nuevos:
- `tests/prop/energia-rompedor.test.ts`: 15 tests del núcleo. 14 pasan y **1 falla a propósito**.
- `tests/e2e/energia-rompedor.spec.ts`: 28 ejecuciones entre escritorio y móvil (11 omitidas por proyecto). **2 tests fallan a propósito**, en escritorio y en móvil cuando aplica.

## Fallos

No hay S1 ni S2. El núcleo resiste; los fallos están en el despertar con la puerta tapada y en el foco y el destino de la interfaz.

- **S3 · Con la puerta de la casa tapada por otro edificio, la cama se desplaza y desde algunas casillas pegadas a la puerta no se puede dormir.**
  - La cama pasa a la casilla libre más cercana (aquí a 1 casilla de la puerta). Desde las casillas de la puerta que quedan a distancia 2 de esa cama, `Dormir` da `lejos-de-la-cama` y el botón no aparece.
  - El aviso dice «Para dormir acércate a la puerta de tu casa», y el jugador ya está junto a la puerta.
  - Medido: puerta en (4,5) con una caja de envío encima, cama en (3,5), rechazadas (5,5) y (5,6).
  - Matiz: el estado está hecho a mano (caja de envío sobre la puerta). No he comprobado que `Construir` permita tapar la puerta: con la semilla 42 el barrido de casillas no dio ninguna casa construible por el comando. El criterio del issue dice «junto a la puerta».
  - Arreglo posible: aceptar también Chebyshev ≤ 1 de la puerta real, o cambiar el texto del aviso.
  - Test: «con la puerta tapada por otro edificio, desde cualquier casilla libre junto a la puerta se puede dormir» (`tests/prop/energia-rompedor.test.ts`).
- **S3 · Z duerme con el inventario abierto cuando el foco es neutro, aunque el botón «Dormir» esté oculto.**
  - La corrección `cbef59f` esconde el botón, pero `teclaVida` no mira el inventario. Con el foco en `<body>` (por ejemplo tras cerrar un panel o quitar el foco) la tecla Z pasa de día con el panel abierto y las ranuras en pantalla.
  - Test: «Z con el inventario abierto: si el botón se oculta, la tecla no debe dormir» (escritorio).
- **S3 · Dormir no cancela el destino pendiente del toque: el personaje sale andando de la cama.**
  - Con un destino fijado con un toque a 3 casillas, tras `Dormir` (el personaje reaparece junto a la cama) sigue caminando más de 0,5 casillas hacia el destino viejo. El desmayo sí lo cancela (`seguidor.cancelar()` solo mira el evento `desmayo`, no `dormido`).
  - Es consecuencia de que la escena solo reacciona a `desmayo`. Tampoco recentra la cámara con `dormido`; si la puerta queda lejos, la cámara barre en lugar de saltar.
  - Arreglo posible: tratar `dormido` como `desmayo` en el gancho de `EscenaValle`.
  - Test: «al dormir con un destino pendiente (toque) el personaje no sigue andando hacia él» (escritorio y móvil).

### Observaciones de diseño (sin test que falle; decide el PO)

- **Dormir vale a cualquier hora, también a las 06:00 recién despertado.** Pulsar Z n veces seguidas avanza n días sin coste (cubierto: 40 repeticiones, solo cambian día y energía). Da energía infinita (gastar, volver a la cama, dormir) y adelanta las obras sin más límite que el tiempo del propio día. Cumple el issue; conviene mirarlo cuando M5-04 (crecimiento) y M6 (resumen y ventas) cuelguen cosas del cambio de día.
- **El desmayo fija la energía en 50, no «como mucho 50».** Con 80 o 100 de energía a las 02:00 se despierta con 50 (penalización); con 0 a 49 se gana energía (+50 desde 0). No es explotable: dormir (100) siempre es mejor que esperar al desmayo. Pero «penalización suave» pasa a ser un premio si te agotas antes.
- Dormir con energía 100 gasta el día sin necesidad (el botón sigue visible): coherente con lo anterior.

## Resiste

- **Energía en el borde**: coste exacto (azada y regadera 2, hacha y pico 4) deja 0 y coste − 1 da `sin-energia` con el mismo objeto de estado. Con 0, semillas y mano valen (coste 0). Un rechazo anterior (`fuera-de-alcance`, `solo-en-vida`, `en-pausa`, `fuera-del-valle`) gana a `sin-energia` y no gasta. Secuencias de hasta 120 usos mezclando herramientas: la energía coincide con la cuenta esperada y nunca baja de 0.
- **Alcance de `Dormir`**: borde exacto en las 8 direcciones sobre una cuadrícula de ±3 (diagonal incluida), 1,999 vale y 2,0 no (cuenta por casilla, no por distancia). Casa en obra: la cama sigue siendo la aparición. Dos casas: vale la de menor id terminada; si la de menor id está en obra, la otra. Casa movida: la cama se mueve con ella y la puerta vieja deja de valer.
- **Tiempo**: dormir a las 06:00, 06:01, 16:40, 01:59 y 02:00 da siempre el día siguiente a las 06:00. 40 dormidas seguidas suman 40 días sin tocar dinero ni materiales.
- **Dormir frente a desmayarse**: 100 casos aleatorios (obras con `diaFin` 0–8, con y sin casa, día y energía cualquiera) dan el mismo estado salvo la energía y los mismos eventos de obra. Una obra con `diaFin = día + 2` sigue en obra tras la primera dormida y termina tras la segunda.
- **Estado y determinismo**: `Dormir` con campos extra se acepta sin mutar el estado (JSON idéntico) y es determinista. Energías inválidas (`NaN`, ±∞, −1, 101, 50,5, `'50'`, `null`, `undefined`, 2^53) rechazan con el mismo objeto; un estado con energía rota se cura con el desmayo.
- **Interfaz**:
  - Z con el foco en un botón del HUD no duerme; con el foco en `<body>` sí.
  - Z mantenida (auto-repetición con `repeat`) duerme una vez.
  - En Plano, Z no hace nada ni avisa.
  - Z después de E sin energía: avisa «Estás agotado» y luego duerme.
  - Dormir en pausa conserva la pausa y la velocidad ×3, y el reloj no corre.
  - El botón «Dormir» al aparecer no desplaza los botones de acción e inventario.
  - El medidor mantiene `aria-valuenow` y `aria-valuetext` coherentes con la cifra visible, y `data-baja` pasa a `true` al ≤ 25 % (24).
  - Con el aviso de agotado y otros rechazos seguidos solo queda un `.aviso` legible.
- **HUD en 320×568, 360×640 y 568×320** con la barra de energía, el botón «Dormir» y el aviso «Estás agotado» a la vez: ningún elemento se solapa (salvo la barra, que va dentro del reloj) ni sale de la pantalla, y «Dormir» mide al menos 44×44.

## Verificación visual

Capturas en `capturas/`:
- `semilla-42-debug--escritorio.png`, `--movil-horizontal.png` y `--movil-vertical.png` (HUD con la barra de energía y «Dormir» junto a la aparición).
- `m502-agotado--escritorio.png`, `--movil-horizontal.png`, `--movil-vertical.png` y `--movil-320x568.png` (energía 0, aviso «Estás agotado», «Dormir» visible).

Todo es legible, nada se corta ni se sale de la pantalla y los botones táctiles son grandes. Detalles:
- La barra de energía queda dentro de la tarjeta del reloj en las cuatro vistas. Con energía baja el relleno es rojo-naranja; con 0 queda vacía y la cifra «0» se lee.
- En 320×568 el aviso aparece bajo la fila de velocidad y no tapa los botones de tiempo; el botón «Dormir» queda encima de «Inventario» y «Usar hacha».
- En móvil vertical la tarjeta del reloj parte «Día 1 de Primavera» en dos líneas (`semilla-42-debug--movil-vertical.png`): legible, solo más alta.
- Observación: en móvil horizontal el aviso queda en el lado izquierdo, bajo el reloj, en lugar de en el centro (`m502-agotado--movil-horizontal.png`); no molesta.
