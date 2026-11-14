"""Cultivos de primavera de M5 en cada fase, más el estado marchito, para «Raíces».

Uso (Blender 5.2, sin interfaz):
  blender -b -P assets-src/cultivos/blender/cultivos.py -- --salida <dir> [--guardar <ruta.blend>]
          [--solo patata-3 ...]

Reutiliza materiales, geometría, cámara a 45° y luz de `edificios/blender/edificios.py` (el mismo
método de M4, biblia §2, §3, §5 y §6). 1 casilla = 1 m. La planta crece en el centro de la
casilla x ∈ [0, 1], y ∈ [0, 1]; y = 0 es el borde frontal (sur).

Fases (las mismas para todos los cultivos; el juego reparte los días de crecimiento entre 0 y 2):
  0 sembrado · 1 brote · 2 joven · 3 maduro · 4 marchito

Por cada `<cultivo>-<fase>` escribe `<salida>/<cultivo>-<fase>.png` (planta sola, RGBA) y
`<salida>/<cultivo>-<fase>-sombra.png` (sombra proyectada en el suelo), a 256 px por metro.
Marco: u ∈ [0, 1], v ∈ [0, 1,5] casillas (32 × 48 px @1x); la casilla es el cuadrado inferior.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

RAIZ = Path(__file__).resolve().parents[3]
_src = (RAIZ / "assets-src/edificios/blender/edificios.py").read_text(encoding="utf-8")
exec(compile(_src.rsplit("\nmain()", 1)[0], "edificios.py", "exec"))  # utilidades de M4, sin su main

CULTIVOS = ("patata", "zanahoria", "lechuga", "rabano", "fresa")
FASES = (0, 1, 2, 3, 4)
MARCO = ((0.0, 1.0), (0.0, 1.5))

PALETA = {
    "tierra": (0.47, 0.345, 0.22),  # #785838
    "tierra_osc": (0.337, 0.251, 0.169),  # #56402B
    "tierra_clara": (0.62, 0.48, 0.32),  # tierra removida, seca por encima
    "hoja": (0.42, 0.56, 0.27),  # verde hoja, más saturado que la hierba (biblia §7.4)
    "hoja_clara": (0.58, 0.7, 0.36),
    "hoja_osc": (0.3, 0.44, 0.22),
    "tallo": (0.5, 0.6, 0.3),
    "flor_blanca": (0.96, 0.93, 0.84),
    "flor_lila": (0.78, 0.68, 0.84),
    "corazon": (0.93, 0.78, 0.3),
    "patata": (0.79, 0.64, 0.42),
    "zanahoria": (0.9, 0.5, 0.18),
    "rabano": (0.82, 0.25, 0.32),
    "rabano_blanco": (0.95, 0.9, 0.85),
    "fresa": (0.84, 0.18, 0.2),
    "fresa_verde": (0.7, 0.78, 0.45),
    "semilla": (0.83, 0.72, 0.5),
    "seco": (0.62, 0.5, 0.3),  # marchito: ocre apagado
    "seco_osc": (0.45, 0.35, 0.22),
    "tronco": (0.48, 0.35, 0.24),
    "tutor": (0.69, 0.541, 0.353),  # madera clara #B08A5A
    "cuerda": (0.79, 0.69, 0.44),
}


# --------------------------------------------------------------------------- piezas
def orientar(bm, base, yaw, pitch, giro=0.0):
    """Gira la pieza (construida a lo largo de +X desde el origen) y la lleva a `base`."""
    rot = (
        Matrix.Rotation(math.radians(yaw), 4, "Z")
        @ Matrix.Rotation(math.radians(-pitch), 4, "Y")
        @ Matrix.Rotation(math.radians(giro), 4, "X")
    )
    bmesh.ops.transform(bm, matrix=Matrix.Translation(base) @ rot, verts=bm.verts)
    return bm


def hoja(base, yaw, pitch, largo, ancho, grueso=0.012, curva=0.0):
    """Hoja: elipsoide aplastado a lo largo de +X; `curva` dobla la punta hacia abajo."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.5)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((largo / 2, 0, 0)) @ Matrix.Diagonal((largo, ancho, grueso, 1)), verts=bm.verts)
    if curva:
        for v in bm.verts:
            t = v.co.x / largo
            v.co.z -= curva * largo * t * t
    return orientar(bm, base, yaw, pitch)


def tallo(base, yaw, pitch, largo, r=0.012):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * 0.7, depth=largo)
    # El cono va a lo largo de Z: se sube a z ∈ [0, largo] y se tumba sobre +X (giro de 90° en Y).
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, "Y") @ Matrix.Translation((0, 0, largo / 2)), verts=bm.verts)
    return orientar(bm, base, yaw, pitch)


def bola(x, y, z, r, esc=(1, 1, 1)):
    return esfera(x, y, z, r, esc)


def monticulo(p: Pieza, x=0.5, y=0.5, r=0.2):
    """Montoncito de tierra removida donde se sembró."""
    # Tierra recién removida, más clara que la arada, para que la siembra se lea sobre los surcos.
    p.add(bola(x, y, -0.01, r, (1.0, 0.8, 0.18)), "tierra_clara")
    p.add(bola(x - r * 0.15, y - r * 0.1, 0.015, r * 0.12, (1, 1, 0.5)), "tierra_osc", False)


def roseta(p: Pieza, n, largo, ancho, pitch, mat="hoja", x=0.5, y=0.5, z=0.03, curva=0.25, desfase=0.0, r=None):
    rnd = r or random.Random(n * 7 + int(largo * 100))
    for i in range(n):
        yaw = desfase + i * 360 / n + rnd.uniform(-12, 12)
        k = rnd.uniform(0.85, 1.1)
        p.add(hoja(Vector((x, y, z)), yaw, pitch + rnd.uniform(-8, 8), largo * k, ancho * k, curva=curva), mat)


def brote(p: Pieza, mat="hoja_clara", alto=0.09, hojas=2, largo=0.09):
    p.add(tallo(Vector((0.5, 0.5, 0.02)), 0, 88, alto, 0.01), "tallo", False)
    for i in range(hojas):
        p.add(hoja(Vector((0.5, 0.5, 0.02 + alto)), 90 + i * 180 / max(hojas - 1, 1) * (1 if hojas > 1 else 0), 25, largo, largo * 0.6, curva=0.2), mat)


# --------------------------------------------------------------------------- cultivos
def patata(fase: int, seco: bool = False) -> Pieza:
    p = Pieza()
    v, vc, vo = ("seco", "seco", "seco_osc") if seco else ("hoja", "hoja_clara", "hoja_osc")
    rnd = random.Random(11)
    if fase == 0:
        monticulo(p)
        p.add(bola(0.5, 0.48, 0.05, 0.035, (1.2, 1, 0.8)), "patata")  # trozo de patata de siembra
        return p
    monticulo(p, r=0.18)
    if fase == 1:
        brote(p, alto=0.06, hojas=3, largo=0.09)
        return p
    alto = 0.28 if fase == 2 else 0.42
    tallos = 4 if fase == 2 else 6
    for i in range(tallos):
        yaw = i * 360 / tallos + rnd.uniform(-15, 15)
        incl = 60 if not seco else 28
        p.add(tallo(Vector((0.5, 0.5, 0.03)), yaw, incl, alto, 0.014), "tallo" if not seco else "seco_osc", False)
        punta = Vector((0.5, 0.5, 0.03)) + Vector((math.cos(math.radians(yaw)) * math.cos(math.radians(incl)),
                                                    math.sin(math.radians(yaw)) * math.cos(math.radians(incl)),
                                                    math.sin(math.radians(incl)))) * alto
        for j in range(3):
            p.add(hoja(punta, yaw + (j - 1) * 55, 15 if not seco else -15, 0.13, 0.08, curva=0.3 if not seco else 0.7), (v, vc, vo)[j % 3])
    if fase == 3 and not seco:
        for i in range(4):  # flores lilas con corazón amarillo
            a = math.radians(i * 90 + 30)
            fx, fy = 0.5 + 0.13 * math.cos(a), 0.5 + 0.13 * math.sin(a)
            p.add(bola(fx, fy, alto + 0.05, 0.035, (1, 1, 0.5)), "flor_lila")
            p.add(bola(fx, fy, alto + 0.07, 0.013), "corazon", False)
        for fx, fy in ((0.3, 0.33), (0.68, 0.3)):  # patatas asomando en la tierra
            p.add(bola(fx, fy, 0.03, 0.06, (1.25, 1, 0.8)), "patata")
    return p


def zanahoria(fase: int, seco: bool = False) -> Pieza:
    p = Pieza()
    v = "seco" if seco else "hoja"
    if fase == 0:
        monticulo(p, r=0.16)
        for dx in (-0.05, 0.0, 0.05):
            p.add(bola(0.5 + dx, 0.47, 0.04, 0.012), "semilla", False)
        return p
    monticulo(p, r=0.18)
    if fase == 1:
        brote(p, alto=0.07, hojas=2, largo=0.08)
        return p
    n, largo = (5, 0.24) if fase == 2 else (8, 0.36)
    rnd = random.Random(23)
    for i in range(n):  # hojas plumosas: tallo fino con folíolos
        yaw = i * 360 / n + rnd.uniform(-12, 12)
        incl = (68 if fase == 2 else 62) if not seco else 42
        base = Vector((0.5, 0.5, 0.05))
        p.add(tallo(base, yaw, incl, largo, 0.008), "tallo" if not seco else "seco_osc", False)
        d = Vector((math.cos(math.radians(yaw)) * math.cos(math.radians(incl)), math.sin(math.radians(yaw)) * math.cos(math.radians(incl)), math.sin(math.radians(incl))))
        for k in range(3, 7):
            q = base + d * largo * k / 6
            for lado in (-1, 1):
                p.add(hoja(q, yaw + lado * 60, 20 if not seco else -40, 0.06, 0.03, curva=0.2), v)
    if fase >= 3 and not seco:
        p.add(bola(0.5, 0.5, 0.05, 0.06, (1, 1, 0.9)), "zanahoria")  # hombro naranja asomando
    return p


def lechuga(fase: int, seco: bool = False) -> Pieza:
    p = Pieza()
    if fase == 0:
        monticulo(p, r=0.15)
        p.add(bola(0.5, 0.47, 0.04, 0.012), "semilla", False)
        return p
    monticulo(p, r=0.17)
    if fase == 1:
        brote(p, alto=0.04, hojas=3, largo=0.08)
        return p
    if seco:
        roseta(p, 7, 0.2, 0.15, 15, "seco", curva=0.9)
        roseta(p, 4, 0.12, 0.1, 35, "seco_osc", z=0.05, curva=0.9, desfase=40)
        return p
    if fase == 2:
        roseta(p, 6, 0.2, 0.16, 20, "hoja_clara", curva=0.35)
        roseta(p, 3, 0.11, 0.1, 55, "hoja", z=0.05, desfase=30)
        return p
    # madura: cabeza redonda de hojas onduladas
    roseta(p, 9, 0.27, 0.2, 12, "hoja", curva=0.4)
    roseta(p, 7, 0.2, 0.17, 38, "hoja_clara", z=0.06, curva=0.35, desfase=20)
    p.add(bola(0.5, 0.5, 0.14, 0.11, (1, 1, 0.85)), "hoja_clara")
    roseta(p, 5, 0.12, 0.12, 60, "hoja_clara", z=0.14, curva=0.3, desfase=10)
    return p


def rabano(fase: int, seco: bool = False) -> Pieza:
    p = Pieza()
    if fase == 0:
        monticulo(p, r=0.15)
        for dx in (-0.03, 0.03):
            p.add(bola(0.5 + dx, 0.47, 0.04, 0.013), "semilla", False)
        return p
    monticulo(p, r=0.16)
    if fase == 1:
        brote(p, alto=0.05, hojas=2, largo=0.09)
        return p
    if seco:
        roseta(p, 5, 0.17, 0.08, 25, "seco", curva=1.0, z=0.05)
        return p
    n, largo = (4, 0.17) if fase == 2 else (6, 0.24)
    roseta(p, n, largo, largo * 0.45, 62, "hoja", z=0.06, curva=0.55)
    if fase == 3:
        p.add(bola(0.5, 0.48, 0.05, 0.075, (1, 1, 0.9)), "rabano")  # raíz roja asomando
        p.add(bola(0.5, 0.48, 0.0, 0.03), "rabano_blanco", False)
    return p


def fresa(fase: int, seco: bool = False) -> Pieza:
    p = Pieza()
    if fase == 0:
        monticulo(p, r=0.17)
        p.add(bola(0.5, 0.48, 0.045, 0.03, (1, 1, 0.5)), "hoja_osc")  # esqueje
        return p
    monticulo(p, r=0.2)
    if fase == 1:
        brote(p, alto=0.05, hojas=3, largo=0.08)
        return p
    rnd = random.Random(31)
    n = 4 if fase == 2 else 6
    for i in range(n):  # hojas trifoliadas sobre pecíolos
        yaw = i * 360 / n + rnd.uniform(-10, 10)
        incl = 50 if not seco else 38
        base = Vector((0.5, 0.5, 0.03))
        largo = 0.16 if fase == 2 else 0.2
        p.add(tallo(base, yaw, incl, largo, 0.009), "tallo" if not seco else "seco_osc", False)
        d = Vector((math.cos(math.radians(yaw)) * math.cos(math.radians(incl)), math.sin(math.radians(yaw)) * math.cos(math.radians(incl)), math.sin(math.radians(incl))))
        punta = base + d * largo
        for j in (-1, 0, 1):
            p.add(hoja(punta, yaw + j * 50, 10 if not seco else -40, 0.1, 0.075, curva=0.25), "seco" if seco else ("hoja", "hoja_osc", "hoja")[j + 1])
    if seco:
        return p
    if fase == 2:
        for a in (40, 200):
            r = math.radians(a)
            p.add(bola(0.5 + 0.12 * math.cos(r), 0.5 + 0.12 * math.sin(r), 0.16, 0.03, (1, 1, 0.5)), "flor_blanca")
    else:
        for a, mat in ((-60, "fresa"), (20, "fresa"), (150, "fresa_verde"), (250, "fresa")):  # fresas colgando
            r = math.radians(a)
            fx, fy = 0.5 + 0.2 * math.cos(r), 0.5 + 0.2 * math.sin(r)
            p.add(bola(fx, fy, 0.05, 0.045, (1, 1, 1.2)), mat)
            p.add(bola(fx, fy, 0.105, 0.02, (1.4, 1.4, 0.4)), "hoja_osc", False)
        p.add(bola(0.62, 0.62, 0.18, 0.03, (1, 1, 0.5)), "flor_blanca")
    return p


def planton(fase: int, seco: bool = False) -> Pieza:
    """Plantón de árbol plantado: 0 recién plantado (con su tutor), 1 arbolito."""
    p = Pieza()
    monticulo(p, r=0.2)
    alto, copa = (0.38, 0.09) if fase == 0 else (0.62, 0.17)
    p.add(tallo(Vector((0.5, 0.5, 0.0)), 0, 89, alto, 0.018 if fase == 0 else 0.026), "tronco", False)
    p.add(tallo(Vector((0.5, 0.5, alto * 0.6)), 30, 50, alto * 0.3, 0.01), "tronco", False)
    for x, y, z, r in ((0, 0, 0.0, 1.0), (0.6, -0.1, -0.35, 0.7), (-0.6, 0.1, -0.3, 0.75), (0.2, -0.5, 0.35, 0.6)):
        p.add(bola(0.5 + x * copa, 0.5 + y * copa, alto + z * copa, copa * r, (1, 1, 0.85)), ("hoja", "hoja_clara", "hoja_osc", "hoja")[int(abs(x) * 3) % 4])
    if fase == 0:  # tutor de madera atado
        p.add(tallo(Vector((0.58, 0.55, 0.0)), 0, 87, 0.42, 0.012), "tutor", False)
        p.add(bola(0.54, 0.53, 0.24, 0.035, (1.4, 1, 0.4)), "cuerda", False)
    return p


CONSTRUCTORES_C = {"patata": patata, "zanahoria": zanahoria, "lechuga": lechuga, "rabano": rabano, "fresa": fresa, "planton": planton}
EXTRA = {"planton": (0, 1)}  # objetos que se dibujan como un cultivo pero con sus propias fases


def pieza(cultivo: str, fase: int) -> Pieza:
    # marchito: la planta joven, caída y seca
    return CONSTRUCTORES_C[cultivo](2, seco=True) if fase == 4 else CONSTRUCTORES_C[cultivo](fase)


def suelo_holdout() -> bpy.types.Object:
    """Plano en z = 0 que recorta del render lo que queda bajo tierra (alfa 0), sin verse."""
    m = bpy.data.materials.new("holdout")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    h = nt.nodes.new("ShaderNodeHoldout")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(h.outputs[0], out.inputs[0])
    me = bpy.data.meshes.new("holdout")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("holdout", me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    o.visible_shadow = False
    return o


def encuadrar_c(cam) -> None:
    (u0, u1), (v0, v1) = MARCO
    esc = bpy.context.scene
    ancho_m = u1 - u0
    alto_cam = (v1 - v0) / math.sqrt(2)
    esc.render.resolution_x = round(ancho_m * PX_M)
    esc.render.resolution_y = round(alto_cam * PX_M)
    cam.data.ortho_scale = max(ancho_m, alto_cam)
    a = math.radians(45)
    vista = Vector((0, math.sin(a), -math.cos(a)))
    arriba = Vector((0, math.cos(a), math.sin(a)))
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2 / math.sqrt(2)
    cam.location = Vector((uc, 0, 0)) + vc * arriba - 30 * vista


def main_c() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", required=True)
    ap.add_argument("--guardar")
    ap.add_argument("--solo", nargs="*")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {k: material_npr(k, v) for k, v in PALETA.items()}
    contorno = material_contorno()
    cam, suelo = camara_y_luz()
    encuadrar_c(cam)
    tapa = suelo_holdout()
    cols = {}
    for c, fases in [(c, FASES) for c in CULTIVOS] + list(EXTRA.items()):
        for f in fases:
            nombre = f"{c}-{f}"
            cols[nombre] = montar_pieza(nombre, pieza(c, f), mats, contorno)
    # Contorno más fino que en los edificios: a esta escala 0,018 m empastaba las hojas.
    for col in cols.values():
        for o in col.objects:
            for m in o.modifiers:
                if m.type == "SOLIDIFY":
                    m.thickness = 0.006
    if args.guardar:
        for c in cols.values():
            c.hide_render = True
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.guardar).resolve()))

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    esc = bpy.context.scene
    for nombre, col in cols.items():
        if args.solo and nombre not in args.solo:
            continue
        for otro in cols.values():
            otro.hide_render = otro is not col
        suelo.hide_render, tapa.hide_render = True, False
        for o in col.objects:
            o.visible_camera = True
        esc.render.filepath = str(salida / f"{nombre}.png")
        bpy.ops.render.render(write_still=True)
        suelo.hide_render, tapa.hide_render = False, True
        for o in col.objects:
            o.visible_camera = False
        esc.render.filepath = str(salida / f"{nombre}-sombra.png")
        bpy.ops.render.render(write_still=True)
        for o in col.objects:
            o.visible_camera = True


main_c()
