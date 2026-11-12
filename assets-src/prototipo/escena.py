"""Escena estática y animación de muestra del prototipo de arte (fase 5, PARADA 2).

Uso: python assets-src/prototipo/escena.py
Lee solo las entregas de `public/assets/` (como las leería el juego) y escribe en
`assets-src/prototipo/muestra/`:

- `escena@1x.png` y `escena@2x.png`: un trozo de valle de 14 × 10 casillas con los cuatro
  terrenos, árboles, rocas y el protagonista en reposo.
- `caminar@1x.gif` y `caminar@2x.gif`: el protagonista recorre un cuadrado por la escena
  caminando en las cuatro direcciones (la izquierda es la derecha en espejo, como `flipX`).
- `caminar-zoom.gif`: el @2x ampliado ×2 sin suavizar, para ver el detalle.

La disposición es fija (semilla 11): regenerar da la misma imagen.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
ASSETS = RAIZ / "public/assets"
SALIDA = RAIZ / "assets-src/prototipo/muestra"
ANCHO, ALTO = 14, 10  # casillas
FPS_CAMINAR = 10
PASO = 0.14  # casillas por fotograma a 10 fps ≈ 1,4 casillas/s (biblia §10)


def terreno_en(x: int, y: int) -> str:
    if 9 <= x <= 10:
        return "agua"  # arroyo vertical
    if y == 6 and x < 9 or x == 6 and y > 6:
        return "camino"
    if 1 <= x <= 5 and 1 <= y <= 4:
        return "tierra"
    return "hierba"


def tiles(k: int) -> dict[str, list[Image.Image]]:
    lado = 32 * k
    res = {}
    for t in ("hierba", "tierra", "agua", "camino"):
        hoja = Image.open(ASSETS / f"terreno/tile-{t}@{k}x.webp").convert("RGBA")
        res[t] = [hoja.crop((i * lado, 0, (i + 1) * lado, lado)) for i in range(hoja.width // lado)]
    return res


def fondo(k: int) -> Image.Image:
    lado = 32 * k
    rnd = random.Random(11)
    ts = tiles(k)
    img = Image.new("RGBA", (ANCHO * lado, ALTO * lado))
    for y in range(ALTO):
        for x in range(ANCHO):
            img.alpha_composite(rnd.choice(ts[terreno_en(x, y)]), (x * lado, y * lado))
    objetos = [("arbol", 12, 3), ("arbol", 13, 8), ("arbol", 1, 8), ("roca", 8, 2), ("roca", 3, 9), ("roca", 12, 5)]
    # Orden de pintado por la fila del pivote: lo de abajo tapa a lo de arriba.
    for nombre, cx, cy in sorted(objetos, key=lambda o: o[2]):
        o = Image.open(ASSETS / f"objetos/{nombre}@{k}x.webp").convert("RGBA")
        img.alpha_composite(o, (round((cx + 0.5) * lado - o.width / 2), (cy + 1) * lado - o.height))
    return img


class Hoja:
    def __init__(self, k: int):
        base = ASSETS / f"protagonista/protagonista@{k}x"
        self.img = Image.open(f"{base}.webp").convert("RGBA")
        self.marcos = json.loads(Path(f"{base}.json").read_text(encoding="utf-8"))["frames"]
        self.k = k

    def marco(self, anim: str, direccion: str, n: int) -> Image.Image:
        espejo = direccion == "izquierda"
        f = self.marcos[f"{anim}-{'derecha' if espejo else direccion}-{n}"]["frame"]
        m = self.img.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        return m.transpose(Image.FLIP_LEFT_RIGHT) if espejo else m

    def pegar(self, lienzo: Image.Image, m: Image.Image, x: float, y: float) -> None:
        # (x, y) en casillas es el punto del suelo bajo los pies: pivote (24, 58) @1x.
        lado = 32 * self.k
        lienzo.alpha_composite(m, (round(x * lado - 24 * self.k), round(y * lado - 58 * self.k)))


def recorrido() -> list[tuple[str, str, float, float, int]]:
    """Un cuadrado por la hierba y el camino: abajo, derecha, arriba, izquierda, con una pausa en
    reposo al principio."""
    pasos = []
    x, y = 2.5, 5.6
    for n in range(8):
        pasos.append(("reposo", "abajo", x, y, n % 4))
    for direccion, dx, dy, tramos in (("abajo", 0, 1, 16), ("derecha", 1, 0, 32), ("arriba", 0, -1, 16), ("izquierda", -1, 0, 32)):
        for n in range(tramos):
            x, y = x + dx * PASO, y + dy * PASO
            pasos.append(("caminar", direccion, x, y, n % 8))
    return pasos


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    for k in (1, 2):
        base = fondo(k)
        hoja = Hoja(k)
        quieto = base.copy()
        hoja.pegar(quieto, hoja.marco("reposo", "abajo", 0), 7.5, 7.8)
        quieto.convert("RGB").save(SALIDA / f"escena@{k}x.png")
        # La animación se recorta a la zona del paseo (9 × 6 casillas) y usa una sola paleta para
        # todo el GIF: así pesa poco y no parpadean los colores entre fotogramas.
        lado = 32 * k
        caja = (0, 4 * lado, 9 * lado, 10 * lado)
        cuadros = []
        for anim, direccion, x, y, n in recorrido():
            c = base.copy()
            hoja.pegar(c, hoja.marco(anim, direccion, n), x, y)
            cuadros.append(c.crop(caja).convert("RGB"))
        dur = [int(1000 / (6 if a == "reposo" else FPS_CAMINAR)) for a, *_ in recorrido()]
        guardar_gif(cuadros, dur, SALIDA / f"caminar@{k}x.gif")
        if k == 2:  # el @2x ampliado ×2 sin suavizar, para ver el detalle
            zoom = [c.resize((c.width * 2, c.height * 2), Image.NEAREST) for c in cuadros]
            guardar_gif(zoom, dur, SALIDA / "caminar-zoom.gif")


def guardar_gif(cuadros: list[Image.Image], dur: list[int], ruta: Path) -> None:
    paleta = cuadros[len(cuadros) // 2].quantize(255, method=Image.Quantize.MEDIANCUT)
    q = [c.quantize(palette=paleta, dither=Image.Dither.NONE) for c in cuadros]
    q[0].save(ruta, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=True)

if __name__ == "__main__":
    main()
