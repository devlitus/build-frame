"""Montaje de los edificios de M4: estirado 3/4, sombra, entregas @1x/@2x.

Uso:
  python assets-src/edificios/montaje.py preparar <dir-render> <dir-preparado>
      Estira × √2 (biblia §2) cada `<edificio>-<fase>.png` de Blender a @8x y lo deja sobre papel
      crema, listo para la pasada de acuarela (`comfy/acuarela_edificios.py`). Guarda también el
      alfa estirado (`<nombre>-alfa.png`) y la máscara de sombra (`<nombre>-sombra.png`).
  python assets-src/edificios/montaje.py entregar <dir-preparado> <dir-acuarela>
      Recorta la acuarela con el alfa, le añade la sombra proyectada violeta y escribe el maestro
      @4x en `assets-src/edificios/maestros/` y las entregas @1x/@2x en
      `public/assets/edificios/<edificio>-<fase>@{1,2}x.webp`.

Las proporciones salen del marco de `blender/edificios.py` (MARCOS): 1 casilla = 32 px @1x.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
MAESTROS = RAIZ / "assets-src/edificios/maestros"
ENTREGA = RAIZ / "public/assets/edificios"
CREMA = (245, 236, 206)
SOMBRA_RGB = np.array([0x5A, 0x54, 0x70], dtype=np.float32) / 255
SOMBRA_OPACIDAD = 0.35  # biblia §3: #5A5470 al 35 %, multiplicar
PX_M8 = 256


def estirar(img: Image.Image) -> Image.Image:
    alto = round(img.height * math.sqrt(2))
    return img.resize((img.width, alto), Image.LANCZOS)


def mascara_sombra(ruta: Path) -> Image.Image:
    """Del render del suelo (blanco iluminado con la sombra del edificio) a una máscara 0..1."""
    v = np.asarray(Image.open(ruta).convert("L"), dtype=np.float32)
    luz, sombra = np.percentile(v, 99), np.percentile(v, 0.5)
    m = np.clip((luz - v) / max(luz - sombra, 1), 0, 1)
    m = np.where(m < 0.08, 0, m)  # el suelo no es del todo uniforme
    return Image.fromarray((m * 255).astype(np.uint8))


def preparar(origen: Path, destino: Path) -> None:
    destino.mkdir(parents=True, exist_ok=True)
    for r in sorted(origen.glob("*.png")):
        if r.stem.endswith("-sombra"):
            continue
        rgba = estirar(Image.open(r).convert("RGBA"))
        fondo = Image.new("RGBA", rgba.size, CREMA + (255,))
        fondo.alpha_composite(rgba)
        fondo.convert("RGB").save(destino / f"{r.stem}.png")
        rgba.getchannel("A").save(destino / f"{r.stem}-alfa.png")
        estirar(mascara_sombra(origen / f"{r.stem}-sombra.png")).save(destino / f"{r.stem}-sombra.png")
        print(r.stem, rgba.size)


def componer(pintada: Image.Image, alfa: Image.Image, sombra: Image.Image) -> Image.Image:
    """Edificio pintado recortado con su alfa sobre la sombra violeta (premultiplicada)."""
    pintada = pintada.convert("RGB").resize(alfa.size, Image.LANCZOS)
    # Igual que con el protagonista: erosionar 1 px el alfa quita el filo claro que pinta el modelo.
    a = np.asarray(alfa.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255
    s = np.asarray(sombra.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255 * SOMBRA_OPACIDAD
    s = s * (1 - a)
    col = np.asarray(pintada, dtype=np.float32) / 255
    # Píxeles de sombra: color de la sombra con opacidad s (en el juego se dibuja en modo normal;
    # sobre el terreno equivale de sobra al «multiplicar» de la biblia a esta opacidad).
    alfa_total = a + s
    rgb = (col * a[..., None] + SOMBRA_RGB * 0.55 * s[..., None]) / np.maximum(alfa_total, 1e-6)[..., None]
    out = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alfa_total, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def entregar(preparado: Path, acuarela: Path) -> None:
    MAESTROS.mkdir(parents=True, exist_ok=True)
    ENTREGA.mkdir(parents=True, exist_ok=True)
    for r in sorted(preparado.glob("*-alfa.png")):
        nombre = r.stem.removesuffix("-alfa")
        pintada_ruta = acuarela / f"{nombre}.png"
        if not pintada_ruta.exists():
            print("falta acuarela:", nombre)
            continue
        img = componer(Image.open(pintada_ruta), Image.open(r), Image.open(preparado / f"{nombre}-sombra.png"))
        w8, h8 = img.size
        maestro = img.resize((w8 // 2, h8 // 2), Image.LANCZOS)  # @4x
        maestro.save(MAESTROS / f"{nombre}@4x.png")
        for k in (1, 2):
            w, h = round(w8 / 8 * k), round(h8 / 8 * k)
            img.resize((w, h), Image.LANCZOS).save(ENTREGA / f"{nombre}@{k}x.webp", quality=90, alpha_quality=100, method=6)
        print(nombre, f"@1x {round(w8 / 8)}×{round(h8 / 8)}")


if __name__ == "__main__":
    orden, a, b = sys.argv[1:4]
    {"preparar": preparar, "entregar": entregar}[orden](Path(a), Path(b))
