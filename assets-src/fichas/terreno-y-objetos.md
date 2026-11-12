# Ficha — *Tiles* de terreno, árbol y roca

| Campo | Valor |
|---|---|
| Recursos | `tile-hierba`, `tile-tierra`, `tile-agua`, `tile-camino` (4 variantes cada uno); `arbol`, `roca` |
| Estado | Prototipo de arte, aprobado en la PARADA 2 |
| Modelo | Qwen-Image 2512 fp8, 30 pasos, CFG 4, euler/simple, AuraFlow 3.1, sin LoRA |
| Fuentes | `assets-src/prototipo/fase4/textura-*.png` y `objeto-*.png`; workflows en `assets-src/prototipo/comfy/json/` |
| Generador | `assets-src/prototipo/comfy/workflows.py` (*prompts* y semillas) + `comfy/lanzar.py` |
| Montaje | `assets-src/prototipo/terreno.py` |
| Entregas | `public/assets/terreno/tile-<tipo>@1x.webp` (128 × 32: 4 casillas de 32) y `@2x` (256 × 64); `public/assets/objetos/<objeto>@1x.webp` y `@2x` |

## Semillas

| Pieza | Semilla | Notas |
|---|---|---|
| `textura-hierba` | 7111 | v2. La v1 (7101) pintaba matas en cuadrícula: `fase4/descartes/textura-hierba-v1.png` |
| `textura-tierra` | 7102 | Surcos horizontales; periodo detectado ≈ 113 px |
| `textura-agua` | 7113 | v2. La v1 (7103) quedaba plana al repetir: `fase4/descartes/textura-agua-v1.png` |
| `textura-camino` | 7104 | |
| `objeto-arbol` | 7211 | v2. La v1 (7201) traía rayos de sol y sombra pintada: `fase4/descartes/` |
| `objeto-roca` | 7212 | v2. Ídem (v1: 7202) |

Los *prompts* completos están en `workflows.py` (`TEXTURAS`, `OBJETOS`, `textura()`, `objeto()`).

## Cómo se hacen los *tiles* (biblia §9)

1. La textura de 1024 px cubre 4 × 4 casillas: cada casilla es un recorte de 256 px, tomado a 160 px del borde porque el modelo a veces pinta un filo de papel.
2. **Base repetible:** el recorte se mezcla con él mismo desplazado media vuelta; en los bordes manda la copia desplazada, que es continua al envolver.
3. **Variantes:** otros tres recortes, igualados en media y contraste a la base, se pintan en el interior con un fundido; el 22 % del borde es siempre el de la base. Así todas las variantes casan entre sí y consigo mismas.
4. **Tierra arada:** el lado del recorte es un número entero de surcos y todos los recortes empiezan en la misma fase, para que las filas continúen de una casilla a otra.
5. Se limita la saturación media al 42 % (biblia §4) y se reduce a 64 y 32 px.
6. `fase4/mosaico-<tipo>.png` es un mosaico de 8 × 8 casillas al azar para revisar costuras.

## Cómo se recortan los objetos

El fondo es lo claro y poco saturado conectado con el borde de la imagen (relleno desde las esquinas). Lo claro de dentro, como las luces de la roca, se conserva porque la línea sepia lo encierra. La sombra pintada por el modelo se descarta y se añade la sombra de contacto de la biblia §3. Marcos: árbol de 64 × 96 y roca de 32 × 32 @1x, pivote abajo al centro.

## Límites conocidos

- Los objetos se han hecho con ComfyUI y no en Blender a 45° (biblia §2): para el prototipo bastaba, pero sus huellas no están medidas en casillas.
- Las transiciones entre terrenos (hierba con agua, etc.) quedan para el *autotiling* de M5.
- El agua es estática (la biblia contempla 4 fotogramas en el futuro).
