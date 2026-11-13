"""Marcas de zona (M4) y casillas de vista previa de colocación, en estilo B.

Uso: python assets-src/zonas/zonas.py
Escribe en `public/assets/zonas/`:

- `zona-<tipo>@1x.webp` y `@2x` para tipo en cultivo, huerto, vivienda, almacen: una tira de
  8 casillas (32 px @1x): 4 variantes de relleno y 4 bordes (arriba, derecha, abajo, izquierda).
- `colocacion@1x.webp` y `@2x`: 2 casillas, válida e inválida (vista previa de colocación).

y en `assets-src/zonas/muestras/` un mosaico de cada zona para revisar costuras.

Diseño (ver la ficha `assets-src/fichas/zonas.md`): la zona no sustituye al terreno, se pinta
encima. Cada casilla lleva un lavado semitransparente del color de la zona con grano de papel y
una trama a plumilla propia de la zona (rayas, puntos, diagonales, cuadrícula), y en el perímetro
de la zona se acumula el pigmento en un borde más oscuro, como el filo de una mancha de acuarela.
La trama distingue las zonas sin depender del color (daltonismo, pantallas pequeñas).

Todo es periódico con periodo de 1 casilla (128 px @4x): el relleno repite sin costuras y los
bordes de casillas vecinas continúan. Semilla fija: regenerar da la misma imagen.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "public/assets/zonas"
MUESTRAS = RAIZ / "assets-src/zonas/muestras"
N = 128  # px por casilla @4x (biblia §1)
SEMILLA = 4101


def hexrgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


# tipo -> (lavado, tinta de la trama y el borde, trama)
ZONAS = {
    "cultivo": ("#D2A548", "#7F6026", "surcos"),  # trigo: rayas horizontales
    "huerto": ("#B25A86", "#6A3153", "puntos"),  # fruta: puntos al tresbolillo
    "vivienda": ("#C0603F", "#7E3A26", "diagonal"),  # tejado: diagonales
    "almacen": ("#5F8FA8", "#3B5E74", "cuadricula"),  # cajas: cuadrícula
}
ALFA_LAVADO = 0.30
ALFA_TRAMA = 0.42
ALFA_BORDE = 0.85


def ruido_periodico(rnd: np.random.Generator, n: int, escala: float) -> np.ndarray:
    """Ruido suave y periódico (repite cada n px) filtrando ruido blanco en frecuencia."""
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    filtro = np.exp(-(fx**2 + fy**2) * (escala**2))
    r = np.real(np.fft.ifft2(np.fft.fft2(rnd.standard_normal((n, n))) * filtro))
    return (r - r.mean()) / (r.std() + 1e-6)


def suavizar(m: np.ndarray, sigma: float) -> np.ndarray:
    n = m.shape[0]
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    g = np.exp(-2 * (np.pi**2) * (fx**2 + fy**2) * sigma**2)
    return np.real(np.fft.ifft2(np.fft.fft2(m) * g))


def trama(tipo: str, rnd: np.random.Generator) -> np.ndarray:
    """Máscara 0..1 de la trama, periódica en 128 px, con trazo tembloroso de plumilla."""
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    # temblor periódico (periodos divisores de N) para que la línea no sea de regla
    temblor_y = 1.6 * np.sin(2 * np.pi * 2 * xx / N + rnd.uniform(0, 6)) + 0.8 * np.sin(2 * np.pi * 5 * xx / N + rnd.uniform(0, 6))
    temblor_x = 1.6 * np.sin(2 * np.pi * 2 * yy / N + rnd.uniform(0, 6)) + 0.8 * np.sin(2 * np.pi * 5 * yy / N + rnd.uniform(0, 6))
    grosor = 3.2
    periodo = N / 2  # 2 trazos por casilla: a @1x quedan a 16 px, nada de alta frecuencia (biblia §7.5)

    def linea(d):
        d = np.abs(((d + periodo / 2) % periodo) - periodo / 2)
        return np.clip(1 - (d - grosor / 2) / 1.2, 0, 1)

    if tipo == "surcos":
        m = linea(yy + temblor_y - periodo / 4)
    elif tipo == "diagonal":
        m = linea(xx + yy + temblor_y - periodo / 4)  # x + y con periodo 64: periódico en 128
    elif tipo == "cuadricula":
        m = np.maximum(linea(yy + temblor_y - periodo / 4), linea(xx + temblor_x - periodo / 4))
    elif tipo == "puntos":
        m = np.zeros((N, N), dtype=np.float32)
        r = 7.5
        centros = [(32, 32), (96, 32), (0, 96), (64, 96), (128, 96)]  # tresbolillo, 2 filas
        for cx, cy in centros:
            for ox in (-N, 0, N):
                for oy in (-N, 0, N):
                    d = np.hypot(xx - cx - ox, yy - cy - oy)
                    m = np.maximum(m, np.clip(1 - (d - r) / 1.5, 0, 1))
    else:
        raise ValueError(tipo)
    # la tinta no es uniforme: se interrumpe y carga según un ruido suave
    carga = np.clip(0.75 + 0.35 * ruido_periodico(rnd, N, 18), 0.25, 1)
    return np.clip(m * carga, 0, 1)


def relleno(tipo: str, variante: int) -> np.ndarray:
    lavado, tinta, patron = ZONAS[tipo]
    rnd = np.random.default_rng(SEMILLA + 17 * variante + hash(tipo) % 1000)
    # lavado: mancha con variaciones suaves de densidad y grano de papel
    densidad = 1 + 0.18 * ruido_periodico(rnd, N, 22) + 0.06 * ruido_periodico(rnd, N, 3)
    a_lav = np.clip(ALFA_LAVADO * densidad, 0, 1)
    rnd_t = np.random.default_rng(SEMILLA + hash(tipo) % 1000)  # trama igual en las variantes
    m = trama(patron, rnd_t)
    a_tr = ALFA_TRAMA * m * (1.5 if patron == "puntos" else 1.0)
    return componer([(hexrgb(lavado), a_lav), (hexrgb(tinta), a_tr)])


def borde(tipo: str) -> np.ndarray:
    """Borde superior: pigmento acumulado en el filo (como el borde de una mancha que se seca)."""
    lavado, tinta, _ = ZONAS[tipo]
    rnd = np.random.default_rng(SEMILLA + 999 + hash(tipo) % 1000)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    ondula = 2.0 * np.sin(2 * np.pi * 1 * xx / N + rnd.uniform(0, 6)) + 1.2 * np.sin(2 * np.pi * 3 * xx / N + rnd.uniform(0, 6))
    filo = 9 + ondula  # px @4x: unos 2,3 px @1x (biblia §7.3: nada por debajo de 2 px)
    linea = np.clip((filo - yy) / 2.0 + 0.5, 0, 1)
    halo = np.exp(-np.maximum(yy - filo, 0) / 10) * (yy > filo - 1)  # el lavado se oscurece cerca del filo
    carga = np.clip(0.85 + 0.2 * ruido_periodico(rnd, N, 14), 0.5, 1)
    a_linea = ALFA_BORDE * linea * carga
    a_halo = 0.28 * halo
    return componer([(hexrgb(lavado), a_halo), (hexrgb(tinta), a_linea)])


def componer(capas) -> np.ndarray:
    """Capas (color, alfa) una encima de otra en modo normal → RGBA premultiplicado a recto."""
    rgb = np.zeros((N, N, 3), dtype=np.float32)
    a = np.zeros((N, N), dtype=np.float32)
    for color, alfa in capas:
        alfa = np.broadcast_to(alfa, (N, N))
        rgb = color * alfa[..., None] + rgb * (1 - alfa[..., None])
        a = alfa + a * (1 - alfa)
    rgb = rgb / np.maximum(a, 1e-6)[..., None]
    return np.dstack([rgb, a])


def a_imagen(arr: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")


def colocacion() -> list[np.ndarray]:
    """Casilla válida (crema con filo salvia) e inválida (terracota con diagonales)."""
    rnd = np.random.default_rng(SEMILLA + 5)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d_borde = np.minimum.reduce([yy, xx, N - 1 - yy, N - 1 - xx])
    marco = np.clip((10 - d_borde) / 2 + 0.5, 0, 1)
    grano = 1 + 0.1 * ruido_periodico(rnd, N, 4)
    valida = componer([(hexrgb("#FBF6E6"), np.clip(0.38 * grano, 0, 1)), (hexrgb("#55703F"), 0.9 * marco)])
    diag = np.abs(((xx + yy + 16) % 32) - 16)
    rayas = np.clip(1 - (diag - 2.5) / 1.2, 0, 1)
    invalida = componer([
        (hexrgb("#B4483C"), np.clip(0.42 * grano, 0, 1)),
        (hexrgb("#7A2A22"), 0.45 * rayas),
        (hexrgb("#7A2A22"), 0.9 * marco),
    ])
    return [valida, invalida]


def guardar_tira(casillas: list[np.ndarray], nombre: str) -> None:
    maestro = Image.new("RGBA", (N * len(casillas), N))
    for i, c in enumerate(casillas):
        maestro.paste(a_imagen(c), (i * N, 0))
    for k in (1, 2):
        lado = 32 * k
        maestro.resize((lado * len(casillas), lado), Image.LANCZOS).save(
            SALIDA / f"{nombre}@{k}x.webp", quality=85, alpha_quality=100, method=6
        )


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    MUESTRAS.mkdir(parents=True, exist_ok=True)
    for tipo in ZONAS:
        rellenos = [relleno(tipo, v) for v in range(4)]
        b = borde(tipo)
        bordes = [np.rot90(b, -k) for k in range(4)]  # arriba, derecha, abajo, izquierda
        guardar_tira(rellenos + bordes, f"zona-{tipo}")
        print("zona", tipo)
    guardar_tira(colocacion(), "colocacion")
    print("colocacion")


if __name__ == "__main__":
    main()
