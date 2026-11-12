# Ficha — Propuestas de estilo (prototipo de arte)

Tres tratamientos del mismo protagonista y del mismo terreno, generados para la PARADA 1 del prototipo de arte. **Elige la Product Owner.**

| Campo | Valor |
|---|---|
| **Fuentes** | `assets-src/prototipo/propuestas/propuesta-<a\|b\|c>-<personaje\|terreno>.png` |
| **Workflows** | `assets-src/prototipo/comfy/json/propuesta-*.json` (formato API), generados por `assets-src/prototipo/comfy/workflows.py` |
| **Modelo** | `qwen_image_2512_fp8_e4m3fn.safetensors` · CLIP `qwen_2.5_vl_7b_fp8_scaled.safetensors` · VAE `qwen_image_vae.safetensors` |
| **LoRA** | Ninguna |
| **Muestreo** | KSampler · 30 pasos · CFG 4 · euler / simple · ModelSamplingAuraFlow 3.1 |
| **Tamaño** | Personaje 1664×928 · terreno 1328×1328 |
| **Fecha** | 2026-11-12 |
| **Tiempo** | ≈ 2,5–4,5 min por imagen en la RTX 4070 (12 GB) |
| **Descartes** | Terrenos v1 (semillas 5151, 5251, 5351): salieron como diorama isométrico. En `propuestas/descartes/`. |

Regenerar: `python assets-src/prototipo/comfy/workflows.py` y `python assets-src/prototipo/comfy/lanzar.py <destino> assets-src/prototipo/comfy/json/propuesta-*.json`.

## A — Acuarela suave (sin tinta)

**Personaje** · semilla `5101`
```
Character concept turnaround sheet for a cozy farming video game, soft hand-painted watercolor, wet-on-wet washes, delicate ink-free edges defined only by slightly darker pigment pooling at the borders, visible cold-press paper texture, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, peaceful nostalgic storybook mood. The same character shown three times standing side by side in a neutral relaxed pose, full body, evenly spaced, same scale: front view, right side profile view, back view. The character: a young adult farmer who just left an office job in the city: short wavy chestnut hair, kind tired-but-hopeful face with rosy cheeks, cream linen shirt with rolled-up sleeves, sage green work overalls, terracotta red neckerchief, small brown leather satchel across the body, sturdy brown boots; slightly chibi game proportions, about 3.5 heads tall, gender-neutral look. Plain warm cream paper background, soft contact shadow under each figure, no text, no labels, no letters.
```
**Terreno** · semilla `5152`
```
flat top-down video game map seen from directly above, orthographic, filling the entire image edge to edge with no border: a patch of a farming valley with soft muted sage-green meadow grass (not lime, not neon) with a few tiny cream wildflowers, a rectangular field of freshly tilled warm brown soil with neat horizontal furrows, a calm pale blue-green stream with soft ripples and grassy banks crossing the image, a winding ochre packed-earth path with small pebbles, one round leafy tree seen from above with its trunk base visible and one mossy grey boulder, both casting soft violet shadows to the right; no horizon, no sky, no diorama, no isometric block, no cut-away soil edges. Style: soft hand-painted watercolor, wet-on-wet washes, delicate ink-free edges defined only by slightly darker pigment pooling at the borders, visible cold-press paper texture, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, peaceful nostalgic storybook mood. No people, no text, no letters, no border.
```

## B — Tinta sepia y acuarela

**Personaje** · semilla `5201`
```
Character concept turnaround sheet for a cozy farming video game, ink and watercolor storybook illustration, thin warm sepia-brown ink linework of even weight around every shape, transparent watercolor washes inside the lines, light paper texture, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, charming cozy european picture-book style. The same character shown three times standing side by side in a neutral relaxed pose, full body, evenly spaced, same scale: front view, right side profile view, back view. The character: a young adult farmer who just left an office job in the city: short wavy chestnut hair, kind tired-but-hopeful face with rosy cheeks, cream linen shirt with rolled-up sleeves, sage green work overalls, terracotta red neckerchief, small brown leather satchel across the body, sturdy brown boots; slightly chibi game proportions, about 3.5 heads tall, gender-neutral look. Plain warm cream paper background, soft contact shadow under each figure, no text, no labels, no letters.
```
**Terreno** · semilla `5252`
```
flat top-down video game map seen from directly above, orthographic, filling the entire image edge to edge with no border: a patch of a farming valley with soft muted sage-green meadow grass (not lime, not neon) with a few tiny cream wildflowers, a rectangular field of freshly tilled warm brown soil with neat horizontal furrows, a calm pale blue-green stream with soft ripples and grassy banks crossing the image, a winding ochre packed-earth path with small pebbles, one round leafy tree seen from above with its trunk base visible and one mossy grey boulder, both casting soft violet shadows to the right; no horizon, no sky, no diorama, no isometric block, no cut-away soil edges. Style: ink and watercolor storybook illustration, thin warm sepia-brown ink linework of even weight around every shape, transparent watercolor washes inside the lines, light paper texture, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, charming cozy european picture-book style. No people, no text, no letters, no border.
```

## C — Gouache pintado (*painted game art*)

**Personaje** · semilla `5301`
```
Character concept turnaround sheet for a cozy farming video game, painterly gouache and watercolor game art, opaque matte pigment with soft brush texture, simple chunky readable shapes, clear light and shadow planes with two-tone soft cel shading, subtle darker-hue rim instead of black outlines, light paper grain, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, cozy farming game aesthetic. The same character shown three times standing side by side in a neutral relaxed pose, full body, evenly spaced, same scale: front view, right side profile view, back view. The character: a young adult farmer who just left an office job in the city: short wavy chestnut hair, kind tired-but-hopeful face with rosy cheeks, cream linen shirt with rolled-up sleeves, sage green work overalls, terracotta red neckerchief, small brown leather satchel across the body, sturdy brown boots; slightly chibi game proportions, about 3.5 heads tall, gender-neutral look. Plain warm cream paper background, soft contact shadow under each figure, no text, no labels, no letters.
```
**Terreno** · semilla `5352`
```
flat top-down video game map seen from directly above, orthographic, filling the entire image edge to edge with no border: a patch of a farming valley with soft muted sage-green meadow grass (not lime, not neon) with a few tiny cream wildflowers, a rectangular field of freshly tilled warm brown soil with neat horizontal furrows, a calm pale blue-green stream with soft ripples and grassy banks crossing the image, a winding ochre packed-earth path with small pebbles, one round leafy tree seen from above with its trunk base visible and one mossy grey boulder, both casting soft violet shadows to the right; no horizon, no sky, no diorama, no isometric block, no cut-away soil edges. Style: painterly gouache and watercolor game art, opaque matte pigment with soft brush texture, simple chunky readable shapes, clear light and shadow planes with two-tone soft cel shading, subtle darker-hue rim instead of black outlines, light paper grain, warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, cozy farming game aesthetic. No people, no text, no letters, no border.
```

## Negativo (común)
```
低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。构图混乱。文字模糊，扭曲. photo, photorealistic, 3d render, harsh black outlines, neon colors, text, letters, watermark, signature
```
