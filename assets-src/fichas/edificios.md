# Ficha — Edificios de M4 (casa, cobertizo, caja de envío)

| Campo | Valor |
|---|---|
| Recursos | `casa-{terminado,obra,cimientos}`, `cobertizo-{terminado,obra,cimientos}`, `caja-{terminado,obra}` |
| Estado | Casa aprobada en la PARADA 1 (2026-11-13); conjunto pendiente de la PARADA 2 |
| Huellas | casa 4 × 3, cobertizo 3 × 2, caja 1 × 1 casillas (M4-02, aprobadas por la PO) |
| Modelo 3D | `assets-src/edificios/blender/edificios.py` → `edificios.blend` (una colección por edificio y fase) |
| Acuarela | Qwen-Image 2512 fp8 img2img, *denoise* **0,5**, 30 pasos, CFG 4, euler/simple, AuraFlow 3.1, ControlNet InstantX Union (Canny) a 0,8 hasta el 80 %, **semilla 8101** |
| Generador | `assets-src/edificios/comfy/acuarela_edificios.py` (*prompts* en `EDIFICIOS` y `OBRA`) |
| Fuentes pintadas | `assets-src/edificios/acuarela/<edificio>-<fase>.png` (salida cruda de ComfyUI) |
| Maestros | `assets-src/edificios/maestros/<edificio>-<fase>@4x.png` |
| Entregas | `public/assets/edificios/<edificio>-<fase>@1x.webp` y `@2x.webp` |
| Fecha | 2026-11-13 |

## Cómo se regeneran

```bash
blender -b -P assets-src/edificios/blender/edificios.py -- --salida <render> --guardar assets-src/edificios/blender/edificios.blend
python assets-src/edificios/montaje.py preparar <render> <preparado>
python assets-src/edificios/comfy/acuarela_edificios.py <preparado> assets-src/edificios/acuarela --denoise 0.5
python assets-src/edificios/montaje.py entregar <preparado> assets-src/edificios/acuarela
python assets-src/edificios/escena.py && python assets-src/edificios/laminas.py
```

ComfyUI tiene que estar en marcha en `127.0.0.1:8188`. En este equipo `comfy launch` usa un
Python sin `torch`: hay que arrancarlo con el Python embebido del paquete portable
(`python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1`).

## Método (el mismo del protagonista, biblia §2, §3, §5 y §6)

1. **Blender pone la forma.** Piezas modeladas por código a escala real (1 casilla = 1 m), con el
   material NPR de 3 bandas y sombra violeta del protagonista y el contorno sepia por casco
   invertido (*Solidify* de 0,018 m). Cámara ortográfica a 45° mirando al norte y el sol de la
   biblia (rotación 35°, 0, −67°). Los umbrales de luz del material son más bajos que en el
   personaje: con ese sol rasante, las fachadas (que miran al sur) quedaban en sombra.
2. **Sombra proyectada en una segunda pasada:** el suelo blanco iluminado con el edificio invisible
   para la cámara pero haciendo sombra. `montaje.py` la convierte en la sombra violeta de la
   biblia (#5A5470 al 35 %), la difumina y la desvanece a ≈ 1 casilla del edificio: proyectada
   entera se leía como una mancha rectangular.
3. **Estirado × √2** en vertical (biblia §2) y composición sobre papel crema.
4. **Pasada de acuarela.** A diferencia del personaje se usa *denoise* 0,5, no 0,3: con 0,3 el
   render casi no cambiaba (tejado liso, paredes planas) y aquí no hay fotogramas que puedan
   parpadear. Con 0,5 el modelo pinta tejas en escama, tablas, piedras del zócalo y flores sin
   mover la silueta, porque el ControlNet ve los bordes del render.
5. **Recorte** con el alfa del render erosionado 1 px (el filo claro que pinta el modelo) y
   reducción a @4x, @2x y @1x.

## Escala

La puerta de la casa mide 1,7 m: lo mismo que el protagonista (1,7 casillas). Los muros miden
2 m y la cumbrera 2,75 m. En la primera prueba (muros de 1,3 m) la puerta parecía de juguete.

## Variantes y descartes

| Pieza | Notas |
|---|---|
| Casa, *denoise* 0,3 y 0,42 | Descartadas en la PARADA 1: tejado liso y muros grisáceos |
| Casa en obra, primera versión | El zócalo macizo se leía como una losa de hormigón; ahora es un anillo de piedra con tierra dentro |
| Huella 3 × 2 de la casa | Primera prueba antes de conocer la huella aprobada (4 × 3) |

## Límites conocidos

- La pasada a 0,5 añade algún detalle que no está en el modelo (un cubo en la obra de la casa,
  sacos dentro del cobertizo en obra). Es decoración y no cambia la silueta.
- El cobertizo en obra no lleva andamio, solo la escalera: con 2 m de altura bastaba.
- El cartel con los días de obra que restan lo dibuja el juego (M4-05); los sprites en obra
  dejan libre el frente de la huella.
