"""Pasada de acuarela img2img sobre fotogramas de Blender (fase 3, opción 2 de la biblia §6).

Uso:
  python assets-src/prototipo/comfy/acuarela.py <dir-fotogramas> <dir-salida> [--denoise 0.45]
         [--fuerza 0.7] [--semilla 6101] [--solo caminar-abajo-0 ...]

Para cada PNG `<anim>-<dir>-<n>.png` (RGBA, @8x de 384 × 512):
1. Lo compone sobre papel crema y lo amplía ×2 (768 × 1024) para que el modelo tenga detalle.
2. Lo sube a ComfyUI y lanza Qwen-Image 2512 en img2img (denoise bajo) con el ControlNet
   InstantX Union alimentado por los bordes Canny del propio render: el modelo repinta la
   superficie en acuarela con tinta sepia sin mover la silueta.
3. Recorta el resultado con el alfa original (erosionado 1 px para evitar el halo claro) y lo
   devuelve a 384 × 512 con fondo transparente, con el mismo nombre en <dir-salida>.

Semilla fija para todos los fotogramas: es la única forma de que el repintado sea parecido entre
fotogramas consecutivos (aun así, ver el informe: parpadea).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lanzar import URL, descargar, esperar  # noqa: E402
from workflows import CLIP, ESTILOS, MODELO, NEGATIVO, PERSONAJE, VAE  # noqa: E402

CONTROLNET = "Qwen-Image-InstantX-ControlNet-Union.safetensors"
CREMA = (245, 236, 206)


def prompt() -> str:
    return (
        f"A single small video game character sprite, full body, {ESTILOS['b']}. "
        f"The character: {PERSONAJE}. Plain flat warm cream background, no shadow, no text."
    )


def subir(img: Image.Image, nombre: str) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    limite = uuid.uuid4().hex
    cuerpo = (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{nombre}\"\r\n"
        "Content-Type: image/png\r\n\r\n"
    ).encode() + buf.getvalue() + (
        f"\r\n--{limite}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{limite}--\r\n"
    ).encode()
    req = urllib.request.Request(
        f"{URL}/upload/image", data=cuerpo, headers={"Content-Type": f"multipart/form-data; boundary={limite}"}
    )
    return json.load(urllib.request.urlopen(req))["name"]


def workflow(imagen: str, nombre: str, semilla: int, denoise: float, fuerza: float) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODELO, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt()}},
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
        "14": {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": f"raices/acuarela/{nombre}"}},
    }


def preparar(ruta: Path) -> tuple[Image.Image, Image.Image]:
    rgba = Image.open(ruta).convert("RGBA")
    fondo = Image.new("RGBA", rgba.size, CREMA + (255,))
    fondo.alpha_composite(rgba)
    grande = fondo.convert("RGB").resize((rgba.width * 2, rgba.height * 2), Image.LANCZOS)
    return grande, rgba.getchannel("A")


def recortar(pintada: Image.Image, alfa: Image.Image) -> Image.Image:
    pintada = pintada.convert("RGB").resize(alfa.size, Image.LANCZOS)
    # El modelo pinta un filo claro donde el render tocaba el papel: se erosiona 1 px el alfa
    # para quedarse con la línea sepia y no con ese halo.
    mascara = alfa.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    res = pintada.convert("RGBA")
    res.putalpha(mascara)
    return res


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("origen")
    p.add_argument("salida")
    p.add_argument("--denoise", type=float, default=0.3)
    p.add_argument("--fuerza", type=float, default=0.8)
    p.add_argument("--semilla", type=int, default=6101)
    p.add_argument("--solo", nargs="*")
    a = p.parse_args()
    origen, salida = Path(a.origen), Path(a.salida)
    crudo = salida / "crudo"
    crudo.mkdir(parents=True, exist_ok=True)
    rutas = sorted(origen.glob("*-*-*.png"))
    if a.solo:
        rutas = [r for r in rutas if r.stem in a.solo]
    trabajos = []
    for r in rutas:
        grande, alfa = preparar(r)
        nombre = subir(grande, f"raices-{r.stem}.png")
        datos = json.dumps({"prompt": workflow(nombre, r.stem, a.semilla, a.denoise, a.fuerza)}).encode()
        req = urllib.request.Request(f"{URL}/prompt", data=datos, headers={"Content-Type": "application/json"})
        trabajos.append((r.stem, alfa, json.load(urllib.request.urlopen(req))["prompt_id"]))
    for stem, alfa, pid in trabajos:
        t0 = time.time()
        e = esperar(pid)
        if e.get("status", {}).get("status_str") == "error":
            print(f"ERROR {stem}: {json.dumps(e['status'])[:600]}")
            continue
        (img,) = descargar(e, crudo, stem)
        recortar(Image.open(img), alfa).save(salida / f"{stem}.png")
        print(f"{stem}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
