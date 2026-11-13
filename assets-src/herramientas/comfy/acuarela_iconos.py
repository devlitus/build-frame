"""Pasada de acuarela img2img sobre la tira de iconos de M5 (mismo grafo que los edificios de M4).

Uso:
  python assets-src/herramientas/comfy/acuarela_iconos.py <dir-preparado> <dir-salida>
         [--denoise 0.45] [--fuerza 0.8] [--semilla 8301]
"""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / "assets-src/edificios/comfy"))
import acuarela_edificios as ae  # noqa: E402
from workflows import ESTILOS  # noqa: E402


def prompt(nombre: str) -> str:
    if nombre == "sobre":
        return (
            f"A single inventory icon for a cozy farming game, {ESTILOS['b']}, lit from the left: a "
            f"blank paper seed packet with a terracotta folded top flap and a plain cream front. "
            f"Hand-painted with visible brush texture and soft pigment pooling. "
            f"Plain flat warm cream background, no shadow, no text."
        )
    # El de la PARADA 1, tal cual: regenerar con él da los iconos aprobados.
    return (
        f"A row of seven separate inventory icons for a cozy farming game, {ESTILOS['b']}, lit from "
        f"the left: a garden hoe with a wooden handle, a green metal watering can, a paper seed "
        f"packet, an open hand, a wood axe, a pickaxe, and a small tree sapling with its root ball "
        f"wrapped in burlap. Hand-painted with visible brush texture and soft pigment pooling. "
        f"Plain flat warm cream background, no shadow, no text."
    )


ae.prompt = prompt

if __name__ == "__main__":
    if "--semilla" not in sys.argv:
        sys.argv += ["--semilla", "8301"]
    if "--denoise" not in sys.argv:
        sys.argv += ["--denoise", "0.45"]
    ae.main()
