"""Encola workflows en el ComfyUI local, espera y descarga las imágenes.

Uso:
  python assets-src/prototipo/comfy/lanzar.py <destino> <workflow.json>...   # encola y descarga
  python assets-src/prototipo/comfy/lanzar.py <destino> --ids <id>...        # solo descarga
Las imágenes se guardan como <destino>/<nombre-del-json>.png (o <nombre>-<n>.png si hay varias).
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:8188"


def encolar(ruta: Path) -> str:
    wf = json.loads(ruta.read_text(encoding="utf-8"))
    datos = json.dumps({"prompt": wf}).encode()
    req = urllib.request.Request(f"{URL}/prompt", data=datos, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["prompt_id"]


def esperar(pid: str, tope: float = 3600) -> dict:
    inicio = time.time()
    while time.time() - inicio < tope:
        h = json.load(urllib.request.urlopen(f"{URL}/history/{pid}"))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("completed") or st.get("status_str") == "error":
                return h[pid]
        time.sleep(3)
    raise TimeoutError(pid)


def descargar(entrada: dict, destino: Path, nombre: str) -> list[Path]:
    imgs = [i for o in entrada["outputs"].values() for i in o.get("images", []) if i.get("type") == "output"]
    rutas = []
    for n, img in enumerate(imgs):
        q = urllib.parse.urlencode({k: img[k] for k in ("filename", "subfolder", "type")})
        sufijo = "" if len(imgs) == 1 else f"-{n}"
        r = destino / f"{nombre}{sufijo}.png"
        r.write_bytes(urllib.request.urlopen(f"{URL}/view?{q}").read())
        rutas.append(r)
    return rutas


def main() -> None:
    destino = Path(sys.argv[1])
    destino.mkdir(parents=True, exist_ok=True)
    args = sys.argv[2:]
    if args and args[0] == "--ids":
        trabajos = [(pid, pid) for pid in args[1:]]
    else:
        trabajos = [(Path(a).stem, encolar(Path(a))) for a in args]
    for nombre, pid in trabajos:
        t0 = time.time()
        e = esperar(pid)
        if e.get("status", {}).get("status_str") == "error":
            print(f"ERROR {nombre}: {json.dumps(e['status'])[:400]}")
            continue
        for r in descargar(e, destino, nombre):
            print(f"{r}  ({time.time() - t0:.0f}s de espera)")


if __name__ == "__main__":
    main()
