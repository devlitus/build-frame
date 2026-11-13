"""Edificios de M4 (casa, cobertizo, caja de envío) terminados y en obra, para «Raíces».

Uso (Blender 5.2, sin interfaz):
  blender -b -P assets-src/edificios/blender/edificios.py -- --salida <dir> [--guardar <ruta.blend>]
          [--solo casa-terminado ...]

Todo se construye por código (reproducible). 1 casilla = 1 m (biblia §1). La huella de cada
edificio ocupa x ∈ [0, ancho], y ∈ [0, fondo] con y = 0 en el borde frontal (sur), que es el que
mira a la cámara.

Cámara de objetos con huella (biblia §2): ortográfica, rotación X = 45°, mirando al norte. El
render sale encogido en vertical × 0,707; `montaje.py` lo estira × √2 para que el suelo vuelva a
ser cuadrado y 1 m de altura mida 1 casilla.

Por cada `<edificio>-<fase>` escribe:
- `<salida>/<edificio>-<fase>.png`: el edificio (RGBA, fondo transparente) a 256 px por metro
  en horizontal (@8x).
- `<salida>/<edificio>-<fase>-sombra.png`: el suelo con la sombra proyectada del edificio (el
  edificio no se ve). `montaje.py` lo convierte en la sombra violeta de la biblia §3.

El marco (en casillas) es el mismo para todas las fases de un edificio, de modo que en el juego
se cambia la textura sin mover el anclaje (ver MARCOS).
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- datos
# Huellas en casillas (ancho × fondo). Las define M4-02 en data/; si cambian, se cambian aquí.
HUELLAS = {"casa": (4, 3), "cobertizo": (3, 2), "caja": (1, 1)}  # aprobadas por la PO (M4-02)
FASES = {
    "casa": ("terminado", "obra", "cimientos"),
    "cobertizo": ("terminado", "obra", "cimientos"),
    "caja": ("terminado", "obra"),
}
# Marco del sprite en casillas, relativo a la esquina frontal izquierda de la huella:
# (u0, u1) en horizontal y (v0, v1) en vertical ya estirado (v = y + z). Margen a la derecha
# y arriba para la sombra, que cae a la derecha y algo hacia arriba (biblia §3).
MARCOS = {
    "casa": ((-0.5, 5.5), (-0.5, 5.5)),
    "cobertizo": ((-0.5, 4.5), (-0.5, 4.5)),
    "caja": ((-0.5, 2.0), (-0.5, 1.5)),
}
PX_M = 256  # px por metro (@8x: 32 px por casilla × 8)

PALETA = {
    "enlucido": (0.929, 0.878, 0.753),  # crema enlucido #EDE0C0
    "piedra": (0.71, 0.67, 0.585),  # gris beis #B5AB95
    "piedra_osc": (0.56, 0.525, 0.463),  # #8F8676
    "madera": (0.541, 0.392, 0.251),  # #8A6440
    "madera_clara": (0.69, 0.541, 0.353),  # madera nueva #B08A5A
    "madera_osc": (0.37, 0.267, 0.188),  # #5E4430
    "teja": (0.706, 0.345, 0.235),  # terracota #B4583C
    "teja_osc": (0.58, 0.27, 0.184),  # #94452F
    "cristal": (0.435, 0.612, 0.651),  # agua honda #6F9CA6
    "postigo": (0.588, 0.612, 0.365),  # salvia #969C5D
    "hierro": (0.37, 0.35, 0.37),  # #5E5A5E
    "cuerda": (0.792, 0.69, 0.443),  # ocre #CAB071
    "papel": (0.961, 0.925, 0.808),  # crema #F5ECCE
    "tierra": (0.47, 0.345, 0.22),  # #785838
    "saco": (0.84, 0.76, 0.58),
}
SEPIA = (0.29, 0.204, 0.149)  # #4A3426


def srgb_a_lineal(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_a_lineal(c) for c in rgb) + (1.0,)


# --------------------------------------------------------------------------- materiales
def material_npr(nombre: str, rgb) -> bpy.types.Material:
    """El mismo sombreado pintado del protagonista (prototipo/blender/protagonista.py, estilo B):
    3 bandas de luz con sombra violeta, granulado de pigmento y oscurecido de bordes."""
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    out = N("ShaderNodeOutputMaterial")
    dif = N("ShaderNodeBsdfDiffuse")
    s2r = N("ShaderNodeShaderToRGB")
    L(dif.outputs[0], s2r.inputs[0])
    bw = N("ShaderNodeRGBToBW")
    L(s2r.outputs[0], bw.inputs[0])
    ramp = N("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    e = ramp.color_ramp.elements
    # Umbrales más bajos que en el personaje: con el sol de la biblia (oeste-suroeste) las caras
    # frontales de los edificios reciben luz rasante y, con los del personaje, quedaban en sombra.
    e[0].position, e[0].color = 0.16, (0, 0, 0, 1)
    e[1].position, e[1].color = 0.42, (1, 1, 1, 1)
    medio = e.new(0.29)
    medio.color = (0.5, 0.5, 0.5, 1)
    L(bw.outputs[0], ramp.inputs[0])

    base = N("ShaderNodeRGB")
    base.outputs[0].default_value = lin(rgb)
    somb = N("ShaderNodeMix")
    somb.data_type = "RGBA"
    somb.blend_type = "MULTIPLY"
    somb.inputs["Factor"].default_value = 0.75
    L(base.outputs[0], somb.inputs[6])
    somb.inputs[7].default_value = lin((0.62, 0.58, 0.78))
    luz = N("ShaderNodeMix")
    luz.data_type = "RGBA"
    L(ramp.outputs[0], luz.inputs["Factor"])
    L(somb.outputs[2], luz.inputs[6])
    L(base.outputs[0], luz.inputs[7])

    coord = N("ShaderNodeTexCoord")
    ruido = N("ShaderNodeTexNoise")
    ruido.inputs["Scale"].default_value = 6.0
    ruido.inputs["Detail"].default_value = 3.0
    L(coord.outputs["Object"], ruido.inputs["Vector"])
    gr = N("ShaderNodeMapRange")
    gr.inputs[1].default_value = 0.35
    gr.inputs[2].default_value = 0.7
    gr.inputs[3].default_value = 0.0
    gr.inputs[4].default_value = 0.16
    L(ruido.outputs[0], gr.inputs[0])
    gran = N("ShaderNodeMix")
    gran.data_type = "RGBA"
    gran.blend_type = "MULTIPLY"
    L(gr.outputs[0], gran.inputs["Factor"])
    L(luz.outputs[2], gran.inputs[6])
    gran.inputs[7].default_value = lin((0.7, 0.62, 0.6))

    emis = N("ShaderNodeEmission")
    L(gran.outputs[2], emis.inputs[0])
    L(emis.outputs[0], out.inputs[0])
    return m


def material_contorno() -> bpy.types.Material:
    m = bpy.data.materials.new("contorno")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = lin(SEPIA)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    m.use_backface_culling = True
    return m


def material_suelo() -> bpy.types.Material:
    """Suelo blanco iluminado: solo sirve para medir la sombra proyectada."""
    m = bpy.data.materials.new("suelo")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    dif.inputs[0].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


# --------------------------------------------------------------------------- geometría
def caja(x0, x1, y0, y1, z0, z1, bisel=0.012) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    tam = (x1 - x0, y1 - y0, z1 - z0)
    pos = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Diagonal((*tam, 1)), verts=bm.verts)
    if bisel:
        b = min(bisel, min(tam) * 0.3)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, segments=1, affect="EDGES", clamp_overlap=True)
    return bm


def extruir(perfil, eje: str, a0: float, a1: float) -> bmesh.types.BMesh:
    """Prisma: `perfil` es un polígono 2D en el plano perpendicular a `eje` ('x': (y, z);
    'y': (x, z)), extruido de a0 a a1 a lo largo del eje."""
    bm = bmesh.new()

    def punto(p, a):
        return (a, p[0], p[1]) if eje == "x" else (p[0], a, p[1])

    v0 = [bm.verts.new(punto(p, a0)) for p in perfil]
    v1 = [bm.verts.new(punto(p, a1)) for p in perfil]
    n = len(perfil)
    bm.faces.new(v0)
    bm.faces.new(list(reversed(v1)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v0[i], v0[j], v1[j], v1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def losa(a, b, c, d, grosor) -> bmesh.types.BMesh:
    """Losa con grosor a partir de un cuadrilátero (a, b, c, d) en el espacio; crece hacia la
    normal del cuadrilátero."""
    a, b, c, d = (Vector(p) for p in (a, b, c, d))
    n = (b - a).cross(d - a).normalized() * grosor
    bm = bmesh.new()
    abajo = [bm.verts.new(p) for p in (a, b, c, d)]
    arriba = [bm.verts.new(p + n) for p in (a, b, c, d)]
    bm.faces.new(abajo)
    bm.faces.new(list(reversed(arriba)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((abajo[i], abajo[j], arriba[j], arriba[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def viga(p0, p1, grueso=0.07) -> bmesh.types.BMesh:
    """Listón de sección cuadrada entre dos puntos."""
    p0, p1 = Vector(p0), Vector(p1)
    largo = (p1 - p0).length
    bm = caja(-grueso / 2, grueso / 2, -grueso / 2, grueso / 2, 0, largo, bisel=0.008)
    rot = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p0) @ rot, verts=bm.verts)
    return bm


def cilindro(x, y, r, z0, z1, seg=14) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
    return bm


def esfera(x, y, z, r, esc=(1, 1, 1)) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)), verts=bm.verts)
    return bm


class Pieza(list):
    """Lista de (bmesh, material, contorno) que forma un edificio en una fase."""

    def add(self, bm, mat, contorno=True):
        self.append((bm, mat, contorno))


# --------------------------------------------------------------------------- piezas comunes
def zocalo(p: Pieza, x0, x1, y0, y1, z1, tramos=None):
    """Zócalo de piedra. `tramos` limita a los lados indicados (para la fase de cimientos)."""
    if tramos is None:
        p.add(caja(x0, x1, y0, y1, 0, z1, bisel=0.02), "piedra")
        return
    g = 0.16
    lados = {
        "frente": (x0, x1, y0, y0 + g),
        "fondo": (x0, x1, y1 - g, y1),
        "izq": (x0, x0 + g, y0, y1),
        "der": (x1 - g, x1, y0, y1),
    }
    for t, frac in tramos:
        a0, a1, b0, b1 = lados[t]
        if t in ("frente", "fondo"):
            a1 = a0 + (a1 - a0) * frac
        else:
            b1 = b0 + (b1 - b0) * frac
        p.add(caja(a0, a1, b0, b1, 0, z1, bisel=0.02), "piedra")


def estacas_y_cuerda(p: Pieza, x0, x1, y0, y1):
    esquinas = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for x, y in esquinas:
        p.add(caja(x - 0.025, x + 0.025, y - 0.025, y + 0.025, 0, 0.32), "madera_clara")
    for i in range(4):
        (ax, ay), (bx, by) = esquinas[i], esquinas[(i + 1) % 4]
        p.add(viga((ax, ay, 0.27), (bx, by, 0.27), grueso=0.012), "cuerda", contorno=False)


def pila_tablones(p: Pieza, x0, y0, largo=0.8, capas=4, eje="x"):
    for i in range(capas):
        for j in range(2 if i % 2 == 0 else 1):
            d = j * 0.13 + (0.06 if i % 2 else 0)
            if eje == "x":
                p.add(caja(x0, x0 + largo, y0 + d, y0 + d + 0.12, i * 0.045, (i + 1) * 0.045, bisel=0.006), "madera_clara")
            else:
                p.add(caja(x0 + d, x0 + d + 0.12, y0, y0 + largo, i * 0.045, (i + 1) * 0.045, bisel=0.006), "madera_clara")


def pila_piedras(p: Pieza, x, y):
    for dx, dy, dz, r in ((0, 0, 0.07, 0.09), (0.15, 0.03, 0.06, 0.08), (0.07, 0.12, 0.06, 0.075), (0.07, 0.05, 0.17, 0.07)):
        p.add(esfera(x + dx, y + dy, dz, r, (1.15, 1.0, 0.8)), "piedra")


def escalera(p: Pieza, x, y_pie, z_arriba, y_arriba):
    for dx in (-0.12, 0.12):
        p.add(viga((x + dx, y_pie, 0), (x + dx, y_arriba, z_arriba), grueso=0.045), "madera")
    for k in range(1, 6):
        t = k / 6
        yy = y_pie + (y_arriba - y_pie) * t
        zz = z_arriba * t
        p.add(viga((x - 0.12, yy, zz), (x + 0.12, yy, zz), grueso=0.03), "madera")


def andamio(p: Pieza, x0, x1, y0, y1, z_plat):
    for x in (x0, x1):
        for y in (y0, y1):
            p.add(viga((x, y, 0), (x, y, z_plat + 0.5), grueso=0.045), "madera")
    p.add(caja(x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, z_plat, z_plat + 0.04, bisel=0.006), "madera_clara")
    for y in (y0, y1):
        p.add(viga((x0, y, z_plat + 0.42), (x1, y, z_plat + 0.42), grueso=0.035), "madera")
        p.add(viga((x0, y, 0.1), (x1, y, z_plat - 0.05), grueso=0.035), "madera")


def caballete(p: Pieza, x, y):
    p.add(caja(x, x + 0.6, y - 0.03, y + 0.03, 0.36, 0.42), "madera_clara")
    for dx in (0.06, 0.54):
        for dy in (-0.12, 0.12):
            p.add(viga((x + dx, y + dy, 0), (x + dx, y, 0.37), grueso=0.035), "madera")


# --------------------------------------------------------------------------- casa
def casa(fase: str) -> Pieza:
    W, D = HUELLAS["casa"]
    p = Pieza()
    x0, x1 = 0.2, W - 0.2
    y0, y1 = 0.3, D - 0.2
    zb, zw, zr = 0.18, 2.0, 2.75
    ym = (y0 + y1) / 2
    vuelo = 0.18

    if fase == "cimientos":
        p.add(caja(x0, x1, y0, y1, 0, 0.015, bisel=0), "tierra", contorno=False)
        zocalo(p, x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, zb, tramos=[("izq", 1.0), ("fondo", 0.7), ("frente", 0.45)])
        estacas_y_cuerda(p, x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06)
        pila_piedras(p, W - 0.55, 0.05)
        pila_tablones(p, 0.1, -0.05, largo=0.9, capas=3)
        return p

    if fase == "obra":  # anillo de piedra con la tierra dentro: aún no hay suelo
        p.add(caja(x0, x1, y0, y1, 0, 0.03, bisel=0), "tierra", contorno=False)
        zocalo(p, x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, zb, tramos=[(t, 1.0) for t in ("frente", "fondo", "izq", "der")])
    else:
        zocalo(p, x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, zb)
    # Escalón de la puerta
    xp = W * 0.3
    p.add(caja(xp - 0.32, xp + 0.32, y0 - 0.26, y0 - 0.04, 0, 0.1, bisel=0.015), "piedra")

    if fase == "obra":
        # Entramado de madera nueva: postes, carreras y cabios del tejado, sin cubrir.
        postes_x = [x0 + 0.04, xp - 0.25, xp + 0.25, x1 - 0.04]
        for x in postes_x:
            for y in (y0 + 0.04, y1 - 0.04):
                p.add(caja(x - 0.05, x + 0.05, y - 0.05, y + 0.05, zb, zw), "madera_clara")
        for y in (y0 + 0.04, y1 - 0.04):
            p.add(caja(x0 - 0.02, x1 + 0.02, y - 0.06, y + 0.06, zw - 0.1, zw), "madera_clara")
            p.add(caja(x0, x1, y - 0.04, y + 0.04, zb, zb + 0.08), "madera_clara")
        for x in (x0 + 0.04, x1 - 0.04):
            p.add(caja(x - 0.06, x + 0.06, y0, y1, zw - 0.1, zw), "madera_clara")
        # Pared del fondo a medio cerrar (tablas) y cabios
        p.add(caja(x0 + 0.05, x1 - 0.05, y1 - 0.08, y1 - 0.02, zb, 1.1, bisel=0.006), "madera")
        for x in [x0 + 0.04 + i * (x1 - x0 - 0.08) / 4 for i in range(5)]:
            p.add(viga((x, y0 - vuelo, zw - 0.05), (x, ym, zr), grueso=0.06), "madera_clara")
            p.add(viga((x, y1 + vuelo, zw - 0.05), (x, ym, zr), grueso=0.06), "madera_clara")
        p.add(caja(x0 - 0.1, x1 + 0.1, ym - 0.04, ym + 0.04, zr - 0.06, zr + 0.04), "madera_clara")
        # Andamio en el lado derecho, escalera, tablones y caballete
        andamio(p, x1 + 0.08, x1 + 0.42, y0 + 0.05, y1 - 0.05, 1.2)
        escalera(p, x0 + 0.45, y0 - 0.45, zw - 0.05, y0 - 0.02)
        pila_tablones(p, 0.0, -0.4, largo=0.9, capas=3)
        caballete(p, xp + 0.45, -0.25)
        return p

    # --- terminado
    perfil = [(y0, zb), (y1, zb), (y1, zw), (ym, zr - 0.05), (y0, zw)]
    p.add(extruir(perfil, "x", x0, x1), "enlucido")
    # Entramado visto: esquinas y carrera
    for x in (x0, x1):
        for y in (y0, y1):
            p.add(caja(x - 0.05, x + 0.05, y - 0.05, y + 0.05, zb, zw), "madera_osc")
    p.add(caja(x0, x1, y0 - 0.05, y0 + 0.03, zw - 0.09, zw), "madera_osc")
    # Tejado a dos aguas: losas de teja con vuelo y cumbrera
    a, b = (x0 - vuelo, y0 - vuelo, zw - 0.08), (x1 + vuelo, y0 - vuelo, zw - 0.08)
    c, d = (x1 + vuelo, ym, zr), (x0 - vuelo, ym, zr)
    p.add(losa(a, b, c, d, 0.09), "teja")
    a2, b2 = (x1 + vuelo, y1 + vuelo, zw - 0.08), (x0 - vuelo, y1 + vuelo, zw - 0.08)
    p.add(losa(a2, b2, d, c, 0.09), "teja")
    p.add(caja(x0 - vuelo - 0.02, x1 + vuelo + 0.02, ym - 0.07, ym + 0.07, zr - 0.02, zr + 0.1, bisel=0.02), "teja_osc")
    # Hileras de tejas en el faldón delantero (relieve para que la acuarela tenga dónde pintar)
    for k in range(1, 5):
        t = k / 5
        yy = y0 - vuelo + (ym - (y0 - vuelo)) * t
        zz = zw - 0.08 + (zr - (zw - 0.08)) * t
        p.add(viga((x0 - vuelo, yy, zz + 0.075), (x1 + vuelo, yy, zz + 0.075), grueso=0.035), "teja_osc", contorno=False)
    # Chimenea
    p.add(caja(x1 - 0.55, x1 - 0.25, ym + 0.1, ym + 0.4, 1.4, zr + 0.42, bisel=0.02), "piedra_osc")
    p.add(caja(x1 - 0.59, x1 - 0.21, ym + 0.06, ym + 0.44, zr + 0.38, zr + 0.46, bisel=0.01), "piedra")
    # Puerta
    p.add(caja(xp - 0.36, xp + 0.36, y0 - 0.04, y0 + 0.01, zb, zb + 1.72), "madera_osc")
    p.add(caja(xp - 0.3, xp + 0.3, y0 - 0.06, y0, zb, zb + 1.65), "madera")
    p.add(esfera(xp + 0.2, y0 - 0.08, zb + 0.85, 0.035), "hierro", contorno=False)
    # Ventanas con postigos
    for xv in (W * 0.58, W * 0.82):
        ventana(p, xv, y0)
    # Barril de agua junto a la esquina
    p.add(cilindro(x0 + 0.05, y0 - 0.12, 0.16, 0, 0.6), "madera_clara")
    for z in (0.12, 0.46):
        p.add(cilindro(x0 + 0.05, y0 - 0.12, 0.165, z, z + 0.035), "hierro", contorno=False)
    return p


def ventana(p: Pieza, xv: float, y0: float) -> None:
    p.add(caja(xv - 0.27, xv + 0.27, y0 - 0.04, y0 + 0.01, 0.9, 1.56), "madera_osc")
    p.add(caja(xv - 0.22, xv + 0.22, y0 - 0.05, y0, 0.95, 1.51), "cristal")
    p.add(caja(xv - 0.02, xv + 0.02, y0 - 0.07, y0, 0.95, 1.51, bisel=0.004), "madera_osc", contorno=False)
    p.add(caja(xv - 0.22, xv + 0.22, y0 - 0.07, y0, 1.21, 1.25, bisel=0.004), "madera_osc", contorno=False)
    for s in (-1, 1):
        p.add(caja(xv + 0.27, xv + 0.45, y0 - 0.06, y0 - 0.01, 0.92, 1.54) if s > 0 else
              caja(xv - 0.45, xv - 0.27, y0 - 0.06, y0 - 0.01, 0.92, 1.54), "postigo")
    # Jardinera bajo la ventana con flores
    p.add(caja(xv - 0.3, xv + 0.3, y0 - 0.16, y0 - 0.02, 0.76, 0.88), "madera")
    for i in range(5):
        p.add(esfera(xv - 0.24 + i * 0.12, y0 - 0.1, 0.93, 0.06), "teja" if i % 2 else "papel", contorno=False)


# --------------------------------------------------------------------------- cobertizo
def cobertizo(fase: str) -> Pieza:
    W, D = HUELLAS["cobertizo"]
    p = Pieza()
    x0, x1 = 0.15, W - 0.15
    y0, y1 = 0.3, D - 0.15
    zb, zf, zt = 0.1, 1.95, 2.35  # zócalo, alero delantero, alero trasero
    vuelo = 0.15

    if fase == "cimientos":
        p.add(caja(x0, x1, y0, y1, 0, 0.015, bisel=0), "tierra", contorno=False)
        zocalo(p, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, zb, tramos=[("fondo", 1.0), ("der", 0.6)])
        estacas_y_cuerda(p, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04)
        pila_tablones(p, 0.05, -0.1, largo=0.8, capas=3)
        return p

    if fase == "obra":
        p.add(caja(x0, x1, y0, y1, 0, 0.03, bisel=0), "tierra", contorno=False)
        zocalo(p, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, zb, tramos=[(t, 1.0) for t in ("frente", "fondo", "izq", "der")])
    else:
        zocalo(p, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, zb)

    if fase == "obra":
        for x in (x0 + 0.04, (x0 + x1) / 2, x1 - 0.04):
            p.add(caja(x - 0.05, x + 0.05, y0 - 0.01, y0 + 0.09, zb, zf), "madera_clara")
            p.add(caja(x - 0.05, x + 0.05, y1 - 0.09, y1 + 0.01, zb, zt), "madera_clara")
        p.add(caja(x0, x1, y0 - 0.02, y0 + 0.1, zf - 0.09, zf), "madera_clara")
        p.add(caja(x0, x1, y1 - 0.1, y1 + 0.02, zt - 0.09, zt), "madera_clara")
        # Pared izquierda ya cerrada de tablas, la del fondo a medias
        perfil = [(y0, zb), (y1, zb), (y1, zt), (y0, zf)]
        p.add(extruir(perfil, "x", x0, x0 + 0.06), "madera_clara")
        p.add(caja(x0 + 0.06, x1 - 0.3, y1 - 0.08, y1 - 0.02, zb, 1.3, bisel=0.006), "madera_clara")
        for x in [x0 + i * (x1 - x0) / 3 for i in range(4)]:
            p.add(viga((x, y0 - vuelo, zf - 0.02), (x, y1 + vuelo, zt + 0.02), grueso=0.055), "madera")
        escalera(p, x1 - 0.3, y0 - 0.4, zf - 0.05, y0 - 0.02)
        pila_tablones(p, 0.0, -0.3, largo=0.8, capas=2)
        return p

    # --- terminado: tablas verticales, tejado de una sola agua, puerta doble con cruz
    perfil = [(y0, zb), (y1, zb), (y1, zt), (y0, zf)]
    p.add(extruir(perfil, "x", x0, x1), "madera_clara")
    n = 9
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        p.add(caja(x - 0.012, x + 0.012, y0 - 0.02, y0, zb, zf - 0.05, bisel=0), "madera", contorno=False)
    for x in (x0, x1):
        p.add(caja(x - 0.05, x + 0.05, y0 - 0.05, y0 + 0.05, zb, zf), "madera_osc")
    a, b = (x0 - vuelo, y0 - vuelo, zf - 0.03), (x1 + vuelo, y0 - vuelo, zf - 0.03)
    c, d = (x1 + vuelo, y1 + vuelo, zt + 0.05), (x0 - vuelo, y1 + vuelo, zt + 0.05)
    p.add(losa(a, b, c, d, 0.08), "madera_osc")
    for k in range(1, 6):  # hiladas de tablillas
        t = k / 6
        p.add(viga((x0 - vuelo, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t + 0.075),
                   (x1 + vuelo, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t + 0.075), grueso=0.03), "madera", contorno=False)
    xc = x0 + (x1 - x0) * 0.4
    # Ventanuco a la derecha de la puerta
    xv = x0 + (x1 - x0) * 0.82
    p.add(caja(xv - 0.25, xv + 0.25, y0 - 0.05, y0, 0.95, 1.45), "madera_osc")
    p.add(caja(xv - 0.2, xv + 0.2, y0 - 0.06, y0, 1.0, 1.4), "cristal")
    p.add(caja(xv - 0.2, xv + 0.2, y0 - 0.08, y0, 1.18, 1.22, bisel=0.004), "madera_osc", contorno=False)
    p.add(caja(xc - 0.46, xc + 0.46, y0 - 0.05, y0 + 0.0, zb, zb + 1.68), "madera_osc")
    for s in (-1, 1):
        xa, xb = (xc - 0.42, xc - 0.02) if s < 0 else (xc + 0.02, xc + 0.42)
        p.add(caja(xa, xb, y0 - 0.07, y0 - 0.02, zb, zb + 1.62), "madera")
        p.add(viga((xa + 0.04, y0 - 0.08, zb + 0.08), (xb - 0.04, y0 - 0.08, zb + 1.52), grueso=0.045), "madera_osc", contorno=False)
    p.add(caja(xc - 0.22, xc + 0.22, y0 - 0.09, y0 - 0.06, zb + 0.82, zb + 0.88), "hierro", contorno=False)
    # Sacos junto a la puerta y una horca apoyada
    p.add(esfera(x1 - 0.05, y0 - 0.15, 0.17, 0.17, (0.9, 0.8, 1.05)), "saco")
    p.add(esfera(x1 - 0.22, y0 - 0.2, 0.13, 0.14, (0.9, 0.8, 1.0)), "saco")
    p.add(viga((x0 + 0.12, y0 - 0.25, 0), (x0 + 0.08, y0 - 0.06, 1.35), grueso=0.035), "madera")
    return p


# --------------------------------------------------------------------------- caja de envío
def caja_envio(fase: str) -> Pieza:
    p = Pieza()
    x0, x1, y0, y1 = 0.12, 0.88, 0.28, 0.78
    zt = 0.46
    if fase == "obra":
        p.add(caja(x0, x1, y0, y1, 0, 0.06), "madera_clara")
        p.add(caja(x0, x0 + 0.05, y0, y1, 0.06, zt), "madera_clara")
        p.add(caja(x0, x1, y1 - 0.05, y1, 0.06, zt), "madera_clara")
        p.add(caja(x0, x1 - 0.2, y0, y0 + 0.05, 0.06, 0.2), "madera_clara")
        p.add(viga((x1 + 0.05, y0 - 0.15, 0), (x1 + 0.0, y0 + 0.25, 0.45), grueso=0.05), "madera_clara")
        p.add(viga((x1 + 0.15, y0 - 0.1, 0), (x1 + 0.1, y0 + 0.3, 0.42), grueso=0.05), "madera_clara")
        p.add(caja(-0.05, 0.6, -0.15, 0.0, 0, 0.04), "madera_clara")
        return p
    p.add(caja(x0, x1, y0, y1, 0, zt, bisel=0.02), "madera_clara")
    for i in range(1, 3):  # tablas
        z = zt * i / 3
        p.add(caja(x0, x1, y0 - 0.012, y0, z - 0.008, z + 0.008, bisel=0), "madera", contorno=False)
    p.add(caja(x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, zt, zt + 0.1, bisel=0.02), "madera")
    for x in (x0 + 0.12, x1 - 0.12):
        p.add(caja(x - 0.03, x + 0.03, y0 - 0.04, y0 + 0.0, 0, zt + 0.1, bisel=0.004), "hierro")
    # Etiqueta de envío y cerrojo
    p.add(caja(0.42, 0.62, y0 - 0.05, y0 - 0.03, 0.17, 0.31, bisel=0.004), "papel")
    p.add(caja(0.48, 0.52, y0 - 0.06, y0 - 0.02, zt - 0.02, zt + 0.08, bisel=0.004), "hierro", contorno=False)
    return p


CONSTRUCTORES = {"casa": casa, "cobertizo": cobertizo, "caja": caja_envio}


# --------------------------------------------------------------------------- escena
def montar_pieza(nombre: str, pieza: Pieza, mats, contorno_mat) -> bpy.types.Collection:
    col = bpy.data.collections.new(nombre)
    bpy.context.scene.collection.children.link(col)
    for i, (bm, mat, contorno) in enumerate(pieza):
        me = bpy.data.meshes.new(f"{nombre}.{i:02d}")
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(me.name, me)
        col.objects.link(o)
        me.materials.append(mats[mat])
        if contorno:
            me.materials.append(contorno_mat)
            mod = o.modifiers.new("contorno", "SOLIDIFY")
            mod.thickness = 0.018
            mod.offset = 1.0
            mod.use_flip_normals = True
            mod.use_even_offset = True
            mod.use_quality_normals = True
            mod.material_offset = 1
    return col


def camara_y_luz() -> tuple[bpy.types.Object, bpy.types.Object]:
    esc = bpy.context.scene
    cam_data = bpy.data.cameras.new("camara-45")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("camara-45", cam_data)
    esc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(45), 0, 0)
    esc.camera = cam

    sol_data = bpy.data.lights.new("sol", "SUN")
    sol_data.energy = 1.0
    sol_data.color = (1.0, 0.945, 0.84)  # #FFF1D6
    sol_data.angle = math.radians(8)
    sol = bpy.data.objects.new("sol", sol_data)
    esc.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(35), 0, math.radians(-67))  # biblia §3

    mundo = bpy.data.worlds.new("mundo")
    mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (*lin((0.725, 0.78, 0.84))[:3], 1)
    mundo.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    esc.world = mundo

    esc.render.engine = "BLENDER_EEVEE"
    esc.render.resolution_percentage = 100
    esc.render.film_transparent = True
    esc.render.image_settings.file_format = "PNG"
    esc.render.image_settings.color_mode = "RGBA"
    esc.view_settings.view_transform = "Standard"

    suelo_me = bpy.data.meshes.new("suelo")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    bm.to_mesh(suelo_me)
    bm.free()
    suelo = bpy.data.objects.new("suelo", suelo_me)
    esc.collection.objects.link(suelo)
    suelo_me.materials.append(material_suelo())
    return cam, suelo


def encuadrar(cam: bpy.types.Object, edificio: str) -> None:
    (u0, u1), (v0, v1) = MARCOS[edificio]
    esc = bpy.context.scene
    ancho_m = u1 - u0
    alto_cam = (v1 - v0) / math.sqrt(2)  # v estirado = y + z; en cámara mide (y + z) / √2
    esc.render.resolution_x = round(ancho_m * PX_M)
    esc.render.resolution_y = round(alto_cam * PX_M)
    cam.data.ortho_scale = max(ancho_m, alto_cam)
    a = math.radians(45)
    vista = Vector((0, math.sin(a), -math.cos(a)))
    arriba = Vector((0, math.cos(a), math.sin(a)))
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2 / math.sqrt(2)
    cam.location = Vector((uc, 0, 0)) + vc * arriba - 30 * vista


def main() -> None:
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
    cols = {}
    for edificio, fases in FASES.items():
        for fase in fases:
            nombre = f"{edificio}-{fase}"
            cols[nombre] = montar_pieza(nombre, CONSTRUCTORES[edificio](fase), mats, contorno)
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
        encuadrar(cam, nombre.split("-")[0])
        for otro in cols.values():
            otro.hide_render = otro is not col
        # 1) Edificio solo, fondo transparente
        suelo.hide_render = True
        for o in col.objects:
            o.visible_camera = True
        esc.render.filepath = str(salida / f"{nombre}.png")
        bpy.ops.render.render(write_still=True)
        # 2) Suelo con la sombra proyectada; el edificio no se ve pero hace sombra
        suelo.hide_render = False
        for o in col.objects:
            o.visible_camera = False
        esc.render.filepath = str(salida / f"{nombre}-sombra.png")
        bpy.ops.render.render(write_still=True)
        for o in col.objects:
            o.visible_camera = True


main()
