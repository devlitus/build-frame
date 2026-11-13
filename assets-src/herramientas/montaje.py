"""Montaje de los iconos de M5: tira sobre papel para la acuarela y entregas @1x/@2x.

Uso:
  python assets-src/herramientas/montaje.py preparar <dir-render> <dir-preparado> [iconos|sobre]
      Junta los iconos del grupo (`<icono>.png` de Blender, 384 × 384) en una tira sobre papel
      crema (`<grupo>.png`), para pintarlos en una sola pasada con el mismo pincel, y guarda su
      alfa. `iconos`: las 7 herramientas; `sobre`: el sobre vacío de los iconos de semilla.
  python assets-src/herramientas/montaje.py semillas
      Compone `iconos/semilla-<cultivo>` con el sobre vacío y el cultivo maduro (requiere las
      entregas de los cultivos).
  python assets-src/herramientas/montaje.py entregar <dir-preparado> <dir-acuarela> [iconos|sobre]
      Recorta la acuarela con el alfa y escribe `public/assets/iconos/<icono>@{1,2}x.webp`
      (48 × 48 px @1x, 96 × 96 @2x) y el maestro @4x en `assets-src/herramientas/maestros/`.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
MAESTROS = RAIZ / "assets-src/herramientas/maestros"
ENTREGA = RAIZ / "public/assets/iconos"
CREMA = (245, 236, 206)
ICONOS = ("azada", "regadera", "semillas", "mano", "hacha", "pico", "planton", "sobre")
LADO = 384  # @8x


# Grupos: cada uno se pinta en una tira propia. El sobre vacío va aparte para no repintar los
# iconos ya aprobados en la PARADA 1 (la acuarela cambia si cambia la tira).
GRUPOS = {"iconos": ICONOS[:-1], "sobre": ("sobre",)}


def preparar(origen: Path, destino: Path, grupo: str = "iconos") -> None:
    destino.mkdir(parents=True, exist_ok=True)
    nombres = GRUPOS[grupo]
    tira = Image.new("RGBA", (LADO * len(nombres), LADO), (0, 0, 0, 0))
    for i, n in enumerate(nombres):
        tira.paste(Image.open(origen / f"{n}.png").convert("RGBA"), (i * LADO, 0))
    fondo = Image.new("RGBA", tira.size, CREMA + (255,))
    fondo.alpha_composite(tira)
    fondo.convert("RGB").save(destino / f"{grupo}.png")
    tira.getchannel("A").save(destino / f"{grupo}-alfa.png")


def entregar(preparado: Path, acuarela: Path, grupo: str = "iconos") -> None:
    MAESTROS.mkdir(parents=True, exist_ok=True)
    ENTREGA.mkdir(parents=True, exist_ok=True)
    alfa = Image.open(preparado / f"{grupo}-alfa.png")
    pintada = Image.open(acuarela / f"{grupo}.png").convert("RGB").resize(alfa.size, Image.LANCZOS)
    mascara = alfa.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    tira = pintada.convert("RGBA")
    tira.putalpha(mascara)
    for i, n in enumerate(GRUPOS[grupo]):
        img = tira.crop((i * LADO, 0, (i + 1) * LADO, LADO))
        img.resize((LADO // 2, LADO // 2), Image.LANCZOS).save(MAESTROS / f"{n}@4x.png")
        for k in (1, 2):
            img.resize((48 * k, 48 * k), Image.LANCZOS).save(ENTREGA / f"{n}@{k}x.webp", quality=90, alpha_quality=100, method=6)
        print(n)


CULTIVOS = ("patata", "zanahoria", "lechuga", "rabano", "fresa")


def semillas_cultivos() -> None:
    """`iconos/semilla-<cultivo>`: el sobre vacío pintado con el cultivo maduro pintado encima
    (fase 3 del maestro de `cultivos/montaje.py`), así el sobre enseña lo que saldrá."""
    sobre = Image.open(MAESTROS / "sobre@4x.png").convert("RGBA")  # 192 × 192
    caja = sobre.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
    x0, y0, x1, y1 = caja
    ancho = x1 - x0
    alto_util = (y1 - y0) * 0.78  # bajo la solapa
    for c in CULTIVOS:
        tira = Image.open(RAIZ / f"assets-src/cultivos/maestros/{c}@4x.png").convert("RGBA")
        planta = tira.crop((128 * 3, 0, 128 * 4, 192))
        bb = planta.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        planta = planta.crop(bb)
        k = min(ancho * 0.8 / planta.width, alto_util * 0.85 / planta.height)
        planta = planta.resize((round(planta.width * k), round(planta.height * k)), Image.LANCZOS)
        img = sobre.copy()
        img.alpha_composite(planta, (x0 + (ancho - planta.width) // 2, round(y1 - alto_util / 2 - planta.height / 2 - (y1 - y0) * 0.02)))
        img.save(MAESTROS / f"semilla-{c}@4x.png")
        for k2 in (1, 2):
            img.resize((48 * k2, 48 * k2), Image.LANCZOS).save(ENTREGA / f"semilla-{c}@{k2}x.webp", quality=90, alpha_quality=100, method=6)
        print("semilla", c)


if __name__ == "__main__":
    if sys.argv[1] == "semillas":
        semillas_cultivos()
        sys.exit()
    orden, a, b = sys.argv[1:4]
    {"preparar": preparar, "entregar": entregar}[orden](Path(a), Path(b), *sys.argv[4:5])
