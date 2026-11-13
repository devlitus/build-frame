"""Pasada de acuarela img2img sobre los edificios de Blender (mismo método que el protagonista).

Uso:
  python assets-src/edificios/comfy/acuarela_edificios.py <dir-preparado> <dir-salida>
         [--denoise 0.3] [--fuerza 0.8] [--semilla 8101] [--solo casa-terminado ...] [--ids ...]

Lee de <dir-preparado> los `<edificio>-<fase>.png` ya estirados sobre papel crema
(`montaje.py preparar`), los reduce a ≈ 1,1 Mpx, los sube a ComfyUI y lanza Qwen-Image 2512 en
img2img con el ControlNet InstantX Union alimentado por los bordes Canny del render: el modelo
repinta la superficie en tinta sepia y acuarela sin mover la silueta. Guarda el resultado sin
recortar en <dir-salida>/<nombre>.png (el recorte y la sombra los hace `montaje.py entregar`).

Encola todo de una vez y espera por HTTP (el MCP corta la espera a los 60 s, informe del
prototipo §6). Si el script se corta, `--ids` descarga trabajos ya encolados.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / "assets-src/prototipo/comfy"))
from acuarela import CONTROLNET, subir  # noqa: E402
from lanzar import URL, descargar, esperar  # noqa: E402
from workflows import CLIP, ESTILOS, MODELO, NEGATIVO, VAE  # noqa: E402

MPX = 1.15e6

EDIFICIOS = {
    "casa": "a small humble countryside cottage of someone who just moved from the city: cream "
    "lime-plastered walls with dark timber corner posts, a terracotta clay-tile gable roof with "
    "visible rows of tiles, a stone chimney, a wooden plank front door, one small window with "
    "sage green shutters and a flower box, a rain barrel, on a low fieldstone base",
    "cobertizo": "a small rustic wooden tool shed with vertical weathered planks, a single-slope "
    "roof of dark wooden shingles, a wide double barn door with X braces and an iron latch, "
    "a couple of grain sacks and a pitchfork leaning by the door",
    "caja": "a sturdy wooden shipping crate with a lid, two dark iron straps, a small paper "
    "shipping tag and a latch",
}
OBRA = {
    "cimientos": "the building site at its very beginning: a half-laid low fieldstone foundation "
    "around a patch of bare brown earth, marked out with wooden stakes and taut string, a pile "
    "of stones and a stack of fresh planks",
    "obra": "the building under construction: a skeleton timber frame of fresh light wood "
    "posts, beams and bare roof rafters on a fieldstone foundation, a half-built plank wall, "
    "a wooden scaffold, a ladder, a stack of planks and a sawhorse",
    "caja-obra": "being built: a half-assembled wooden crate with missing side planks and loose "
    "planks leaning against it",
}


def prompt(nombre: str) -> str:
    edificio, fase = nombre.split("-", 1)
    obra = OBRA.get(nombre, OBRA.get(fase))
    que = EDIFICIOS[edificio] if fase == "terminado" else f"{obra} ({EDIFICIOS[edificio]} not finished yet)"
    return (
        f"Single isolated building game asset for a cozy 2D top-down farming game, three-quarter "
        f"view from above at 45 degrees, {ESTILOS['b']}, lit from the left: {que}. "
        f"Hand-painted surfaces with visible brush texture and soft pigment pooling. "
        f"Plain flat warm cream background, no ground, no shadow, no text."
    )


def workflow(imagen: str, nombre: str, semilla: int, denoise: float, fuerza: float) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODELO, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt(nombre)}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVO}},
        "7": {"class_type": "LoadImage", "inputs": {"image": imagen}},
        "8": {"class_type": "VAEEncode", "inputs": {"pixels": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "Canny", "inputs": {"image": ["7", 0], "low_threshold": 0.15, "high_threshold": 0.4}},
        "10": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CONTROLNET}},
        "11": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["5", 0],
                "negative": ["6", 0],
                "control_net": ["10", 0],
                "image": ["9", 0],
                "strength": fuerza,
                "start_percent": 0.0,
                "end_percent": 0.8,
                "vae": ["3", 0],
            },
        },
        "12": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["4", 0],
                "positive": ["11", 0],
                "negative": ["11", 1],
                "latent_image": ["8", 0],
                "seed": semilla,
                "steps": 30,
                "cfg": 4.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": denoise,
            },
        },
        "13": {"class_type": "VAEDecode", "inputs": {"samples": ["12", 0], "vae": ["3", 0]}},
        "14": {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": f"raices/edificios/{nombre}"}},
    }


def a_tamano_modelo(img: Image.Image) -> Image.Image:
    k = (MPX / (img.width * img.height)) ** 0.5
    w, h = (max(16, round(img.width * k / 16) * 16), max(16, round(img.height * k / 16) * 16))
    return img.resize((w, h), Image.LANCZOS)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("origen")
    p.add_argument("salida")
    p.add_argument("--denoise", type=float, default=0.3)
    p.add_argument("--fuerza", type=float, default=0.8)
    p.add_argument("--semilla", type=int, default=8101)
    p.add_argument("--solo", nargs="*")
    p.add_argument("--sufijo", default="")
    p.add_argument("--ids", nargs="*", help="nombre=prompt_id de trabajos ya encolados")
    a = p.parse_args()
    origen, salida = Path(a.origen), Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    if a.ids:
        trabajos = [tuple(x.split("=", 1)) for x in a.ids]
    else:
        rutas = [r for r in sorted(origen.glob("*.png")) if not r.stem.endswith(("-alfa", "-sombra"))]
        if a.solo:
            rutas = [r for r in rutas if r.stem in a.solo]
        trabajos = []
        for r in rutas:
            nombre = subir(a_tamano_modelo(Image.open(r).convert("RGB")), f"raices-ed-{r.stem}.png")
            wf = workflow(nombre, r.stem, a.semilla, a.denoise, a.fuerza)
            datos = json.dumps({"prompt": wf}).encode()
            req = urllib.request.Request(f"{URL}/prompt", data=datos, headers={"Content-Type": "application/json"})
            pid = json.load(urllib.request.urlopen(req))["prompt_id"]
            trabajos.append((r.stem, pid))
            print(f"encolado {r.stem}={pid}", flush=True)
    for stem, pid in trabajos:
        t0 = time.time()
        e = esperar(pid, tope=3 * 3600)
        if e.get("status", {}).get("status_str") == "error":
            print(f"ERROR {stem}: {json.dumps(e['status'])[:600]}", flush=True)
            continue
        descargar(e, salida, stem + a.sufijo)
        print(f"hecho {stem}{a.sufijo} ({time.time() - t0:.0f}s)", flush=True)
    print("FIN", flush=True)


if __name__ == "__main__":
    main()
