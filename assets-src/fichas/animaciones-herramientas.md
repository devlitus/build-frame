# Ficha — Animaciones de uso de herramientas del protagonista (M5)

| Campo | Valor |
|---|---|
| Recurso | `protagonista/protagonista-herramientas`: azada, hacha, pico, regadera y agacharse, en abajo, arriba y derecha (izquierda = espejo) |
| Estado | Estilo aprobado en la PARADA 1 de M5 con la muestra del hacha (2026-11-13); hoja entregada en el lote 3 (2026-11-14) |
| Fuente | `assets-src/protagonista/blender/herramientas_anim.py` (el protagonista de `prototipo/blender/protagonista.py` con las herramientas de `herramientas/blender/modelos.py` en la mano) |
| Acuarela | El método del protagonista: Qwen-Image 2512 img2img, *denoise* **0,3**, ControlNet Canny a 0,8, **semilla 6101** fija para todos los fotogramas (`protagonista/comfy/acuarela_herramientas.py`) |
| Montaje | `node scripts/montar-hojas.mjs <fotogramas> public/assets/protagonista/protagonista-herramientas --sombra --pies 12 --sombra-ancho 29` |
| Entregas | `public/assets/protagonista/protagonista-herramientas@1x.webp` (576 × 1440) y `@2x`, con sus `.json` (JSON Hash de Phaser) |
| Muestra | `assets-src/protagonista/muestra/herramientas-contacto.png` |
| Fecha | 2026-11-14 |

## Cómo se regenera

```bash
blender -b -P assets-src/protagonista/blender/herramientas_anim.py -- --salida <fotogramas>
python assets-src/protagonista/comfy/acuarela_herramientas.py <fotogramas> <pintados>
node scripts/montar-hojas.mjs <pintados> public/assets/protagonista/protagonista-herramientas --sombra --pies 12 --sombra-ancho 29
```

## Formato

- Marco de **96 × 96 px @1x** (192 × 192 @2x), pivote **(48, 84)**: los pies a 12 px del borde
  inferior. La figura mide lo mismo que en la hoja de caminar (48 × 64, pivote (24, 58)); el marco
  es mayor porque la herramienta sube por encima de la cabeza y llega lejos por delante.
- 6 fotogramas por animación; nombres `<anim>-<abajo|arriba|derecha>-<n>`.
- Sombra de contacto incluida, del mismo tamaño que la de caminar.

## Animaciones

| Animación | Herramienta | Fotogramas |
|---|---|---|
| `azada`, `hacha`, `pico` | En la mano | 0 preparado · 1 sube · 2 arriba · 3 baja · 4 impacto · 5 recupera |
| `regadera` | En la mano | 0 en reposo · 1 la adelanta · 2–4 vierte · 5 la baja |
| `agacharse` | Ninguna | Se agacha y alarga las manos al suelo: cosechar con la mano y sembrar |

## Decisiones

- **El mango prolonga el brazo** (20° hacia delante) y la hoja mira atrás en reposo: así, con los
  brazos arriba la herramienta queda vertical sobre la cabeza y en el impacto la hoja va por
  delante hacia el suelo. Perpendicular al puño, el golpe no se leía.
- **La regadera gira sobre su asa** (animación de objeto): el esqueleto no tiene muñeca, y girar
  el antebrazo la llevaba a la cara en vez de verter.
- **Marco de 96**: con 64 de ancho la azada y el pico se salían al golpear por delante.

## Límites conocidos

- De frente (abajo), en lo alto del golpe la herramienta tapa la cara un fotograma; de espaldas,
  en el fotograma 3 queda oculta tras el cuerpo. Es lo esperable en 3/4 y la vista de lado se lee
  bien.
- De frente y de espaldas, el gesto de verter es discreto (el agua sale hacia la cámara o en
  contra); el efecto `efectos/agua` sobre la casilla lo completa.
