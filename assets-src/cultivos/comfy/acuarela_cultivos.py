"""Pasada de acuarela img2img sobre las tiras de cultivos (mismo flujo que los edificios de M4).

Uso:
  python assets-src/cultivos/comfy/acuarela_cultivos.py <dir-preparado> <dir-salida>
         [--denoise 0.5] [--fuerza 0.8] [--semilla 8201] [--solo patata ...] [--ids ...]

Reutiliza el grafo de `edificios/comfy/acuarela_edificios.py` (Qwen-Image 2512 img2img con el
ControlNet InstantX Union en Canny) y solo cambia el *prompt*. Cada imagen es la tira de las 5
fases de un cultivo (`montaje.py preparar`).
"""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / "assets-src/edificios/comfy"))
import acuarela_edificios as ae  # noqa: E402
from workflows import ESTILOS  # noqa: E402

CULTIVOS = {
    "patata": "a potato plant: a mound of tilled soil, then a sprout, then a leafy bush with small "
    "lilac flowers and two potatoes peeking out of the soil",
    "zanahoria": "a carrot plant: feathery fern-like carrot tops and an orange carrot shoulder "
    "peeking out of the soil",
    "lechuga": "a lettuce plant: a rosette of ruffled light green leaves forming a round head",
    "rabano": "a radish plant: upright green leaves and a round red radish peeking out of the soil",
    "fresa": "a strawberry plant: trifoliate serrated leaves, small white flowers and ripe red "
    "strawberries",
}


def prompt(nombre: str) -> str:
    if nombre == "planton":
        return (
            f"Two separate small game asset sprites for a cozy 2D top-down farming game, "
            f"three-quarter view from above, {ESTILOS['b']}, lit from the left: a freshly planted "
            f"young tree sapling tied to a wooden stake, and the same little tree a bit bigger with a "
            f"round leafy crown. Each sits on a small patch of brown earth. Hand-painted with visible "
            f"brush texture and soft pigment pooling. Plain flat warm cream background, no ground "
            f"plane, no shadow, no text."
        )
    return (
        f"A row of five separate small game asset sprites for a cozy 2D top-down farming game, "
        f"three-quarter view from above, {ESTILOS['b']}, lit from the left. Growth stages of "
        f"{CULTIVOS[nombre]}; the last one is wilted, dry and brown. Each plant sits on a small "
        f"patch of brown earth. Hand-painted with visible brush texture and soft pigment pooling. "
        f"Plain flat warm cream background, no ground plane, no shadow, no text."
    )


ae.prompt = prompt

if __name__ == "__main__":
    if "--semilla" not in sys.argv:
        sys.argv += ["--semilla", "8201"]
    if "--denoise" not in sys.argv:
        sys.argv += ["--denoise", "0.5"]
    ae.main()
