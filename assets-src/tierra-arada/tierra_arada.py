"""Tierra arada de M5, seca y mojada, en estilo B.

Uso: python assets-src/tierra-arada/tierra_arada.py
Escribe en `public/assets/terreno/`:

- `tierra-arada-seca@1x.webp` y `@2x`, `tierra-arada-mojada@1x.webp` y `@2x`: tira de 8 casillas
  (32 px @1x), con la misma convención que las zonas de M4: 4 variantes de relleno y 4 bordes
  (arriba, derecha, abajo, izquierda) que se dibujan encima del relleno en cada lado cuya casilla
  vecina no está arada.

y en `assets-src/tierra-arada/muestras/` un mosaico para revisar costuras.

Diseño (ficha `assets-src/fichas/tierra-arada.md`): la casilla arada es opaca y tapa el terreno.
Dos surcos horizontales por casilla, con la cresta en tierra (#785838) y el fondo del surco en
tierra oscura (#56402B), terrones sueltos, grano de papel y manchas de acuarela suaves. El borde es
un labio de tierra removida, algo más claro, con el pigmento acumulado en el filo (biblia §6).
La mojada es la misma casilla, más oscura y algo más fría, con charcos de pigmento: al regar solo
cambia la textura y nada se mueve.

Todo es periódico con periodo de 1 casilla (128 px @4x). Semilla fija.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "assets-src/zonas"))
from zonas import hexrgb, ruido_periodico, suavizar  # noqa: E402

SALIDA = RAIZ / "public/assets/terreno"
MUESTRAS = RAIZ / "assets-src/tierra-arada/muestras"
N = 128
SEMILLA = 5101
SURCOS = 2  # por casilla

TIERRA = hexrgb("#785838")
TIERRA_OSC = hexrgb("#56402B")
TIERRA_CLARA = hexrgb("#9A7650")
SEPIA = hexrgb("#4A3426")
VIOLETA = hexrgb("#5A5470")


def relleno(variante: int, mojada: bool) -> np.ndarray:
    rnd = np.random.default_rng(SEMILLA + variante)
    y = (np.arange(N) + 0.5) / N
    # Perfil del surco: cresta redondeada y fondo estrecho; la ondulación lateral es periódica.
    ondula = ruido_periodico(rnd, N, 18)[N // 3] * 0.025
    fase = (y[:, None] * SURCOS + ondula[None, :]) % 1.0
    cresta = np.cos((fase - 0.42) * 2 * np.pi) * 0.5 + 0.5  # 1 en la cresta, 0 en el fondo
    cresta = cresta**0.8
    # Luz desde arriba-izquierda: la ladera norte de cada cresta (que mira al sol) es más clara.
    ladera = np.clip(np.sin((fase - 0.42) * 2 * np.pi) * -1, 0, 1) * 0.35
    grano = ruido_periodico(rnd, N, 1.2) * 0.05
    manchas = ruido_periodico(rnd, N, 14) * 0.08
    t = np.clip(cresta + ladera * cresta + grano + manchas, 0, 1.2)
    rgb = TIERRA_OSC + (TIERRA - TIERRA_OSC) * np.clip(t, 0, 1)[..., None]
    rgb = rgb + (TIERRA_CLARA - TIERRA) * np.clip(t - 0.9, 0, 0.3)[..., None] / 0.3 * 0.6
    # Terrones: manchas pequeñas sobre las crestas, con su lado en sombra.
    r = random.Random(SEMILLA * 10 + variante)
    yy, xx = np.mgrid[0:N, 0:N]
    for _ in range(9):
        cx, cy, rad = r.uniform(0, N), r.uniform(0, N), r.uniform(2.5, 5.5)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d = ((xx - cx - ox) ** 2 + ((yy - cy - oy) * 1.3) ** 2) / rad**2
                luz = np.clip(1 - d, 0, 1)
                somb = np.clip(1 - (((xx - cx - ox - 1.5) ** 2 + ((yy - cy - oy - 1.8) * 1.3) ** 2) / rad**2), 0, 1)
                rgb = rgb * (1 - 0.25 * somb[..., None] * (1 - luz[..., None])) + (TIERRA_CLARA - rgb) * 0.45 * luz[..., None]
    if mojada:
        rgb = mojar(rgb, rnd)
    return np.dstack([rgb, np.ones((N, N))])


def mojar(rgb: np.ndarray, rnd: np.random.Generator) -> np.ndarray:
    """Oscurece y enfría, con charcos de pigmento más oscuros en los fondos de surco."""
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    rgb = rgb * 0.74 + (VIOLETA * lum.mean() * 0.9) * 0.06
    charcos = suavizar(np.clip(ruido_periodico(rnd, N, 10), 0, None), 2)
    rgb = rgb * (1 - 0.18 * np.clip(charcos, 0, 1)[..., None])
    # Brillo húmedo muy leve en las crestas.
    brillo = np.clip(lum - np.percentile(lum, 85), 0, None) / max(1 - np.percentile(lum, 85), 1e-3)
    return np.clip(rgb + brillo[..., None] * 0.05, 0, 1)


def borde(lado: str, mojada: bool) -> np.ndarray:
    """Labio de tierra removida en un lado de la casilla (RGBA, transparente en el resto)."""
    rnd = np.random.default_rng(SEMILLA + 99)
    d = (np.arange(N) + 0.5) / N  # distancia al borde superior (0 = filo)
    irregular = ruido_periodico(rnd, N, 22)[N // 2] * 0.03
    dist = d[:, None] - irregular[None, :]
    ancho = 0.16  # ≈ 5 px @1x
    labio = np.clip(1 - dist / ancho, 0, 1)
    # Dentro del labio: la cresta clara (le da el sol) y, hacia dentro, su sombra sobre la tierra.
    cresta = np.exp(-((dist - ancho * 0.35) / (ancho * 0.22)) ** 2)
    sombra = np.exp(-((dist - ancho * 0.85) / (ancho * 0.2)) ** 2)
    filo = np.exp(-((dist - 0.015) / 0.014) ** 2)  # pigmento acumulado en el filo
    color = TIERRA * np.ones((N, N, 3))
    color = color + (hexrgb("#B89468") - color) * cresta[..., None]
    color = color * (1 - 0.35 * sombra[..., None])
    color = color * (1 - 0.85 * filo[..., None]) + SEPIA * 0.85 * filo[..., None]
    if mojada:
        color = color * 0.72
    alfa = np.clip(np.maximum(cresta, sombra * 0.6) * labio ** 0.3 + filo * 0.9, 0, 0.95)
    capa = np.dstack([color, alfa])
    giros = {"arriba": 0, "izquierda": 1, "abajo": 2, "derecha": 3}[lado]
    return np.rot90(capa, k=giros, axes=(0, 1)).copy()


def a_imagen(arr: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")


def guardar(nombre: str, casillas: list[np.ndarray]) -> None:
    tira = a_imagen(np.concatenate(casillas, axis=1))
    SALIDA.mkdir(parents=True, exist_ok=True)
    for k in (1, 2):
        tira.resize((32 * k * len(casillas), 32 * k), Image.LANCZOS).save(
            SALIDA / f"{nombre}@{k}x.webp", quality=85, alpha_quality=100, method=6
        )


def mosaico(nombre: str, casillas: list[np.ndarray]) -> None:
    """Parche arado de 5 × 3 casillas sobre hierba, a @2x, para revisar costuras y bordes."""
    lado = 64
    peq = [a_imagen(c).resize((lado, lado), Image.LANCZOS) for c in casillas]
    hierba = Image.open(RAIZ / "public/assets/terreno/tile-hierba@2x.webp").convert("RGBA")
    pastos = [hierba.crop((i * lado, 0, (i + 1) * lado, lado)) for i in range(4)]
    r = random.Random(3)
    arada = {(x, y) for x in range(1, 6) for y in range(1, 4)} | {(6, 2)}
    img = Image.new("RGBA", (lado * 8, lado * 5))
    for y in range(5):
        for x in range(8):
            img.alpha_composite(r.choice(pastos), (x * lado, y * lado))
            if (x, y) in arada:
                img.alpha_composite(peq[r.randrange(4)], (x * lado, y * lado))
                for i, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
                    if (x + dx, y + dy) not in arada:
                        img.alpha_composite(peq[4 + i], (x * lado, y * lado))
    MUESTRAS.mkdir(parents=True, exist_ok=True)
    img.save(MUESTRAS / f"{nombre}.png")


def main() -> None:
    for estado in ("seca", "mojada"):
        m = estado == "mojada"
        casillas = [relleno(v, m) for v in range(4)] + [borde(l, m) for l in ("arriba", "derecha", "abajo", "izquierda")]
        guardar(f"tierra-arada-{estado}", casillas)
        mosaico(f"tierra-arada-{estado}", casillas)
        print(estado)


if __name__ == "__main__":
    main()
