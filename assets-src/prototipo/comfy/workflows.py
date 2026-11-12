"""Generador reproducible de workflows de ComfyUI (formato API) para el prototipo de arte.

Uso:  python assets-src/prototipo/comfy/workflows.py <nombre>
Escribe `assets-src/prototipo/comfy/json/<nombre>.json`, que se lanza con
`comfy run --workflow <ruta>` (o el MCP comfy-mcp, `run_workflow`).

Modelo: Qwen-Image 2512 fp8 (el mismo de la portada), 30 pasos, CFG 4, euler/simple,
ModelSamplingAuraFlow 3.1, sin LoRA. Cada pieza fija su semilla aquí: regenerar = misma imagen.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "json"

MODELO = "qwen_image_2512_fp8_e4m3fn.safetensors"
CLIP = "qwen_2.5_vl_7b_fp8_scaled.safetensors"
VAE = "qwen_image_vae.safetensors"
NEGATIVO = (
    "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。构图混乱。文字模糊，扭曲. "
    "photo, photorealistic, 3d render, harsh black outlines, neon colors, text, letters, watermark, signature"
)

# --- Estilos (las tres propuestas) -------------------------------------------------
ESTILOS = {
    # A: continuidad directa con la portada. Manchas húmedas, sin tinta.
    "a": (
        "soft hand-painted watercolor, wet-on-wet washes, delicate ink-free edges defined only by "
        "slightly darker pigment pooling at the borders, visible cold-press paper texture, warm palette "
        "of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper left, "
        "peaceful nostalgic storybook mood"
    ),
    # B: acuarela con línea fina sepia (ink and wash), más legible a tamaño pequeño.
    "b": (
        "ink and watercolor storybook illustration, thin warm sepia-brown ink linework of even weight "
        "around every shape, transparent watercolor washes inside the lines, light paper texture, "
        "warm palette of sage green, ochre, terracotta and cream, gentle warm sunlight from the upper "
        "left, charming cozy european picture-book style"
    ),
    # C: gouache/acuarela densa, formas simples y valores claros (painted game art).
    "c": (
        "painterly gouache and watercolor game art, opaque matte pigment with soft brush texture, "
        "simple chunky readable shapes, clear light and shadow planes with two-tone soft cel shading, "
        "subtle darker-hue rim instead of black outlines, light paper grain, warm palette of sage "
        "green, ochre, terracotta and cream, gentle warm sunlight from the upper left, cozy farming "
        "game aesthetic"
    ),
}

PERSONAJE = (
    "a young adult farmer who just left an office job in the city: short wavy chestnut hair, kind "
    "tired-but-hopeful face with rosy cheeks, cream linen shirt with rolled-up sleeves, sage green "
    "work overalls, terracotta red neckerchief, small brown leather satchel across the body, sturdy "
    "brown boots; slightly chibi game proportions, about 3.5 heads tall, gender-neutral look"
)

# v1 (semillas +50) salió como diorama isométrico: descartada. v2 (semillas +51) fuerza la vista
# cenital a sangre y la paleta apagada.
TERRENO = (
    "flat top-down video game map seen from directly above, orthographic, filling the entire image "
    "edge to edge with no border: a patch of a farming valley with soft muted sage-green meadow "
    "grass (not lime, not neon) with a few tiny cream wildflowers, a rectangular field of freshly "
    "tilled warm brown soil with neat horizontal furrows, a calm pale blue-green stream with soft "
    "ripples and grassy banks crossing the image, a winding ochre packed-earth path with small "
    "pebbles, one round leafy tree seen from above with its trunk base visible and one mossy grey "
    "boulder, both casting soft violet shadows to the right; no horizon, no sky, no diorama, no "
    "isometric block, no cut-away soil edges"
)


def hoja_personaje(estilo: str) -> str:
    return (
        f"Character concept turnaround sheet for a cozy farming video game, {ESTILOS[estilo]}. "
        f"The same character shown three times standing side by side in a neutral relaxed pose, full "
        f"body, evenly spaced, same scale: front view, right side profile view, back view. "
        f"The character: {PERSONAJE}. Plain warm cream paper background, soft contact shadow under "
        f"each figure, no text, no labels, no letters."
    )


def muestra_terreno(estilo: str) -> str:
    return f"{TERRENO}. Style: {ESTILOS[estilo]}. No people, no text, no letters, no border."


# nombre -> (prompt, semilla, ancho, alto)
PIEZAS: dict[str, tuple[str, int, int, int]] = {}
for _e, _s in (("a", 5101), ("b", 5201), ("c", 5301)):
    PIEZAS[f"propuesta-{_e}-personaje"] = (hoja_personaje(_e), _s, 1664, 928)
    PIEZAS[f"propuesta-{_e}-terreno"] = (muestra_terreno(_e), _s + 51, 1328, 1328)


def workflow(nombre: str, prompt: str, semilla: int, ancho: int, alto: int, pasos: int = 30) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODELO, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVO}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": ancho, "height": alto, "batch_size": 1}},
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["4", 0],
                "positive": ["5", 0],
                "negative": ["6", 0],
                "latent_image": ["7", 0],
                "seed": semilla,
                "steps": pasos,
                "cfg": 4.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
        },
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"raices/{nombre}"}},
    }


def escribir(nombre: str) -> Path:
    prompt, semilla, ancho, alto = PIEZAS[nombre]
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA / f"{nombre}.json"
    ruta.write_text(json.dumps(workflow(nombre, prompt, semilla, ancho, alto), ensure_ascii=False, indent=2), encoding="utf-8")
    return ruta


if __name__ == "__main__":
    nombres = sys.argv[1:] or list(PIEZAS)
    for n in nombres:
        print(escribir(n))
