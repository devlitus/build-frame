"""Pasada de acuarela de las animaciones de herramientas (M5): el mismo método del protagonista.

Uso:
  python assets-src/protagonista/comfy/acuarela_herramientas.py <dir-fotogramas> <dir-salida>
         [--solo hacha-derecha-0 ...] [--denoise 0.3] [--semilla 6101]

Reutiliza `prototipo/comfy/acuarela.py` (Qwen-Image 2512 img2img, *denoise* 0,3, ControlNet
InstantX Union en Canny a 0,8, semilla fija 6101 para que los fotogramas se parezcan) y solo
añade al *prompt* que el personaje trabaja con una herramienta.
"""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / "assets-src/prototipo/comfy"))
import acuarela as ac  # noqa: E402
from workflows import ESTILOS, PERSONAJE  # noqa: E402


def prompt() -> str:
    return (
        f"A single small video game character sprite, full body, {ESTILOS['b']}. "
        f"The character: {PERSONAJE}, working the land with a farming tool with a wooden handle "
        f"(a hoe, an axe, a pickaxe or a green watering can). "
        f"Plain flat warm cream background, no shadow, no text."
    )


ac.prompt = prompt

if __name__ == "__main__":
    ac.main()
