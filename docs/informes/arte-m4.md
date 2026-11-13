# Arte de M4: edificios y zonas, notas para conectarlo en M5-00

**Rama:** `arte/m4-edificios-zonas` · **Fichas:** [edificios](../../assets-src/fichas/edificios.md), [zonas](../../assets-src/fichas/zonas.md) · **Biblia:** [BIBLIA.md](../arte/BIBLIA.md)

No se ha tocado `src/`. Todo está en `public/assets/edificios/` y `public/assets/zonas/` a @1x y @2x
(WebP con alfa, filtrado lineal), listo para cargarse en M5-00.

## Edificios

Coordenadas como en M4: una casilla mide 32 px @1x y `(x, y)` es la **esquina superior izquierda
de la huella**, en casillas. Huellas: casa 4 × 3, cobertizo 3 × 2, caja 1 × 1 (`data/edificios.json`).

| Archivo (`edificios/`) | Marco @1x | @2x | Sprite: esquina sup. izq. @1x | `setOrigin` en la esquina frontal izq. de la huella |
|---|---|---|---|---|
| `casa-{terminado,obra,cimientos}` | 192 × 192 | 384 × 384 | `(32x − 16, 32y − 80)` | `(0.0833, 0.9167)` en `(32x, 32(y + 3))` |
| `cobertizo-{terminado,obra,cimientos}` | 160 × 160 | 320 × 320 | `(32x − 16, 32y − 80)` | `(0.1, 0.9)` en `(32x, 32(y + 2))` |
| `caja-{terminado,obra}` | 80 × 64 | 160 × 128 | `(32x − 16, 32y − 16)` | `(0.2, 0.75)` en `(32x, 32(y + 1))` |

- Cada marco deja **media casilla** de margen a la izquierda y abajo (el alero, el barril, los
  tablones) y más a la derecha y arriba (sombra y altura). Todos los estados de un edificio
  comparten marco: para pasar de la obra al edificio terminado basta con cambiar la textura.
- El sprite sobresale de la huella hacia arriba (tejado), como el árbol del prototipo. Eso es
  correcto en 3/4: lo que ocupa casillas es la huella, no la imagen.
- La **sombra proyectada** va dentro del sprite (biblia §3). No hay que añadir sombra de contacto.
- **Estados:** `terminado` y `obra` (lo que usa M4-05, un único estado con andamio).
  `cimientos` es un extra opcional para el primer día de una obra de varios días. La caja no lo
  tiene. El cartel de días que faltan lo dibuja el juego encima, delante de la huella.

## Zonas

`zonas/zona-<cultivo|huerto|vivienda|almacen>`: tira de 8 casillas (256 × 32 @1x, 512 × 64 @2x).

| Índice | Uso |
|---|---|
| 0–3 | Relleno: una variante por casilla, elegida con la semilla del valle como el terreno |
| 4 / 5 / 6 / 7 | Borde **arriba / derecha / abajo / izquierda**: se dibuja encima del relleno en cada lado cuya casilla vecina no es de la misma zona |

Las zonas son semitransparentes y se dibujan **encima del terreno**. Ver la ficha para la
justificación (lavado + trama + borde, legible sin depender del color).

`zonas/colocacion` (opcional, 2 casillas): `0` válida y `1` no válida. Se dibuja una por casilla
de la huella, **encima** del edificio fantasma (su sprite `terminado` al 60 % de opacidad).

## Orden de dibujo

1. Terreno.
2. Zonas: relleno y luego bordes.
3. Edificios, árboles, rocas y personajes **ordenados por la fila de su borde frontal**: la
   profundidad es `32 · (y + alto)` en los edificios y la `y` de los pies en el personaje. Así el
   protagonista queda tapado por la casa cuando pasa por detrás y la tapa cuando pasa por delante.
4. Vista previa de colocación: el fantasma y, encima, las casillas `colocacion`.
5. Cartel de obra e interfaz.

## Muestras

- `assets-src/edificios/muestra/parada1-lamina.png`: la casa y las zonas, aprobadas en la
  PARADA 1. Se hizo antes de difuminar las sombras.
- `assets-src/edificios/muestra/parada2-lamina.png` y `parada2@{1,2}x.png`: la granja completa.
- Se regeneran con `python assets-src/edificios/escena.py` y `laminas.py`, que leen solo las
  entregas de `public/assets/`.

## Coste en tiempo (RTX 4070)

| Paso | Tiempo |
|---|---|
| Blender: 8 modelos, color y sombra | ≈ 40 s en total |
| Acuarela en ComfyUI (≈ 1,15 Mpx) | ≈ 2 min por imagen; 8 imágenes, ≈ 17 min |
| Zonas (procedural) | segundos |

## Pendiente y avisos

- **Defecto previo del prototipo:** `public/assets/objetos/arbol@{1,2}x.webp` tiene un halo casi
  transparente que, sobre la hierba, se ve como un rectángulo claro alrededor del árbol (se nota
  en las escenas de muestra). **Resuelto en M5-00:** limpieza reproducible con
  `scripts/limpiar-halo-objetos.mjs` (ver la ficha `terreno-y-objetos.md`).
- `comfy launch` falla en este equipo porque usa el Python del sistema, que no tiene `torch`.
  Hay que arrancar ComfyUI con el Python embebido del paquete portable (ver la ficha).
- Cuando se aborde el issue #11 (DPR), estas texturas siguen la misma regla que el resto (biblia §8).
