"""Montaje de los cultivos de M5: estirado 3/4, tira por cultivo, sombra y entregas @1x/@2x.

Uso:
  python assets-src/cultivos/montaje.py preparar <dir-render> <dir-preparado>
      Estira × √2 (biblia §2) cada `<cultivo>-<fase>.png` de Blender y junta las 5 fases de cada
      cultivo en una tira sobre papel crema (`<cultivo>.png`): la acuarela pinta la tira entera
      en una sola pasada y así las fases de un cultivo salen con el mismo pincel. Guarda también
      el alfa (`<cultivo>-alfa.png`) y la máscara de sombra (`<cultivo>-sombra.png`) de la tira.
  python assets-src/cultivos/montaje.py entregar <dir-preparado> <dir-acuarela>
      Recorta la acuarela con el alfa, añade la sombra violeta y escribe el maestro @4x en
      `assets-src/cultivos/maestros/<cultivo>@4x.png` y las entregas
      `public/assets/cultivos/<cultivo>@{1,2}x.webp`: tira de 5 marcos de 32 × 48 px @1x
      (fases 0 sembrado, 1 brote, 2 joven, 3 maduro y 4 marchito; el marchito se deriva de la
      fase 2 pintada, ver `marchito`). El plantón de árbol
      plantado sale en `public/assets/objetos/planton@{1,2}x.webp` (2 marcos: recién plantado y
      arbolito).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "assets-src/edificios"))
from montaje import CREMA, SOMBRA_OPACIDAD, SOMBRA_RGB, estirar, mascara_sombra  # noqa: E402

MAESTROS = RAIZ / "assets-src/cultivos/maestros"
ENTREGA = RAIZ / "public/assets/cultivos"
CULTIVOS = ("patata", "zanahoria", "lechuga", "rabano", "fresa")
FASES = 5
MARCO_8X = (256, 384)  # 32 × 48 @1x


def a_marco(img: Image.Image) -> Image.Image:
    """El render estirado mide 256 × 385: se ajusta al marco exacto conservando el borde inferior
    (la casilla) en su sitio."""
    w, h = MARCO_8X
    out = Image.new(img.mode, (w, h), (0,) * len(img.getbands()))
    out.paste(img, (0, h - img.height))
    return out


def preparar(origen: Path, destino: Path) -> None:
    destino.mkdir(parents=True, exist_ok=True)
    w, h = MARCO_8X
    for c in CULTIVOS:
        tira = Image.new("RGBA", (w * FASES, h), (0, 0, 0, 0))
        sombra = Image.new("L", (w * FASES, h), 0)
        for f in range(FASES):
            tira.paste(a_marco(estirar(Image.open(origen / f"{c}-{f}.png").convert("RGBA"))), (f * w, 0))
            sombra.paste(a_marco(estirar(mascara_sombra(origen / f"{c}-{f}-sombra.png"))), (f * w, 0))
        fondo = Image.new("RGBA", tira.size, CREMA + (255,))
        fondo.alpha_composite(tira)
        fondo.convert("RGB").save(destino / f"{c}.png")
        tira.getchannel("A").save(destino / f"{c}-alfa.png")
        sombra.save(destino / f"{c}-sombra.png")
        print(c, tira.size)
    # El plantón de árbol plantado (2 fases) se pinta igual que un cultivo y se entrega en objetos/.
    if (origen / "planton-0.png").exists():
        tira = Image.new("RGBA", (w * 2, h), (0, 0, 0, 0))
        sombra = Image.new("L", (w * 2, h), 0)
        for f in range(2):
            tira.paste(a_marco(estirar(Image.open(origen / f"planton-{f}.png").convert("RGBA"))), (f * w, 0))
            sombra.paste(a_marco(estirar(mascara_sombra(origen / f"planton-{f}-sombra.png"))), (f * w, 0))
        fondo = Image.new("RGBA", tira.size, CREMA + (255,))
        fondo.alpha_composite(tira)
        fondo.convert("RGB").save(destino / "planton.png")
        tira.getchannel("A").save(destino / "planton-alfa.png")
        sombra.save(destino / "planton-sombra.png")


def componer(pintada: Image.Image, alfa: Image.Image, sombra: Image.Image) -> Image.Image:
    """Como en los edificios, pero con la sombra recogida a la escala de una planta."""
    pintada = pintada.convert("RGB").resize(alfa.size, Image.LANCZOS)
    # Erosión de 2 px a @8x (no 1 como en los edificios): en hojas finas el modelo deja un filo
    # crema más ancho.
    a = np.asarray(alfa.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    s = np.asarray(sombra.filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255 * SOMBRA_OPACIDAD
    cerca = np.asarray(alfa.filter(ImageFilter.GaussianBlur(24)), dtype=np.float32) / 255
    s = s * np.clip(cerca * 4, 0, 1) * (1 - a)
    col = np.asarray(pintada, dtype=np.float32) / 255
    alfa_total = a + s
    rgb = (col * a[..., None] + SOMBRA_RGB * 0.55 * s[..., None]) / np.maximum(alfa_total, 1e-6)[..., None]
    out = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alfa_total, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


SECO = np.array([[0x3E, 0x2C, 0x20], [0x73, 0x59, 0x38], [0x9E, 0x80, 0x4C], [0xC9, 0xAE, 0x7A]], dtype=np.float32)


def marchito(joven: Image.Image) -> Image.Image:
    """Fase 4 a partir de la fase 2 ya pintada: la misma planta en ocres secos y algo caída.

    Pintar el marchito con su propio prompt no era fiable (el modelo añadía fruta, piedras o
    flores); así se reconoce el cultivo y el pincel es el de su tira. La luminancia se lleva a una
    rampa de pardos secos (las líneas sepia siguen oscuras), la planta se aplasta un 12 % en
    vertical sobre su base y se le quita algo de opacidad a la sombra.
    """
    a = np.asarray(joven, dtype=np.float32)
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32) / 255
    t = np.clip((lum - 0.12) / 0.7, 0, 1) * (len(SECO) - 1)
    k = np.clip(t.astype(int), 0, len(SECO) - 2)
    f = (t - k)[..., None]
    seco = SECO[k] * (1 - f) + SECO[k + 1] * f
    # Las sombras violetas (casi transparentes) conservan su color.
    peso = np.clip((a[..., 3:] / 255 - 0.4) / 0.4, 0, 1)
    rgb = a[..., :3] * (1 - peso) + seco * peso
    out = Image.fromarray(np.dstack([rgb, a[..., 3:]]).astype(np.uint8), "RGBA")
    w, h = out.size
    caido = out.resize((w, round(h * 0.88)), Image.LANCZOS)
    lienzo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    lienzo.paste(caido, (0, h - caido.height))
    return lienzo


def entregar(preparado: Path, acuarela: Path) -> None:
    MAESTROS.mkdir(parents=True, exist_ok=True)
    ENTREGA.mkdir(parents=True, exist_ok=True)
    w, h = MARCO_8X
    for i, c in enumerate(CULTIVOS):
        ruta = acuarela / f"{c}.png"
        if not ruta.exists():
            print("falta acuarela:", c)
            continue
        img = componer(Image.open(ruta), Image.open(preparado / f"{c}-alfa.png"), Image.open(preparado / f"{c}-sombra.png"))
        img.paste(marchito(img.crop((2 * w, 0, 3 * w, h))), (4 * w, 0))
        w8, h8 = img.size
        img.resize((w8 // 2, h8 // 2), Image.LANCZOS).save(MAESTROS / f"{c}@4x.png")
        for k in (1, 2):
            img.resize((w8 // 8 * k, h8 // 8 * k), Image.LANCZOS).save(
                ENTREGA / f"{c}@{k}x.webp", quality=90, alpha_quality=100, method=6
            )
        print(c, f"@1x {w8 // 8}×{h8 // 8}")
    if (acuarela / "planton.png").exists():
        img = componer(Image.open(acuarela / "planton.png"), Image.open(preparado / "planton-alfa.png"), Image.open(preparado / "planton-sombra.png"))
        w8, h8 = img.size
        img.resize((w8 // 2, h8 // 2), Image.LANCZOS).save(MAESTROS / "planton@4x.png")
        objetos = RAIZ / "public/assets/objetos"
        for k in (1, 2):
            img.resize((w8 // 8 * k, h8 // 8 * k), Image.LANCZOS).save(objetos / f"planton@{k}x.webp", quality=90, alpha_quality=100, method=6)
        print("planton", f"@1x {w8 // 8}×{h8 // 8}")


if __name__ == "__main__":
    orden, a, b = sys.argv[1:4]
    {"preparar": preparar, "entregar": entregar}[orden](Path(a), Path(b))
