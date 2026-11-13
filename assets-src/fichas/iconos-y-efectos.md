# Ficha — Iconos de herramientas e inventario y efectos (M5)

| Campo | Valor |
|---|---|
| Recursos | `iconos/<azada\|regadera\|semillas\|mano\|hacha\|pico\|planton>`, `iconos/semilla-<cultivo>`; `efectos/<polvo\|roca-rota\|agua>` |
| Estado | Iconos de herramientas y efectos aprobados en la PARADA 1 de M5 (2026-11-13) |
| Modelos 3D | `assets-src/herramientas/blender/modelos.py` (los mismos que lleva el protagonista en las animaciones) |
| Render | `assets-src/herramientas/blender/herramientas.py` (cámara ortográfica a 20°, herramienta en diagonal) |
| Acuarela | Como los cultivos, *denoise* **0,45**, **semilla 8301** (`herramientas/comfy/acuarela_iconos.py`) |
| Montaje | `assets-src/herramientas/montaje.py` (`preparar`/`entregar` por grupo y `semillas`) |
| Efectos | `assets-src/efectos/efectos.py` (2D procedural, semillas fijas) |
| Entregas | `public/assets/iconos/<icono>@1x.webp` (48 × 48) y `@2x` (96 × 96); `public/assets/efectos/<efecto>@{1,2}x.webp` |
| Fecha | 2026-11-13 |

## Cómo se regeneran

```bash
blender -b -P assets-src/herramientas/blender/herramientas.py -- --salida <render>
python assets-src/herramientas/montaje.py preparar <render> <preparado> iconos
python assets-src/herramientas/montaje.py preparar <render> <preparado> sobre
python assets-src/herramientas/comfy/acuarela_iconos.py <preparado> <acuarela>
python assets-src/herramientas/montaje.py entregar <preparado> <acuarela> iconos
python assets-src/herramientas/montaje.py entregar <preparado> <acuarela> sobre
python assets-src/herramientas/montaje.py semillas   # requiere las entregas de los cultivos
python assets-src/efectos/efectos.py
```

## Iconos

- 48 × 48 px @1x (≥ 44 px de la barra táctil), fondo transparente, sin sombra.
- Los 7 iconos de herramienta se pintan en una sola tira (mismo pincel). El sobre vacío va en su
  propia tira para no repintar los ya aprobados.
- `semilla-<cultivo>`: el sobre vacío pintado con el cultivo maduro pintado encima (fase 3 del
  maestro de los cultivos): el sobre enseña lo que saldrá.
- La azada tiene el mango corto (0,8 m) para que el golpe quepa en el marco de las animaciones.

## Efectos

| Archivo | Marco @1x | Fotogramas | Pivote @1x | Uso |
|---|---|---|---|---|
| `polvo` | 48 × 32 | 5 | (24, 28) | Nube de tierra al talar, picar o arar, en la base |
| `roca-rota` | 64 × 48 | 5 | (32, 44) | Sustituye a la roca al darle el último golpe |
| `agua` | 32 × 32 | 4 | casilla | Gotas sobre la casilla al regar |

La caída del árbol no es una hoja: se recomienda un *tween* del sprite del árbol (giro sobre la
base y desvanecido) con `polvo` encima al tocar el suelo. `roca-rota` parte el sprite actual de la
roca en trozos (Voronoi) con contorno sepia: si M5-00 cambia la roca, se regenera con
`efectos.py`.
