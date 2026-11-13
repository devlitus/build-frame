# Arte de M5: cultivos, tierra arada, iconos, efectos y animaciones de uso — notas para conectarlo

**Rama:** `arte/m5-cultivos-herramientas` · **Fichas:** [cultivos](../../assets-src/fichas/cultivos.md),
[tierra arada](../../assets-src/fichas/tierra-arada.md),
[iconos y efectos](../../assets-src/fichas/iconos-y-efectos.md) · **Biblia:** [BIBLIA.md](../arte/BIBLIA.md)

No se ha tocado `src/`. Todo es WebP con alfa a @1x y @2x, con filtrado lineal (biblia §8). Una
casilla mide 32 px @1x.

## Lotes

| Lote | Contenido | Estado |
|---|---|---|
| 1 | Tierra arada, 5 cultivos, 7 iconos de herramienta, efectos | Entregado (aprobado en la PARADA 1) |
| 2 | Iconos `semilla-<cultivo>`, plantón plantado | En producción |
| 3 | Animaciones de uso del protagonista | En producción |

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

## Efectos

| Archivo | Marco @1x | Fotogramas | Pivote @1x | Uso |
|---|---|---|---|---|
| `efectos/polvo` | 48 × 32 | 5 | (24, 28) | Al talar, picar o arar, en la base de la casilla |
| `efectos/roca-rota` | 64 × 48 | 5 | (32, 44) | Sustituye a la roca en el último golpe; se quita al acabar |
| `efectos/agua` | 32 × 32 | 4 | esquina de la casilla | Gotas al regar, encima de la tierra |

Velocidad recomendada: 12 fps, sin bucle. **Árbol talado:** *tween* del sprite del árbol (girar
≈ 80° sobre la base hacia el lado contrario al personaje y desvanecer en ≈ 400 ms), con `polvo`
al final.

## Coste en tiempo (RTX 4070)

| Paso | Tiempo |
|---|---|
| Blender: 25 cultivos, 8 iconos | ≈ 1 min |
| Acuarela de una tira de cultivo o de iconos | ≈ 2 min (iconos ≈ 9 min con la GPU compartida) |
| Tierra arada y efectos (procedural) | segundos |

## Pendiente y avisos

- El halo de `objetos/arbol` lo limpia M5-00 en la rama del hito; aquí no se toca.
- `efectos/roca-rota` parte la roca actual: si M5-00 la cambia, regenerar con
  `python assets-src/efectos/efectos.py`.
