"""Escenas de muestra del arte de M4 sobre el valle (PARADA 1 y PARADA 2).

Uso: python assets-src/edificios/escena.py [parada1|parada2]
Lee solo entregas de `public/assets/` (como las leería el juego) y escribe en
`assets-src/edificios/muestra/<escena>@1x.png`, `@2x.png` y `<escena>-movil.png` (recorte de
412 × 915 px CSS a DPR 2 con zoom 1, la prueba de legibilidad de la biblia §7.6).

Orden de dibujo (el mismo que necesita M5-00): terreno → zonas (relleno y bordes) → casillas
de colocación → sombras y objetos por la fila de su borde frontal (lo de abajo tapa a lo de
arriba) → personaje en el mismo orden.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
ASSETS = RAIZ / "public/assets"
SALIDA = RAIZ / "assets-src/edificios/muestra"
# Marco de cada edificio (casillas) relativo a la esquina frontal izquierda de la huella;
# copia de MARCOS en blender/edificios.py: (u0, v0) es el desplazamiento de la esquina inferior
# izquierda del sprite.
ANCLA = {"casa": (-0.5, -0.5), "cobertizo": (-0.5, -0.5), "caja": (-0.5, -0.5)}

# Huellas (ancho × alto en casillas) de data/edificios.json (M4-02).
HUELLAS = {"casa": (4, 3), "cobertizo": (3, 2), "caja": (1, 1)}

# Coordenadas en casillas; los edificios, como en M4: (x, y) = esquina superior izquierda.
ESCENAS = {
    "parada1": dict(
        tam=(18, 12),
        zonas=[("vivienda", 1, 1, 6, 5), ("vivienda", 10, 1, 15, 5), ("cultivo", 1, 9, 6, 11),
               ("huerto", 8, 9, 10, 11), ("almacen", 12, 9, 15, 11)],
        tierra=[(2, 10, 5, 10)],
        camino=[(0, 7, 17, 7)],
        agua=[],
        edificios=[("casa-terminado", 2, 2), ("casa-obra", 11, 2)],
        arboles=[(8, 3), (17, 1), (16.5, 10)],
        rocas=[(7, 11)],
        protagonista=(8.5, 7.7),
        colocacion=[],
    ),
    "parada2": dict(
        tam=(18, 13),
        zonas=[("vivienda", 1, 1, 7, 5), ("almacen", 10, 1, 14, 4), ("cultivo", 1, 9, 5, 12),
               ("huerto", 7, 9, 9, 12), ("almacen", 11, 9, 15, 12)],
        tierra=[(2, 10, 4, 11)],
        camino=[(0, 7, 16, 7), (8, 0, 8, 6)],
        agua=[(17, 0, 17, 12)],
        edificios=[("casa-terminado", 2, 2), ("caja-terminado", 7, 4), ("cobertizo-terminado", 11, 2),
                   ("cobertizo-obra", 12, 10)],
        arboles=[(16, 3), (10, 12), (0, 7.5)],
        rocas=[(6, 12), (15, 6)],
        protagonista=(9.5, 7.7),
        colocacion=[],
    ),
}


def recortes(ruta: Path, lado: int) -> list[Image.Image]:
    hoja = Image.open(ruta).convert("RGBA")
    return [hoja.crop((i * lado, 0, (i + 1) * lado, lado)) for i in range(hoja.width // lado)]


def dentro(rects, x, y):
    return any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in rects)


def pintar(nombre: str, k: int) -> Image.Image:
    e = ESCENAS[nombre]
    lado = 32 * k
    ancho, alto = e["tam"]
    rnd = random.Random(23)
    t = {n: recortes(ASSETS / f"terreno/tile-{n}@{k}x.webp", lado) for n in ("hierba", "tierra", "agua", "camino")}
    img = Image.new("RGBA", (ancho * lado, alto * lado))
    for y in range(alto):
        for x in range(ancho):
            tipo = ("agua" if dentro(e["agua"], x, y) else "camino" if dentro(e["camino"], x, y)
                    else "tierra" if dentro(e["tierra"], x, y) else "hierba")
            img.alpha_composite(rnd.choice(t[tipo]), (x * lado, y * lado))
    # Zonas: relleno en cada casilla y un borde por cada lado que no linda con la misma zona.
    for tipo, x0, y0, x1, y1 in e["zonas"]:
        z = recortes(ASSETS / f"zonas/zona-{tipo}@{k}x.webp", lado)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                p = (x * lado, y * lado)
                img.alpha_composite(rnd.choice(z[:4]), p)
                if y == y0:
                    img.alpha_composite(z[4], p)
                if x == x1:
                    img.alpha_composite(z[5], p)
                if y == y1:
                    img.alpha_composite(z[6], p)
                if x == x0:
                    img.alpha_composite(z[7], p)
    if e["colocacion"]:
        c = recortes(ASSETS / f"zonas/colocacion@{k}x.webp", lado)
        for valida, x0, y0, x1, y1 in e["colocacion"]:
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    img.alpha_composite(c[0 if valida else 1], (x * lado, y * lado))
    # Objetos y personaje ordenados por la fila de su borde frontal.
    cosas = []
    for nombre_ed, x, y in e["edificios"]:
        yf = y + HUELLAS[nombre_ed.split("-")[0]][1]  # borde frontal de la huella
        s = Image.open(ASSETS / f"edificios/{nombre_ed}@{k}x.webp").convert("RGBA")
        u0, v0 = ANCLA[nombre_ed.split("-")[0]]
        cosas.append((yf, s, (round((x + u0) * lado), round((yf - v0) * lado) - s.height)))
    for nombre_o, lista in (("arbol", e["arboles"]), ("roca", e["rocas"])):
        o = Image.open(ASSETS / f"objetos/{nombre_o}@{k}x.webp").convert("RGBA")
        for cx, cy in lista:
            cosas.append((cy + 1, o, (round((cx + 0.5) * lado - o.width / 2), round((cy + 1) * lado - o.height))))
    base = ASSETS / f"protagonista/protagonista@{k}x"
    hoja = Image.open(f"{base}.webp").convert("RGBA")
    f = json.loads(Path(f"{base}.json").read_text(encoding="utf-8"))["frames"]["reposo-abajo-0"]["frame"]
    pj = hoja.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    px, py = e["protagonista"]
    cosas.append((py, pj, (round(px * lado - 24 * k), round(py * lado - 58 * k))))
    for _, s, pos in sorted(cosas, key=lambda c: c[0]):
        img.alpha_composite(s, pos)
    return img


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    nombres = sys.argv[1:] or list(ESCENAS)
    for n in nombres:
        for k in (1, 2):
            pintar(n, k).convert("RGB").save(SALIDA / f"{n}@{k}x.png")
        print(n)


if __name__ == "__main__":
    main()
