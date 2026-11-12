"""Láminas de presentación de las propuestas de estilo (PARADA 1).

Uso: python assets-src/prototipo/laminas.py
Para cada propuesta compone: hoja del personaje, muestra de terreno y una prueba de
legibilidad con la vista frontal reducida a la altura real del juego (54 px @1x, 108 px @2x,
biblia §1 y §7) sobre la hierba de su propio terreno. Escribe `propuestas/lamina-<x>.png` y
`propuestas/comparativa.png`.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

AQUI = Path(__file__).resolve().parent / "propuestas"
CREMA = (245, 236, 206)
SEPIA = (74, 52, 38)
NOMBRES = {"a": "A · Acuarela suave", "b": "B · Tinta sepia + acuarela", "c": "C · Gouache pintado"}


def fuente(tam: int) -> ImageFont.ImageFont:
    for f in ("georgia.ttf", "DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(f, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def figura_frontal(hoja: Image.Image) -> Image.Image:
    """Recorta la vista frontal (tercio izquierdo) y le quita el fondo de papel."""
    tercio = hoja.crop((0, 0, hoja.width // 3, hoja.height)).convert("RGB")
    fondo = Image.new("RGB", tercio.size, tercio.getpixel((tercio.width - 8, 8)))
    dif = ImageChops.difference(tercio, fondo).convert("L").point(lambda v: 255 if v > 38 else 0)
    dif = dif.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # Quita la sombra del suelo y los rayos de luz: nos quedamos con la parte central.
    caja = dif.getbbox()
    fig = tercio.crop(caja).convert("RGBA")
    fig.putalpha(dif.crop(caja).filter(ImageFilter.GaussianBlur(1.2)))
    return fig


def hierba(terreno: Image.Image, tam: tuple[int, int]) -> Image.Image:
    """El parche de pradera más verde y uniforme de la muestra, reducido a `tam`."""
    t = terreno.convert("RGB")
    lado = max(tam) * 2
    mejor, caja = -1e9, (0, 0, lado, lado)
    for y in range(0, t.height - lado, 32):
        for x in range(0, t.width - lado, 32):
            c = t.crop((x, y, x + lado, y + lado)).resize((8, 8))
            px = list(c.getdata())
            verde = sum(g - (r + b) / 2 for r, g, b in px) / len(px)
            media = [sum(v[i] for v in px) / len(px) for i in range(3)]
            var = sum(sum((v[i] - media[i]) ** 2 for i in range(3)) for v in px) / len(px)
            if verde - var**0.5 * 0.5 > mejor:
                mejor, caja = verde - var**0.5 * 0.5, (x, y, x + lado, y + lado)
    w, h = tam
    return t.crop(caja).crop((0, 0, lado * w // max(tam), lado * h // max(tam))).resize(tam, Image.LANCZOS)


def prueba_legibilidad(fig: Image.Image, terreno: Image.Image) -> Image.Image:
    lienzo = Image.new("RGB", (560, 300), CREMA)
    d = ImageDraw.Draw(lienzo)
    f = fuente(18)
    x = 16
    for etiqueta, alto in (("@1x (54 px)", 54), ("@2x (108 px)", 108)):
        w = round(fig.width * alto / fig.height)
        mini = fig.resize((w, alto), Image.LANCZOS)
        fondo = hierba(terreno, (w + 40, alto + 40))
        fondo.paste(mini, (20, 20), mini)
        lienzo.paste(fondo, (x, 40))
        d.text((x, 12), etiqueta, fill=SEPIA, font=f)
        x += fondo.width + 24
    # @1x ampliado ×4 sin suavizar, para ver qué sobrevive a tamaño real.
    w = round(fig.width * 54 / fig.height)
    mini = fig.resize((w, 54), Image.LANCZOS)
    fondo = hierba(terreno, (w + 10, 64))
    fondo.paste(mini, (5, 5), mini)
    zoom = fondo.resize((fondo.width * 4, fondo.height * 4), Image.NEAREST)
    zoom = zoom.crop((0, 0, min(zoom.width, 560 - x - 16), zoom.height))
    lienzo.paste(zoom, (x, 40))
    d.text((x, 12), "@1x ampliado ×4", fill=SEPIA, font=f)
    return lienzo


def lamina(e: str) -> Image.Image:
    hoja = Image.open(AQUI / f"propuesta-{e}-personaje.png")
    terreno = Image.open(AQUI / f"propuesta-{e}-terreno.png")
    ancho = 1664
    lam = Image.new("RGB", (ancho, 70 + hoja.height + 24 + 600), CREMA)
    d = ImageDraw.Draw(lam)
    d.text((24, 18), NOMBRES[e], fill=SEPIA, font=fuente(38))
    lam.paste(hoja.convert("RGB"), (0, 70))
    y = 70 + hoja.height + 24
    lam.paste(terreno.convert("RGB").resize((600, 600), Image.LANCZOS), (0, y))
    prueba = prueba_legibilidad(figura_frontal(hoja), terreno)
    lam.paste(prueba, (640, y + 20))
    return lam


def main() -> None:
    laminas = {}
    for e in "abc":
        laminas[e] = lamina(e)
        laminas[e].save(AQUI / f"lamina-{e}.png", optimize=True)
    # Comparativa: las tres láminas en columna, reducidas a la mitad.
    mitad = [l.resize((l.width // 2, l.height // 2), Image.LANCZOS) for l in laminas.values()]
    comp = Image.new("RGB", (mitad[0].width, sum(m.height for m in mitad)), CREMA)
    y = 0
    for m in mitad:
        comp.paste(m, (0, y))
        y += m.height
    comp.save(AQUI / "comparativa.png", optimize=True)


if __name__ == "__main__":
    main()
