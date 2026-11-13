"""Láminas de revisión del arte de M5 para las paradas con la PO.

Uso: python assets-src/cultivos/laminas.py [<dir-fotogramas-animacion>]
Lee solo entregas de `public/assets/` (y, si se da, fotogramas de animación pintados a @8x) y
escribe `assets-src/cultivos/muestra/parada1-lamina.png`:

1. Un huerto sobre hierba a @2x ampliado ×2: tierra arada seca y mojada con sus bordes, y los
   5 cultivos en sus 5 fases (filas: patata, zanahoria, lechuga, rábano, fresa; columnas:
   sembrado, brote, joven, maduro, marchito).
2. El mismo huerto a tamaño real (@1x).
3. Iconos de la barra (48 px @1x, como en la barra táctil).
4. Muestra de animación de uso (si se da el directorio): golpe de hacha, abajo y de lado.
5. Efectos: polvo, roca que se rompe y gotas de riego.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
A = RAIZ / "public/assets"
MUESTRA = RAIZ / "assets-src/cultivos/muestra"
CULTIVOS = ("patata", "zanahoria", "lechuga", "rabano", "fresa")
CREMA = (245, 236, 206, 255)
SEPIA = (74, 52, 38, 255)


def fuente(t: int):
    try:
        return ImageFont.truetype("arial.ttf", t)
    except OSError:
        return ImageFont.load_default()


def huerto(k: int) -> Image.Image:
    """Parcela de 9 × 7 casillas a @k: borde de hierba, 5 × 5 arado con cultivos."""
    L = 32 * k
    hierba = Image.open(A / f"terreno/tile-hierba@{k}x.webp").convert("RGBA")
    pastos = [hierba.crop((i * L, 0, (i + 1) * L, L)) for i in range(4)]
    seca = Image.open(A / f"terreno/tierra-arada-seca@{k}x.webp").convert("RGBA")
    moja = Image.open(A / f"terreno/tierra-arada-mojada@{k}x.webp").convert("RGBA")
    casillas = lambda t: [t.crop((i * L, 0, (i + 1) * L, L)) for i in range(8)]  # noqa: E731
    cs, cm = casillas(seca), casillas(moja)
    W, H = 9, 7
    arada = {(x, y) for x in range(2, 7) for y in range(1, 6)}
    r = random.Random(5)
    img = Image.new("RGBA", (W * L, H * L))
    for y in range(H):
        for x in range(W):
            img.alpha_composite(r.choice(pastos), (x * L, y * L))
            if (x, y) in arada:
                c = cm if x >= 5 else cs  # las dos columnas de la derecha, regadas
                img.alpha_composite(c[(x * 7 + y * 3) % 4], (x * L, y * L))
                for i, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
                    if (x + dx, y + dy) not in arada:
                        img.alpha_composite(c[4 + i], (x * L, y * L))
    # Plantas por filas de atrás hacia delante (profundidad: borde frontal de la casilla).
    for fila, c in enumerate(CULTIVOS):
        tira = Image.open(A / f"cultivos/{c}@{k}x.webp").convert("RGBA")
        for f in range(5):
            marco = tira.crop((f * L, 0, (f + 1) * L, L * 3 // 2))
            x, y = 2 + f, 1 + fila
            img.alpha_composite(marco, (x * L, (y + 1) * L - marco.height))
    # Plantón plantado y una roca, en la hierba.
    if (A / f"objetos/planton@{k}x.webp").exists():
        pl = Image.open(A / f"objetos/planton@{k}x.webp").convert("RGBA")
        for i in range(2):
            m = pl.crop((i * L, 0, (i + 1) * L, L * 3 // 2))
            img.alpha_composite(m, ((7 + i) * L - (L if i else 0) + L, 3 * L - m.height + L * 0))
    return img


def main() -> None:
    anim = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    MUESTRA.mkdir(parents=True, exist_ok=True)
    grande = huerto(2)
    grande = grande.resize((grande.width * 2, grande.height * 2), Image.LANCZOS)
    real = huerto(1)
    f1, f2 = fuente(30), fuente(20)
    alto = 60 + grande.height + 40 + 360 + 40 + 2 * 230 + 80 + 260
    ancho = max(grande.width + 80 + real.width + 40, 1400)
    lam = Image.new("RGBA", (ancho, alto), CREMA)
    d = ImageDraw.Draw(lam)
    y = 20
    d.text((40, y), "M5 · PARADA 1 — cultivos, tierra arada, iconos y muestra de animación", fill=SEPIA, font=f1)
    y += 50
    lam.alpha_composite(grande, (40, y))
    d.text((40 + grande.width + 40, y), "Tamaño real (@1x)", fill=SEPIA, font=f2)
    lam.alpha_composite(real, (40 + grande.width + 40, y + 30))
    d.text((40 + grande.width + 40, y + 60 + real.height), "Filas: patata, zanahoria,\nlechuga, rábano, fresa.\nColumnas: sembrado, brote,\njoven, maduro, marchito.\nDerecha: tierra regada.", fill=SEPIA, font=f2)
    y += grande.height + 40
    # Iconos
    d.text((40, y), "Iconos (48 px @1x; arriba @2x ampliado ×2)", fill=SEPIA, font=f2)
    nombres = ["azada", "regadera", "semillas", "mano", "hacha", "pico", "planton"]
    nombres += [f"semilla-{c}" for c in CULTIVOS if (A / f"iconos/semilla-{c}@2x.webp").exists()]
    for i, n in enumerate(nombres):
        ic = Image.open(A / f"iconos/{n}@2x.webp").convert("RGBA")
        lam.alpha_composite(ic.resize((192, 192), Image.LANCZOS), (40 + i * 205, y + 40))
        lam.alpha_composite(Image.open(A / f"iconos/{n}@1x.webp").convert("RGBA"), (40 + i * 205 + 72, y + 250))
    y += 360 + 40
    # Animación
    if anim and anim.exists():
        d.text((40, y), "Animación de uso (muestra, golpe de hacha), @2x ampliado ×2: abajo y de lado", fill=SEPIA, font=f2)
        hierba = Image.open(A / "terreno/tile-hierba@2x.webp").convert("RGBA")
        for j, dr in enumerate(("abajo", "derecha")):
            for i in range(6):
                ruta = anim / f"hacha-{dr}-{i}.png"
                if not ruta.exists():
                    continue
                fr = Image.open(ruta).convert("RGBA")
                fr = fr.resize((fr.width // 4, fr.height // 4), Image.LANCZOS)  # @2x
                bg = Image.new("RGBA", fr.size)
                for xx in range(0, fr.width, 64):
                    for yy in range(0, fr.height, 64):
                        bg.paste(hierba.crop((0, 0, 64, 64)), (xx, yy))
                bg.alpha_composite(fr)
                bg = bg.resize((bg.width * 3 // 2, bg.height * 3 // 2), Image.LANCZOS)
                lam.alpha_composite(bg, (40 + i * (bg.width + 8), y + 36 + j * (bg.height + 8)))
    y += 2 * 230 + 80
    d.text((40, y), "Efectos (@2x ampliado ×2): polvo, roca que se rompe, gotas de riego", fill=SEPIA, font=f2)
    x = 40
    hierba = Image.open(A / "terreno/tile-hierba@2x.webp").convert("RGBA").crop((0, 0, 64, 64))
    for n in ("polvo", "roca-rota", "agua"):
        t = Image.open(A / f"efectos/{n}@2x.webp").convert("RGBA")
        bg = Image.new("RGBA", t.size)
        for xx in range(0, t.width, 64):
            for yy in range(0, t.height, 64):
                bg.paste(hierba, (xx, yy))
        bg.alpha_composite(t)
        bg = bg.resize((bg.width * 2 // 2, bg.height * 2 // 2), Image.LANCZOS)
        if x + bg.width > ancho - 40:
            x = 40
        lam.alpha_composite(bg, (x, y + 36))
        x += bg.width + 30
    lam.convert("RGB").save(MUESTRA / "parada1-lamina.png")
    print(MUESTRA / "parada1-lamina.png", lam.size)


if __name__ == "__main__":
    main()
