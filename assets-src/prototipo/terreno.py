"""Tiles repetibles y objetos (árbol, roca) a partir de las texturas generadas en ComfyUI (fase 4).

Uso: python assets-src/prototipo/terreno.py
Lee `assets-src/prototipo/fase4/textura-<tipo>.png` y `objeto-<tipo>.png` (salida de
`comfy/lanzar.py`) y escribe:

- `public/assets/terreno/tile-<tipo>@1x.webp` (4 variantes de 32 × 32 en fila) y `@2x` (64 × 64).
- `public/assets/objetos/<objeto>@1x.webp` y `@2x` (marco de la biblia §1, pivote abajo al centro).
- `assets-src/prototipo/fase4/mosaico-<tipo>.png`: 8 × 8 casillas al azar a @2x para revisar costuras.

Tiles (biblia §9): el maestro es de 128 px (@4x). Primero se hace una base repetible consigo
misma (mezcla con la textura desplazada media vuelta); luego cada variante pinta su interior con
otro recorte de la misma textura, pero conserva el borde de la base: así todas las variantes
encajan entre sí y consigo mismas.
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = RAIZ / "assets-src/prototipo/fase4"
TERRENO = RAIZ / "public/assets/terreno"
OBJETOS = RAIZ / "public/assets/objetos"
MAESTRO = 128  # px por casilla @4x
RECORTE = 256  # px de textura generada por casilla (la textura de 1024 cubre 4 × 4 m)
CREMA = np.array([245, 236, 206], dtype=np.float32)

MARGEN = 160  # la textura generada trae a veces un filo de papel: se recorta solo por dentro
# objeto -> (ancho, alto) del marco @1x
MARCOS = {"arbol": (64, 96), "roca": (32, 32)}


def rampa(n: int, ancho: float) -> np.ndarray:
    """0 en los bordes, 1 en el interior, con transición suave de `ancho` (fracción del lado)."""
    t = np.minimum(np.arange(n) + 0.5, n - np.arange(n) - 0.5) / (n * ancho)
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def mascara(n: int, ancho: float) -> np.ndarray:
    r = rampa(n, ancho)
    return np.minimum.outer(r, r)[..., None]


def repetible(a: np.ndarray) -> np.ndarray:
    """Hace `a` repetible: en los bordes manda la textura desplazada media vuelta (continua al
    envolver) y en el centro, la original."""
    n = a.shape[0]
    desplazada = np.roll(a, (n // 2, n // 2), axis=(0, 1))
    m = mascara(n, 0.5)
    return a * m + desplazada * (1 - m)


def periodo_filas(tex: np.ndarray) -> float | None:
    """Periodo vertical (px) de los surcos si los hay: primer pico claro de la autocorrelación
    de la luminancia media por fila. None si la textura no tiene filas."""
    fila = tex[MARGEN:-MARGEN, MARGEN:-MARGEN].mean(axis=(1, 2))
    fila = fila - fila.mean()
    ac = np.correlate(fila, fila, "full")[len(fila) - 1 :]
    ac /= ac[0]
    for k in range(20, 200):
        if ac[k] > 0.3 and ac[k] >= ac[k - 1] and ac[k] >= ac[k + 1]:
            return float(k)
    return None


def igualar(a: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Iguala media y contraste por canal a `ref`: las variantes no forman parches de tono."""
    m, d = a.mean(axis=(0, 1)), a.std(axis=(0, 1)) + 1e-3
    return (a - m) / d * ref.std(axis=(0, 1)) + ref.mean(axis=(0, 1))


def a_maestro(a: np.ndarray) -> np.ndarray:
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return np.asarray(img.resize((MAESTRO, MAESTRO), Image.LANCZOS), dtype=np.float32)


def tiles(tipo: str) -> list[np.ndarray]:
    tex = np.asarray(Image.open(ORIGEN / f"textura-{tipo}.png").convert("RGB"), dtype=np.float32)
    periodo = periodo_filas(tex) if tipo == "tierra" else None
    # Con surcos, el lado del recorte es un número entero de surcos y todas las variantes
    # empiezan en la misma fase: así las filas casan al repetir y entre variantes.
    lado = round(periodo * round(RECORTE / periodo)) if periodo else RECORTE
    paso = round(periodo) if periodo else 1
    util = tex.shape[0] - 2 * MARGEN - lado
    x0 = y0 = MARGEN
    sitios = [(x0, y0), (x0 + util, y0), (x0, y0 + util), (x0 + util // 2, y0 + util)]
    sitios = [(x, y0 + round((y - y0) / paso) * paso if periodo else y) for x, y in sitios]
    recortes = [tex[y : y + lado, x : x + lado] for x, y in sitios]
    base = repetible(recortes[0])
    borde = mascara(lado, 0.22)
    salida = [base]
    for r in recortes[1:]:
        interior = igualar(repetible(r), base)
        salida.append(base * (1 - borde) + interior * borde)
    return [a_maestro(v) for v in salida]


SATURACION_MAX = 0.42  # biblia §4: el terreno, por debajo del 45 % (HSV) de media
# El agua de la paleta (#B5D2D3, #6F9CA6) es mucho más apagada que lo que pinta el modelo.
SATURACION_TIPO = {"agua": 0.25}


def contener_saturacion(maestros: list[np.ndarray], tope: float) -> list[np.ndarray]:
    """Si la saturación media supera el tope, acerca el color a su gris (misma luminancia)."""
    todo = np.concatenate(maestros, axis=1)
    mx, mn = todo.max(axis=2), todo.min(axis=2)
    sat = float(np.mean((mx - mn) / np.maximum(mx, 1)))
    if sat <= tope:
        return maestros
    k = tope / sat
    gris = [(m @ np.array([0.299, 0.587, 0.114], dtype=np.float32))[..., None] for m in maestros]
    return [g + (m - g) * k for m, g in zip(maestros, gris)]


def guardar_tiles(tipo: str, maestros: list[np.ndarray]) -> None:
    TERRENO.mkdir(parents=True, exist_ok=True)
    maestros = contener_saturacion(maestros, SATURACION_TIPO.get(tipo, SATURACION_MAX))
    tira = Image.fromarray(np.concatenate(maestros, axis=1).astype(np.uint8))
    for k in (1, 2):
        lado = 32 * k
        hoja = tira.resize((lado * len(maestros), lado), Image.LANCZOS)
        hoja.save(TERRENO / f"tile-{tipo}@{k}x.webp", quality=85, method=6)
    # Mosaico de revisión: 8 × 8 casillas @2x con variantes al azar (semilla fija).
    rnd = random.Random(7)
    lado = 64
    peq = [Image.fromarray(m.astype(np.uint8)).resize((lado, lado), Image.LANCZOS) for m in maestros]
    mos = Image.new("RGB", (lado * 8, lado * 8))
    for fy in range(8):
        for fx in range(8):
            mos.paste(rnd.choice(peq), (fx * lado, fy * lado))
    mos.save(ORIGEN / f"mosaico-{tipo}.png")


def quitar_fondo(img: Image.Image) -> Image.Image:
    """Separa el objeto del papel. El fondo es lo claro y poco saturado (papel crema y los rayos
    de luz amarillentos que el modelo añade aunque se le pida que no) conectado con el borde de la
    imagen: se rellena desde las esquinas, así lo claro de dentro del objeto (luces de la roca)
    no se borra porque la línea sepia lo encierra."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    sat = (a.max(axis=2) - a.min(axis=2)) / np.maximum(a.max(axis=2), 1)
    candidato = (lum > 205) & (sat < 0.32)
    m = Image.fromarray((candidato * 255).astype(np.uint8)).copy()  # copia: fromarray es de solo lectura
    for esquina in ((0, 0), (m.width - 1, 0), (0, m.height - 1), (m.width - 1, m.height - 1)):
        if m.getpixel(esquina) == 255:
            ImageDraw.floodfill(m, esquina, 128)
    fondo = np.asarray(m) == 128
    alfa = Image.fromarray(((~fondo) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    alfa = alfa.filter(ImageFilter.GaussianBlur(1.0))
    rgba = img.convert("RGBA")
    rgba.putalpha(alfa)
    return rgba


def sombra_contacto(w: int, h: int, ancho: float, cy: float) -> Image.Image:
    """Elipse de la biblia §3: #5A5470 al 35 %, achatada 2:1, borde suave."""
    s = 4
    capa = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    rx, ry = ancho * s / 2, ancho * s / 4
    d.ellipse((w * s / 2 - rx, cy * s - ry, w * s / 2 + rx, cy * s + ry), fill=(90, 84, 112, 89))
    return capa.filter(ImageFilter.GaussianBlur(ry * 0.35)).resize((w, h), Image.LANCZOS)


def guardar_objeto(tipo: str) -> None:
    OBJETOS.mkdir(parents=True, exist_ok=True)
    obj = quitar_fondo(Image.open(ORIGEN / f"objeto-{tipo}.png"))
    caja = obj.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    obj = obj.crop(caja)
    ancho, alto = MARCOS[tipo]
    for k in (1, 2):
        w, h = ancho * k, alto * k
        esc = min(w / obj.width, (h - 2 * k) / obj.height)
        peq = obj.resize((round(obj.width * esc), round(obj.height * esc)), Image.LANCZOS)
        # Pivote abajo al centro: la base del objeto toca el borde inferior menos 2 px @1x.
        base = h - 2 * k
        marco = sombra_contacto(w, h, peq.width * 0.7, base - 1.5 * k)
        marco.alpha_composite(peq, ((w - peq.width) // 2, base - peq.height))
        marco.save(OBJETOS / f"{tipo}@{k}x.webp", quality=90, method=6)


def main() -> None:
    for tipo in ("hierba", "tierra", "agua", "camino"):
        guardar_tiles(tipo, tiles(tipo))
    for tipo in MARCOS:
        guardar_objeto(tipo)


if __name__ == "__main__":
    main()
