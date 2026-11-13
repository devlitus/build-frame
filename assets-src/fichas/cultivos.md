# Ficha — Cultivos de primavera y plantón de árbol (M5)

| Campo | Valor |
|---|---|
| Recursos | `cultivos/<patata\|zanahoria\|lechuga\|rabano\|fresa>`; `objetos/planton` |
| Estado | Cultivos aprobados en la PARADA 1 de M5 (2026-11-13) |
| Modelo 3D | `assets-src/cultivos/blender/cultivos.py` (reutiliza material, cámara y luz de `edificios/blender/edificios.py`) |
| Acuarela | Qwen-Image 2512 fp8 img2img, *denoise* **0,5**, 30 pasos, CFG 4, euler/simple, AuraFlow 3.1, ControlNet InstantX Union (Canny) a 0,8 hasta el 80 %, **semilla 8201** |
| Generador | `assets-src/cultivos/comfy/acuarela_cultivos.py` (*prompts* en `CULTIVOS` y para `planton`) |
| Montaje | `assets-src/cultivos/montaje.py` (estirado ×√2, tira por cultivo, sombra, marchito, entregas) |
| Maestros | `assets-src/cultivos/maestros/<cultivo>@4x.png`, `planton@4x.png` |
| Entregas | `public/assets/cultivos/<cultivo>@1x.webp` (160 × 48) y `@2x` (320 × 96); `public/assets/objetos/planton@1x.webp` (64 × 48) y `@2x` |
| Lámina | `assets-src/cultivos/muestra/parada1-lamina.png` (`laminas.py`) |
| Fecha | 2026-11-13 |

## Cómo se regeneran

```bash
blender -b -P assets-src/cultivos/blender/cultivos.py -- --salida <render>
python assets-src/cultivos/montaje.py preparar <render> <preparado>
python assets-src/cultivos/comfy/acuarela_cultivos.py <preparado> <acuarela>
python assets-src/cultivos/montaje.py entregar <preparado> <acuarela>
python assets-src/cultivos/laminas.py [<fotogramas-animacion>]
```

ComfyUI en `127.0.0.1:8188`, arrancado con el Python embebido del paquete portable (ver la ficha de
edificios).

## Formato

- Tira de **5 marcos de 32 × 48 px @1x**: `0` sembrado · `1` brote · `2` joven · `3` maduro ·
  `4` marchito. Todos los cultivos usan las mismas 5 fases; el juego reparte los días de
  crecimiento de `data/cultivos.json` entre las fases 0 a 2.
- La casilla es el **cuadrado inferior** del marco (32 × 32); la planta sobresale hacia arriba.
  Pivote: el centro del borde inferior, `setOrigin(0.5, 1)` en `(32x + 16, 32(y + 1))`.
- Plantón plantado: tira de 2 marcos con el mismo formato: `0` recién plantado (con tutor) y
  `1` arbolito.
- La sombra proyectada va dentro del sprite (biblia §3).

## Método

1. **Blender pone la forma**: plantas *low-poly* por código (hojas como elipsoides aplastados,
   tallos, frutos), con el material NPR y el contorno sepia de los edificios, más fino (0,006 m)
   porque a esta escala empastaba las hojas. Un plano *holdout* en z = 0 recorta lo que queda bajo
   tierra sin deformar la geometría (aplanarla rompía el casco del contorno).
2. **Una tira por cultivo**: las 5 fases se pintan juntas en una sola pasada para que salgan con el
   mismo pincel.
3. **El marchito no se pinta**: sale de la fase 2 ya pintada, llevada a una rampa de pardos secos y
   aplastada un 12 % sobre su base (`montaje.py`, `marchito`). Pintado con su propio *prompt*, el
   modelo añadía fruta madura, piedras o flores (descartes abajo).
4. **Recorte** con el alfa del render erosionado 2 px a @8x (en hojas finas el filo crema es más
   ancho que en los edificios) y sombra violeta recogida a la escala de una planta.

## Variantes y descartes

| Pieza | Notas |
|---|---|
| Montículo de siembra con tierra arada | Casi no se leía sobre los surcos: ahora es tierra removida más clara |
| Marchitos pintados en la tira del cultivo | Fresas rojas en una mata seca |
| Marchitos pintados aparte (2 *prompts*) | Patatas, piedras y flores donde no las había |

## Límites conocidos

- La pasada a 0,5 añade detalles que no están en el modelo: la zanahoria enseña su hombro naranja
  ya en el brote y el rábano su raíz en la fase joven. Ayuda a reconocer el cultivo y no se ha
  corregido.
