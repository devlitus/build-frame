"""Efectos de M5 en estilo B: polvo, roca que se rompe y gotas de riego.

Uso: python assets-src/efectos/efectos.py
Escribe en `public/assets/efectos/` tiras horizontales de fotogramas (@1x y @2x, WebP con alfa):

| Archivo | Marco @1x | Fotogramas | Pivote @1x | Uso |
|---|---|---|---|---|
| `polvo` | 48 × 32 | 5 | (24, 28) | Nube de tierra al talar, picar o arar; se pone en la base |
| `roca-rota` | 64 × 48 | 5 | (32, 44) | Sustituye a la roca al darle el último golpe |
| `agua` | 32 × 32 | 4 | casilla | Gotas sobre la casilla al regar, encima de la tierra |

La caída del árbol no es una hoja: es un *tween* del sprite del árbol (giro sobre la base y
desvanecido) con `polvo` encima al tocar el suelo.

Todo se dibuja a @8x con manchas de acuarela (relleno plano, borde con pigmento acumulado,
grano de papel) y contorno sepia en los trozos de roca (biblia §4–§6). Semilla fija.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "public/assets/efectos"
K = 8  # dibujo a @8x
SEPIA = (74, 52, 38)
OCRE = (202, 176, 113)
OCRE_T = (154, 132, 77)
AGUA = (181, 210, 211)
AGUA_H = (111, 156, 166)


def mancha(tam, cx, cy, r, color, alfa, rnd: random.Random, irregular=0.22) -> Image.Image:
    """Mancha de acuarela: polígono irregular, borde más oscuro y bordes suaves."""
    capa = Image.new("RGBA", tam, (0, 0, 0, 0))
    n = 18
    pts = []
    fase = rnd.uniform(0, 6.28)
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * (1 + irregular * math.sin(3 * a + fase) * rnd.uniform(0.5, 1) + rnd.uniform(-0.08, 0.08))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.75))
    m = Image.new("L", tam, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(r * 0.08))
    borde = np.asarray(m, dtype=np.float32) / 255
    interior = np.asarray(m.filter(ImageFilter.GaussianBlur(r * 0.25)), dtype=np.float32) / 255
    pigmento = np.clip(borde - interior, 0, 1) * 2.2  # acumulación en el filo
    col = np.array(color, dtype=np.float32)
    rgb = np.ones((tam[1], tam[0], 3)) * col * (1 - 0.3 * pigmento[..., None])
    a = np.clip(borde * alfa * (0.85 + 0.6 * pigmento), 0, 1)
    capa = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")
    return capa


def grano(img: Image.Image, rnd: np.random.Generator, fuerza=0.12) -> Image.Image:
    a = np.asarray(img, dtype=np.float32)
    g = rnd.standard_normal(a.shape[:2])
    g = np.asarray(Image.fromarray(((g * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255 - 0.5
    a[..., 3] *= np.clip(1 + g * fuerza * 4, 0, 1)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def guardar(nombre: str, marcos: list[Image.Image], w: int, h: int) -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    tira = Image.new("RGBA", (w * K * len(marcos), h * K))
    for i, m in enumerate(marcos):
        tira.alpha_composite(m, (i * w * K, 0))
    for k in (1, 2):
        tira.resize((w * k * len(marcos), h * k), Image.LANCZOS).save(
            SALIDA / f"{nombre}@{k}x.webp", quality=90, alpha_quality=100, method=6
        )
    print(nombre, len(marcos))


def polvo() -> None:
    w, h, n = 48, 32, 5
    r = random.Random(61)
    nubes = [(r.uniform(-14, 14), r.uniform(-4, 2), r.uniform(5, 9), r.choice((OCRE, OCRE_T))) for _ in range(7)]
    marcos = []
    for f in range(n):
        t = (f + 1) / n
        img = Image.new("RGBA", (w * K, h * K))
        for dx, dy, rad, col in nubes:
            cx = (24 + dx * (0.5 + t)) * K
            cy = (27 + dy - 6 * t) * K
            rr = rad * (0.5 + 0.8 * t) * K
            img.alpha_composite(mancha(img.size, cx, cy, rr, col, 0.75 * (1 - t) ** 0.8, random.Random(f * 13 + int(dx * 10))))
        marcos.append(grano(img, np.random.default_rng(f)))
    guardar("polvo", marcos, w, h)


def roca_rota() -> None:
    """Parte el sprite de la roca en trozos (Voronoi) que se separan, caen y se desvanecen."""
    w, h, n = 64, 48, 5
    roca = Image.open(RAIZ / "public/assets/objetos/roca@2x.webp").convert("RGBA")
    roca = roca.resize((roca.width * K // 2, roca.height * K // 2), Image.LANCZOS)  # a @8x
    a = np.asarray(roca, dtype=np.float32)
    a[..., 3] = np.where(a[..., 3] < 40, 0, a[..., 3])  # sin halo
    roca = Image.fromarray(a.astype(np.uint8), "RGBA")
    rw, rh = roca.size
    r = random.Random(71)
    semillas = [(r.uniform(0.15, 0.85) * rw, r.uniform(0.2, 0.9) * rh) for _ in range(6)]
    yy, xx = np.mgrid[0:rh, 0:rw]
    d = np.stack([(xx - sx) ** 2 + (yy - sy) ** 2 for sx, sy in semillas])
    cual = d.argmin(axis=0)
    trozos = []
    for i, (sx, sy) in enumerate(semillas):
        m = (cual == i) & (a[..., 3] > 0)
        if m.sum() < 50:
            continue
        t = np.zeros_like(a)
        t[m] = a[m]
        img = Image.fromarray(t.astype(np.uint8), "RGBA")
        # Contorno sepia de cada trozo: la grieta se lee como línea de tinta (biblia §5).
        alfa = img.getchannel("A")
        filo = Image.eval(alfa.filter(ImageFilter.MaxFilter(3)), lambda v: v)
        linea = Image.new("RGBA", img.size, SEPIA + (0,))
        linea.putalpha(Image.fromarray(np.clip(np.asarray(filo, dtype=np.int16) - np.asarray(alfa.filter(ImageFilter.MinFilter(5)), dtype=np.int16), 0, 255).astype(np.uint8)))
        img.alpha_composite(linea)
        trozos.append((img, sx - rw / 2, sy - rh))
    marcos = []
    base_x, base_y = w * K / 2, (h - 4) * K
    for f in range(n):
        t = f / (n - 1)
        img = Image.new("RGBA", (w * K, h * K))
        for j, (tz, ox, oy) in enumerate(trozos):
            ang = math.atan2(oy + rh * 0.5, ox + 1e-3)
            sep = 18 * K * t
            dx = math.cos(ang) * sep * 0.5 + ox * 0.25 * t * 2
            dy = -math.sin(ang) * sep * 0.15 + (6 * K) * t * t  # sale despedido y cae
            giro = (j - 2.5) * 18 * t
            p = tz.rotate(giro, resample=Image.BICUBIC, center=(rw / 2 + ox, rh + oy))
            if t > 0.5:
                pa = np.asarray(p, dtype=np.float32)
                pa[..., 3] *= 1 - (t - 0.5) / 0.5
                p = Image.fromarray(pa.astype(np.uint8), "RGBA")
            img.alpha_composite(p, (round(base_x - rw / 2 + dx), round(base_y - rh + dy)))
        if f >= 1:
            pol = Image.new("RGBA", img.size)
            for k2 in range(4):
                rr = random.Random(f * 7 + k2)
                pol.alpha_composite(mancha(img.size, base_x + rr.uniform(-12, 12) * K, base_y - rr.uniform(0, 6) * K, (5 + 6 * t) * K, OCRE_T, 0.5 * (1 - t), rr))
            img = Image.alpha_composite(pol, img)
        marcos.append(img)
    guardar("roca-rota", marcos, w, h)


def agua() -> None:
    w = h = 32
    n = 4
    r = random.Random(81)
    gotas = [(r.uniform(5, 27), r.uniform(0, 1)) for _ in range(9)]
    marcos = []
    for f in range(n):
        img = Image.new("RGBA", (w * K, h * K))
        d = ImageDraw.Draw(img)
        for gx, fase in gotas:
            t = (f / n + fase) % 1.0
            gy = 4 + 22 * t
            largo = 3.5
            d.line([(gx * K, (gy - largo) * K), (gx * K, gy * K)], fill=AGUA_H + (int(210 * (1 - t * 0.4)),), width=int(1.2 * K))
            d.ellipse([(gx - 0.8) * K, (gy - 0.8) * K, (gx + 0.8) * K, (gy + 0.8) * K], fill=AGUA + (230,))
            if t > 0.7:  # salpicadura en el suelo
                s = (t - 0.7) / 0.3
                d.ellipse([(gx - 2.5 * s) * K, (27 - 0.8 * s) * K, (gx + 2.5 * s) * K, (27 + 0.8 * s) * K], outline=AGUA + (int(200 * (1 - s)),), width=K // 2)
        marcos.append(img.filter(ImageFilter.GaussianBlur(K * 0.15)))
    guardar("agua", marcos, w, h)


if __name__ == "__main__":
    polvo()
    roca_rota()
    agua()
