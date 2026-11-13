"""Herramientas de M5 (azada, regadera, hacha, pico), semillas, mano y plantón, para «Raíces».

Dos usos:
1. Módulo: `modelos.py` define las piezas y lo cargan este script (iconos) y el del protagonista
   (animaciones de uso), así la herramienta del icono es la misma que lleva en la mano.
2. Iconos (Blender 5.2, sin interfaz):
   blender -b -P assets-src/herramientas/blender/herramientas.py -- --salida <dir> [--solo azada ...]
   Escribe `<salida>/<icono>.png` (RGBA, 384 × 384 = 48 × 48 px @1x a @8x).

Los iconos se ven de frente y algo desde arriba (cámara ortográfica a 20° de elevación), con la
herramienta en diagonal de abajo-izquierda a arriba-derecha, como en un inventario. Mismo sol,
material NPR y contorno sepia que el resto (biblia §3, §5 y §6).
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

RAIZ = Path(__file__).resolve().parents[3]
_src = (RAIZ / "assets-src/edificios/blender/edificios.py").read_text(encoding="utf-8")
exec(compile(_src.rsplit("\nmain()", 1)[0], "edificios.py", "exec"))  # material_npr, montar_pieza…
exec(compile((Path(__file__).parent / "modelos.py").read_text(encoding="utf-8"), "modelos.py", "exec"))

ICONOS = ("azada", "regadera", "semillas", "mano", "hacha", "pico", "planton", "sobre")
RES = 384
ELEVACION = 20.0


def camara_icono() -> bpy.types.Object:
    esc = bpy.context.scene
    cam_data = bpy.data.cameras.new("camara-icono")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("camara-icono", cam_data)
    esc.collection.objects.link(cam)
    a = math.radians(90 - ELEVACION)
    cam.rotation_euler = (a, 0, 0)
    vista = Vector((0, math.sin(a), -math.cos(a)))
    cam.location = -20 * vista
    esc.camera = cam

    sol_data = bpy.data.lights.new("sol", "SUN")
    sol_data.color = (1.0, 0.945, 0.84)
    sol_data.angle = math.radians(8)
    sol = bpy.data.objects.new("sol", sol_data)
    esc.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(35), 0, math.radians(-67))
    mundo = bpy.data.worlds.new("mundo")
    mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (*lin((0.725, 0.78, 0.84))[:3], 1)
    mundo.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    esc.world = mundo
    esc.render.engine = "BLENDER_EEVEE"
    esc.render.resolution_x = esc.render.resolution_y = RES
    esc.render.resolution_percentage = 100
    esc.render.film_transparent = True
    esc.render.image_settings.file_format = "PNG"
    esc.render.image_settings.color_mode = "RGBA"
    esc.view_settings.view_transform = "Standard"
    return cam


def encuadrar_icono(cam, col) -> None:
    """Centra la colección en la vista y ajusta la escala con un 12 % de margen."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ Vector(c)) for o in col.objects for c in o.bound_box]
    xs, ys = [p.x for p in pts], [p.y for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    lado = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.12
    cam.data.ortho_scale = lado
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))


POSES = {  # giro (grados) en el plano de la vista: diagonal de inventario, la cabeza arriba a la derecha
    "azada": 45, "hacha": 40, "pico": 40, "regadera": 0, "semillas": 0, "mano": 0, "planton": 0, "sobre": 0,
}


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", required=True)
    ap.add_argument("--solo", nargs="*")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {k: material_npr(k, v) for k, v in PALETA_H.items()}
    contorno = material_contorno()
    cam = camara_icono()
    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    cols = {}
    for nombre in ICONOS:
        col = montar_pieza(nombre, MODELOS[nombre](), mats, contorno)
        for o in col.objects:
            for m in o.modifiers:
                if m.type == "SOLIDIFY":
                    m.thickness = GROSOR_CONTORNO[nombre]
            # Girada en el plano de la vista y echada hacia atrás para quedar de cara a la cámara.
            o.matrix_world = Matrix.Rotation(math.radians(-ELEVACION), 4, "X") @ Matrix.Rotation(math.radians(POSES[nombre]), 4, "Y") @ o.matrix_world
        cols[nombre] = col
    esc = bpy.context.scene
    for nombre, col in cols.items():
        if args.solo and nombre not in args.solo:
            continue
        for otro in cols.values():
            otro.hide_render = otro is not col
        encuadrar_icono(cam, col)
        esc.render.filepath = str(salida / f"{nombre}.png")
        bpy.ops.render.render(write_still=True)


main()
