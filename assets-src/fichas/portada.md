# Ficha — Portada (fondo)

| Campo | Valor |
|---|---|
| **Recurso final** | `public/assets/portada/portada-1664.webp` y `portada-960.webp` |
| **Fuente** | `assets-src/portada/portada-fuente.png` (1664×928) |
| **Workflow** | `assets-src/portada/workflow-qwen-image-2512.json` (plantilla `image_qwen_Image_2512` de ComfyUI) |
| **Modelo** | `qwen_image_2512_fp8_e4m3fn.safetensors` · CLIP `qwen_2.5_vl_7b_fp8_scaled.safetensors` · VAE `qwen_image_vae.safetensors` |
| **LoRA** | Ninguna (modo turbo desactivado) |
| **Muestreo** | KSampler · 30 pasos · CFG 4 · euler / simple · ModelSamplingAuraFlow 3.1 |
| **Tamaño** | 1664×928 |
| **Semilla** | 2202 (variante 2 de 4; descartadas: 1101, 3303, 4404) |
| **Fecha** | 2026-11-11 |
| **Elegida por** | Product Owner |

## Prompt
```
Hand-painted watercolor illustration, cozy farming game title screen background, wide panoramic view of a quiet rural valley at golden hour sunset. Rolling green hills, a patchwork of small farm plots and fields (some plowed brown soil, some green crops, some meadow with wildflowers), a winding river with a small wooden bridge, an old abandoned farmhouse with a red roof among trees, a tiny sleepy village with a church bell tower in the far distance, warm peach and soft blue sky with gentle clouds. The upper center of the image is open calm sky with empty space for a title. Soft wet-on-wet watercolor washes, visible paper texture, delicate ink-free edges, warm palette of sage green, ochre, terracotta and cream, gentle light, nostalgic and peaceful mood, Studio-Ghibli-like serenity, storybook illustration. No text, no letters, no people.
```

## Postproceso
`node scripts/optimizar-portada.mjs` → WebP calidad 82 a 1664 px y 960 px de ancho.

## Uso en el juego
`EscenaPortada` escala la imagen tipo *cover* y mantiene visible el foco (x 0,55, y 0,6) al recortar en vertical. La versión se elige según el tamaño de pantalla × `devicePixelRatio`.
