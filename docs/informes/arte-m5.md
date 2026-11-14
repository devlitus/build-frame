# Arte de M5: cultivos, tierra arada, iconos, efectos y animaciones de uso — notas para conectarlo

**Rama:** `arte/m5-cultivos-herramientas` · **Fichas:** [cultivos](../../assets-src/fichas/cultivos.md),
[tierra arada](../../assets-src/fichas/tierra-arada.md),
[iconos y efectos](../../assets-src/fichas/iconos-y-efectos.md),
[animaciones](../../assets-src/fichas/animaciones-herramientas.md) · **Biblia:** [BIBLIA.md](../arte/BIBLIA.md)

No se ha tocado `src/`. Todo es WebP con alfa a @1x y @2x, con filtrado lineal (biblia §8). Una
casilla mide 32 px @1x.

## Lotes

| Lote | Contenido | Estado |
|---|---|---|
| 1 | Tierra arada, 5 cultivos, 7 iconos de herramienta, efectos | Entregado (aprobado en la PARADA 1, PR #60) |
| 2 | Iconos `semilla-<cultivo>`, plantón plantado | Entregado (PR #65) |
| 3 | Animaciones de uso del protagonista | Entregado |

## Tierra arada (M5-03/M5-04)

`terreno/tierra-arada-<seca|mojada>`: tira de 8 casillas con la convención de las zonas de M4.

| Índice | Uso |
|---|---|
| 0–3 | Relleno opaco: una variante por casilla, elegida con la semilla del valle |
| 4 / 5 / 6 / 7 | Borde **arriba / derecha / abajo / izquierda**: encima del relleno en cada lado cuya casilla vecina no está arada |

- Seca y mojada comparten geometría: regar solo cambia la textura.
- **Orden de dibujo:** terreno → relleno de la zona → tierra arada → bordes de la zona → cultivos
  y objetos ordenados por profundidad. Si el relleno de la zona va encima de la tierra, la ensucia.

## Cultivos (M5-03 a M5-05)

`cultivos/<patata|zanahoria|lechuga|rabano|fresa>`: tira de **5 marcos de 32 × 48 px @1x**
(64 × 96 @2x).

| Marco | Fase |
|---|---|
| 0 | Sembrado |
| 1 | Brote |
| 2 | Joven |
| 3 | Maduro (se cosecha) |
| 4 | Marchito (3 días sin agua) |

- El juego reparte los días de crecimiento de `data/cultivos.json` entre los marcos 0 a 2. La
  fresa rebrota: al cosecharla vuelve al marco 2.
- La casilla es el cuadrado inferior del marco. **Pivote:** centro del borde inferior,
  `setOrigin(0.5, 1)` en `(32x + 16, 32(y + 1))`.
- **Profundidad:** `32(y + 1)`, como el borde frontal de los edificios; el protagonista queda
  delante de las plantas de su fila de atrás y detrás de las de delante.
- La sombra va dentro del sprite.

## Iconos (M5-01)

`iconos/<azada|regadera|semillas|mano|hacha|pico|planton>`: **48 × 48 px @1x** (96 × 96 @2x),
fondo transparente. Cumplen los 44 px mínimos de la barra táctil a @1x; con DPR 2 usar @2x a
escala 0,5.

Iconos de inventario de semillas: `iconos/semilla-<patata|zanahoria|lechuga|rabano|fresa>`, mismo
tamaño. Son el sobre con el cultivo maduro pintado encima. `iconos/sobre` (vacío) queda por si
hace falta un sobre genérico.

## Plantón de árbol (M5-06)

- Inventario: `iconos/planton`.
- Plantado: `objetos/planton`, tira de **2 marcos de 32 × 48 px @1x**: `0` recién plantado
  (con tutor) y `1` arbolito. Mismo pivote y profundidad que los cultivos. Cuando termina de
  crecer se sustituye por `objetos/arbol`.

## Efectos

| Archivo | Marco @1x | Fotogramas | Pivote @1x | Uso |
|---|---|---|---|---|
| `efectos/polvo` | 48 × 32 | 5 | (24, 28) | Al talar, picar o arar, en la base de la casilla |
| `efectos/roca-rota` | 64 × 48 | 5 | (32, 44) | Sustituye a la roca en el último golpe; se quita al acabar |
| `efectos/agua` | 32 × 32 | 4 | esquina de la casilla | Gotas al regar, encima de la tierra |

Velocidad recomendada: 12 fps, sin bucle. **Árbol talado:** *tween* del sprite del árbol (girar
≈ 80° sobre la base hacia el lado contrario al personaje y desvanecer en ≈ 400 ms), con `polvo`
al final.

## Animaciones de uso (M5-03 a M5-06)

`protagonista/protagonista-herramientas@{1,2}x.{webp,json}`: hoja aparte de la de caminar, en
JSON Hash de Phaser.

- Marco de **96 × 96 px @1x**, pivote **(48, 84)**: `setOrigin(0.5, 0.875)` en los pies del
  personaje. La figura mide lo mismo que en la hoja de caminar; solo cambia el marco, así que al
  pasar de caminar a usar una herramienta hay que cambiar también el origen.
- Marcos `<azada|hacha|pico|regadera|agacharse>-<abajo|arriba|derecha>-<0..5>`; izquierda =
  `derecha` con `flipX`.
- `agacharse` sirve para la mano (cosechar) y para sembrar.
- Velocidad recomendada: 12 fps sin bucle (0,5 s por acción). El impacto es el fotograma 4: es el
  momento de aplicar el efecto (arar, talar, picar) y de lanzar `efectos/polvo`. En `regadera`,
  `efectos/agua` va en los fotogramas 2 a 4.

## Coste en tiempo (RTX 4070)

| Paso | Tiempo |
|---|---|
| Blender: 25 cultivos, 8 iconos | ≈ 1 min |
| Acuarela de una tira de cultivo o de iconos | ≈ 2 min (iconos ≈ 9 min con la GPU compartida) |
| Tierra arada y efectos (procedural) | segundos |
| Animaciones: Blender (90 fotogramas) | ≈ 3 min |
| Animaciones: acuarela | ≈ 130 s por fotograma, ≈ 3 h 15 min en total |

## Pendiente y avisos

- El halo de `objetos/arbol` lo limpia M5-00 en la rama del hito; aquí no se toca.
- `efectos/roca-rota` parte la roca actual: si M5-00 la cambia, regenerar con
  `python assets-src/efectos/efectos.py`.
