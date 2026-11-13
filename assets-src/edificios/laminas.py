"""Láminas de presentación de las paradas del arte de M4 (PARADA 2).

Uso: python assets-src/edificios/laminas.py   (después de `escena.py`)
Escribe `assets-src/edificios/muestra/parada2-lamina.png`.
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
M = RAIZ / "assets-src/edificios/muestra"
A = RAIZ / "public/assets"
SEPIA = (74, 52, 38)
CREMA = (245, 236, 206)


def fuente(negrita: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"C:/Windows/Fonts/segoeui{'b' if negrita else ''}.ttf", 26 if negrita else 22)
    except OSError:
        return ImageFont.load_default()


def sprite(n: str) -> Image.Image:
    return Image.open(A / f"edificios/{n}@2x.webp").convert("RGBA")


def casillas(ruta: Path) -> list[Image.Image]:
    h = Image.open(ruta).convert("RGBA")
    return [h.crop((i * 64, 0, (i + 1) * 64, 64)) for i in range(h.width // 64)]


def demo_colocacion(valida: bool) -> Image.Image:
    """Cobertizo fantasma (60 % de opacidad) con las casillas de su huella encima."""
    rnd = random.Random(3)
    hierba = casillas(A / "terreno/tile-hierba@2x.webp")
    marca = casillas(A / "zonas/colocacion@2x.webp")[0 if valida else 1]
    im = Image.new("RGBA", (6 * 64, 5 * 64))
    for y in range(5):
        for x in range(6):
            im.alpha_composite(rnd.choice(hierba), (x * 64, y * 64))
    if not valida:
        roca = Image.open(A / "objetos/roca@2x.webp").convert("RGBA")
        im.alpha_composite(roca, (3 * 64, 3 * 64))
    g = sprite("cobertizo-terminado")
    g.putalpha(g.getchannel("A").point(lambda v: int(v * 0.6)))
    im.alpha_composite(g, (32, round(4.5 * 64) - g.height))
    for y in (2, 3):
        for x in (1, 2, 3):
            im.alpha_composite(marca, (x * 64, y * 64))
    return im


def main() -> None:
    fb, f = fuente(True), fuente()
    esc = Image.open(M / "parada2@2x.png")
    e1 = Image.open(M / "parada2@1x.png")
    filas = [
        ("Casa 4×3 — terminada · en obra · cimientos (opcional)", ["casa-terminado", "casa-obra", "casa-cimientos"]),
        ("Cobertizo 3×2 — terminado · en obra · cimientos (opcional)   ·   Caja de envío 1×1 — terminada · en obra",
         ["cobertizo-terminado", "cobertizo-obra", "cobertizo-cimientos", "caja-terminado", "caja-obra"]),
    ]
    alto_filas = sum(45 + max(sprite(n).height for n in ns) + 20 for _, ns in filas)
    W = esc.width + 40 + e1.width + 60
    H = 45 + esc.height + 30 + alto_filas + 45 + 5 * 64 + 30
    L = Image.new("RGB", (W, H), CREMA)
    d = ImageDraw.Draw(L)
    d.text((20, 10), "Granja de muestra (@2x): zonas, casa, cobertizo, caja de envío y un cobertizo en obra", font=fb, fill=SEPIA)
    L.paste(esc, (20, 45))
    x2 = 20 + esc.width + 40
    d.text((x2, 10), "Tamaño real @1x", font=fb, fill=SEPIA)
    L.paste(e1, (x2, 45))
    y = 45 + esc.height + 30
    for titulo, ns in filas:
        d.text((20, y), titulo, font=fb, fill=SEPIA)
        y += 45
        ims = [sprite(n) for n in ns]
        h = max(i.height for i in ims)
        x = 20
        for i in ims:
            L.paste(i, (x, y + h - i.height), i)
            x += i.width + 20
        y += h + 20
    d.text((20, y), "Vista previa de colocación (opcional): válida · no válida (roca en la huella)", font=fb, fill=SEPIA)
    L.paste(demo_colocacion(True).convert("RGB"), (20, y + 40))
    L.paste(demo_colocacion(False).convert("RGB"), (20 + 6 * 64 + 30, y + 40))
    L.save(M / "parada2-lamina.png")
    print(L.size)


if __name__ == "__main__":
    main()
