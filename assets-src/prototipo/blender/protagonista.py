"""Protagonista de «Raíces»: modelo low-poly, esqueleto, animaciones y render de sprites.

Uso (Blender 5.2, sin interfaz):
  blender -b -P assets-src/prototipo/blender/protagonista.py -- --estilo b --salida <dir> [--guardar <ruta.blend>]

Construye todo por código (reproducible): mallas por piezas en colecciones separadas
(cuerpo, pelo, ropa, accesorios) para poder personalizar por capas en el futuro, un
esqueleto con las piezas emparentadas a sus huesos, las acciones `reposo` (4 fotogramas)
y `caminar` (8), la cámara 3/4 de la biblia (docs/arte/BIBLIA.md §2) y el sol de §3.

Renderiza `<salida>/<anim>-<dir>-<n>.png` para dir en abajo, arriba, derecha.
Cada PNG es el fotograma @8x (384 × 512, marco de 48 × 64 @1x): `scripts/montar-hojas.mjs`
lo reduce a @2x y @1x y monta las hojas.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- paleta
PALETA = {
    "piel": (0.937, 0.749, 0.565),  # melocotón #EFBF90
    "mejillas": (0.88, 0.52, 0.45),
    "pelo": (0.56, 0.33, 0.18),  # castaño claro del concepto B
    "ojos": (0.18, 0.16, 0.20),  # #2E2A33
    "camisa": (0.961, 0.925, 0.808),  # crema #F5ECCE
    "peto": (0.53, 0.60, 0.44),  # verde salvia grisáceo del concepto B
    "panuelo": (0.706, 0.345, 0.235),  # terracota #B4583C
    "botas": (0.52, 0.36, 0.22),  # tierra #785838 algo más clara
    "suela": (0.337, 0.251, 0.169),  # #56402B
    "bolsa": (0.55, 0.33, 0.19),  # cuero
}
SEPIA = (0.29, 0.204, 0.149)  # #4A3426
SOMBRA = (0.353, 0.329, 0.439)  # #5A5470

DIRECCIONES = {"abajo": 0.0, "arriba": 180.0, "derecha": 90.0}
ANIMS = {"reposo": 4, "caminar": 8}
# Personaje: cámara a 30° de elevación sin estirar (biblia §2). Marco 48 × 64 @1x → @8x.
ELEVACION = 30.0
RES = (384, 512)
ESCALA_MODELO = 1.1  # 1 casilla = 1 m; con 1,1 la figura mide ≈ 54 px @1x en pantalla


def srgb_a_lineal(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_a_lineal(c) for c in rgb) + (1.0,)


# --------------------------------------------------------------------------- escena
def limpiar() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def coleccion(nombre: str) -> bpy.types.Collection:
    c = bpy.data.collections.new(nombre)
    bpy.context.scene.collection.children.link(c)
    return c


# --------------------------------------------------------------------------- materiales
def material_npr(nombre: str, rgb, estilo: str) -> bpy.types.Material:
    """Sombreado pintado: 3 bandas de luz suaves + granulado + oscurecido de bordes (acuarela)."""
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
    ramp = N("ShaderNodeValToRGB")  # luz -> factor 0 (sombra) .. 1 (luz)
    ramp.color_ramp.interpolation = "EASE"
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.30, (0, 0, 0, 1)
    e[1].position, e[1].color = 0.62, (1, 1, 1, 1)
    medio = e.new(0.46)
    medio.color = (0.5, 0.5, 0.5, 1)
    L(bw.outputs[0], ramp.inputs[0])

    base = N("ShaderNodeRGB")
    base.outputs[0].default_value = lin(rgb)
    # Sombra: el color base multiplicado por el violeta de sombra (biblia §3), nunca negro.
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

    # Granulado de pigmento: ruido en espacio de objeto que oscurece un poco.
    coord = N("ShaderNodeTexCoord")
    ruido = N("ShaderNodeTexNoise")
    ruido.inputs["Scale"].default_value = 9.0
    ruido.inputs["Detail"].default_value = 3.0
    L(coord.outputs["Object"], ruido.inputs["Vector"])
    gr = N("ShaderNodeMapRange")
    gr.inputs[1].default_value = 0.35
    gr.inputs[2].default_value = 0.7
    gr.inputs[3].default_value = 0.0
    gr.inputs[4].default_value = 0.16 if estilo != "c" else 0.08
    L(ruido.outputs[0], gr.inputs[0])
    gran = N("ShaderNodeMix")
    gran.data_type = "RGBA"
    gran.blend_type = "MULTIPLY"
    L(gr.outputs[0], gran.inputs["Factor"])
    L(luz.outputs[2], gran.inputs[6])
    gran.inputs[7].default_value = lin((0.7, 0.62, 0.6))

    # Oscurecido de bordes (pigmento acumulado en la silueta).
    lw = N("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    bordes = N("ShaderNodeMapRange")
    bordes.inputs[1].default_value = 0.55
    bordes.inputs[2].default_value = 1.0
    bordes.inputs[4].default_value = 0.45 if estilo == "a" else 0.25
    L(lw.outputs["Facing"], bordes.inputs[0])
    borde = N("ShaderNodeMix")
    borde.data_type = "RGBA"
    borde.blend_type = "MULTIPLY"
    L(bordes.outputs[0], borde.inputs["Factor"])
    L(gran.outputs[2], borde.inputs[6])
    borde.inputs[7].default_value = lin((0.55, 0.45, 0.42))

    emis = N("ShaderNodeEmission")
    L(borde.outputs[2], emis.inputs[0])
    L(emis.outputs[0], out.inputs[0])
    return m


def material_contorno(estilo: str) -> bpy.types.Material:
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


# --------------------------------------------------------------------------- mallas
def malla(nombre: str, bm: bmesh.types.BMesh, col, mat, suave=True) -> bpy.types.Object:
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = suave
    o = bpy.data.objects.new(nombre, me)
    col.objects.link(o)
    o.data.materials.append(mat)
    return o


def esfera(r=1.0, seg=12, anillos=8, esc=(1, 1, 1), pos=(0, 0, 0)) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=anillos, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Diagonal((*esc, 1)), verts=bm.verts)
    return bm


def capsula(z0: float, z1: float, r0: float, r1: float, x=0.0, y=0.0, seg=10, esc_y=1.0) -> bmesh.types.BMesh:
    """Tronco de cono vertical con tapas redondeadas (para miembros y torso)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=abs(z1 - z0))
    bmesh.ops.transform(
        bm, matrix=Matrix.Translation((x, y, (z0 + z1) / 2)) @ Matrix.Diagonal((1, esc_y, 1, 1)), verts=bm.verts
    )
    for zc, rc in ((z0, r0), (z1, r1)):
        tapa = esfera(rc, seg, 6, (1, esc_y, 0.6), (x, y, zc))
        tmp = bpy.data.meshes.new("tmp")
        tapa.to_mesh(tmp)
        tapa.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return bm


def caja(tam, pos) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Diagonal((*tam, 1)), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(tam) * 0.3, segments=3, affect="EDGES", clamp_overlap=True, profile=0.5)
    return bm


def unir(*bms: bmesh.types.BMesh) -> bmesh.types.BMesh:
    res = bmesh.new()
    for b in bms:
        tmp = bpy.data.meshes.new("tmp")
        b.to_mesh(tmp)
        b.free()
        res.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return res


# --------------------------------------------------------------------------- personaje
# Medidas (m). 1 casilla = 1 m; altura total ≈ 1,66 m (biblia §1).
CADERA_Z, RODILLA_Z, TOBILLO_Z = 0.55, 0.32, 0.10
HOMBRO_Z, CODO_Z, MUNECA_Z = 0.96, 0.76, 0.58
CUELLO_Z, CABEZA_Z, CABEZA_R = 1.03, 1.30, 0.26
PIERNA_X, HOMBRO_X = 0.095, 0.205


def construir(estilo: str) -> bpy.types.Object:
    mats = {k: material_npr(k, v, estilo) for k, v in PALETA.items()}
    c_cuerpo, c_pelo, c_ropa, c_acc = (coleccion(n) for n in ("cuerpo", "pelo", "ropa", "accesorios"))
    piezas: list[tuple[bpy.types.Object, str]] = []

    def pieza(nombre, bm, col, mat, hueso, suave=True):
        piezas.append((malla(nombre, bm, col, mats[mat], suave), hueso))

    # Cabeza y cara
    pieza("cabeza", esfera(CABEZA_R, 16, 12, (1.06, 0.98, 0.96), (0, 0, CABEZA_Z)), c_cuerpo, "piel", "cabeza")
    for lado in (-1, 1):
        pieza(f"ojo.{'L' if lado > 0 else 'R'}", esfera(0.032, 8, 6, (0.8, 0.5, 1.25), (lado * 0.095, -0.235, CABEZA_Z - 0.01)), c_cuerpo, "ojos", "cabeza")
        pieza(f"mejilla.{'L' if lado > 0 else 'R'}", esfera(0.04, 8, 6, (1.2, 0.35, 0.7), (lado * 0.15, -0.205, CABEZA_Z - 0.075)), c_cuerpo, "mejillas", "cabeza")
    pieza("cuello", capsula(CUELLO_Z - 0.06, CUELLO_Z + 0.04, 0.06, 0.06), c_cuerpo, "piel", "torso")

    # Pelo: media melena ondulada (concepto B). Casquete que deja la cara libre, flequillo de
    # mechones sueltos y una corona de mechones alargados que cae hasta la mandíbula por los lados
    # y la nuca. Simétrico (el espejo izquierdo lo hace el juego, biblia §10).
    pelo = esfera(CABEZA_R * 1.08, 20, 14, (1.04, 1.02, 0.98), (0, 0.02, CABEZA_Z + 0.035))
    fuera = [v for v in pelo.verts if (v.co.y < -0.05 and v.co.z < CABEZA_Z + 0.08) or v.co.z < CABEZA_Z - 0.05]
    bmesh.ops.delete(pelo, geom=fuera, context="VERTS")
    mechones = [pelo]
    for i in range(6):  # flequillo: mechones que caen sobre la frente, abiertos al centro
        a = math.radians(-62 + i * (124 / 5))
        x, y = math.sin(a) * 0.2, -math.cos(a) * 0.215
        z = CABEZA_Z + 0.125 - abs(math.sin(a)) * 0.05
        mechones.append(esfera(0.07, 8, 6, (1.25, 0.7, 0.85), (x, y + 0.01, z)))
    for i in range(9):  # melena corta: de oreja a oreja por la nuca, sin tapar la cara
        a = math.radians(95 + i * (170 / 8))
        r = 0.23
        x, y = math.sin(a) * r, -math.cos(a) * r + 0.03
        z = CABEZA_Z - 0.07
        mechones.append(esfera(0.075, 8, 6, (1.0, 0.9, 1.45), (x, y, z)))
        # puntas onduladas que se abren un poco hacia fuera, a la altura de la mandíbula
        mechones.append(esfera(0.045, 8, 6, (1.15, 1.0, 0.8), (x * 1.1, y * 1.06, z - 0.11)))
    for lado in (-1, 1):  # patillas: un mechón delante de cada oreja
        mechones.append(esfera(0.05, 8, 6, (0.8, 0.9, 1.6), (lado * 0.24, 0.0, CABEZA_Z - 0.05)))
    pieza("pelo", unir(*mechones), c_pelo, "pelo", "cabeza")

    # Torso: camisa arriba, peto abajo; tirantes y babero del peto.
    pieza("camisa", capsula(0.74, HOMBRO_Z + 0.02, 0.165, 0.18, esc_y=0.78), c_ropa, "camisa", "torso")
    pieza("peto", unir(
        capsula(CADERA_Z - 0.04, 0.80, 0.172, 0.17, esc_y=0.8),
        caja((0.2, 0.05, 0.16), (0, -0.125, 0.86)),
        caja((0.045, 0.30, 0.03), (-0.1, 0.0, HOMBRO_Z + 0.005)),
        caja((0.045, 0.30, 0.03), (0.1, 0.0, HOMBRO_Z + 0.005)),
    ), c_ropa, "peto", "torso")
    pico = bmesh.new()  # pico del pañuelo: triángulo con algo de volumen que cuelga sobre el pecho
    vs = [pico.verts.new(v) for v in (
        (-0.10, -0.155, CUELLO_Z - 0.03), (0.10, -0.155, CUELLO_Z - 0.03), (0, -0.19, CUELLO_Z - 0.20),
        (-0.10, -0.12, CUELLO_Z - 0.03), (0.10, -0.12, CUELLO_Z - 0.03), (0, -0.155, CUELLO_Z - 0.20),
    )]
    for cara in ((0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)):
        pico.faces.new([vs[i] for i in cara])
    pieza("panuelo", unir(
        capsula(CUELLO_Z - 0.06, CUELLO_Z - 0.01, 0.15, 0.10, seg=14, esc_y=0.85),
        pico,
        esfera(0.045, 8, 6, (1.2, 0.8, 1.0), (0, -0.165, CUELLO_Z - 0.045)),  # nudo
    ), c_acc, "panuelo", "torso", suave=False)
    pieza("bolsa", unir(caja((0.22, 0.09, 0.17), (0, 0.165, 0.68)), caja((0.23, 0.035, 0.09), (0, 0.215, 0.73))), c_acc, "bolsa", "torso")

    for lado, s in (("L", 1), ("R", -1)):
        # Brazos: manga remangada (crema) arriba, antebrazo y mano en piel.
        pieza(f"manga.{lado}", capsula(CODO_Z, HOMBRO_Z, 0.068, 0.078, x=s * HOMBRO_X), c_ropa, "camisa", f"brazo.{lado}")
        pieza(f"puno.{lado}", capsula(CODO_Z - 0.07, CODO_Z - 0.01, 0.062, 0.066, x=s * HOMBRO_X), c_ropa, "camisa", f"antebrazo.{lado}")
        pieza(f"antebrazo.{lado}", unir(
            capsula(MUNECA_Z, CODO_Z, 0.045, 0.05, x=s * HOMBRO_X),
            esfera(0.058, 10, 8, (1, 1, 1.1), (s * HOMBRO_X, 0, MUNECA_Z - 0.04)),
        ), c_cuerpo, "piel", f"antebrazo.{lado}")
        # Piernas: perneras del peto y botas.
        pieza(f"muslo.{lado}", capsula(RODILLA_Z, CADERA_Z, 0.074, 0.085, x=s * PIERNA_X), c_ropa, "peto", f"muslo.{lado}")
        pieza(f"espinilla.{lado}", capsula(TOBILLO_Z + 0.05, RODILLA_Z + 0.02, 0.066, 0.072, x=s * PIERNA_X), c_ropa, "peto", f"espinilla.{lado}")
        pieza(f"bota.{lado}", unir(
            caja((0.13, 0.2, 0.11), (s * PIERNA_X, -0.03, 0.065)),
            capsula(0.09, 0.17, 0.068, 0.07, x=s * PIERNA_X),
        ), c_ropa, "botas", f"pie.{lado}")
        pieza(f"suela.{lado}", caja((0.135, 0.21, 0.025), (s * PIERNA_X, -0.03, 0.0125)), c_ropa, "suela", f"pie.{lado}", suave=False)

    if estilo == "b":  # contorno sepia por casco invertido (biblia §5, opción B)
        mc = material_contorno(estilo)
        for o, _ in piezas:
            if o.name.startswith(("ojo", "mejilla")):
                continue
            o.data.materials.append(mc)
            mod = o.modifiers.new("contorno", "SOLIDIFY")
            mod.thickness = 0.012
            mod.offset = 1.0
            mod.use_flip_normals = True
            mod.use_even_offset = True
            mod.use_quality_normals = True
            mod.material_offset = 1

    return esqueleto(piezas)


def esqueleto(piezas) -> bpy.types.Object:
    arm_data = bpy.data.armatures.new("esqueleto")
    arm = bpy.data.objects.new("protagonista", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def hueso(nombre, cabeza, cola, padre=None):
        b = eb.new(nombre)
        b.head, b.tail = Vector(cabeza), Vector(cola)
        b.roll = 0.0
        if padre:
            b.parent = eb[padre]
        return b

    hueso("raiz", (0, 0, 0), (0, 0.3, 0))
    hueso("cadera", (0, 0, CADERA_Z), (0, 0, 0.74), "raiz")
    hueso("torso", (0, 0, 0.74), (0, 0, CUELLO_Z), "cadera")
    hueso("cabeza", (0, 0, CUELLO_Z), (0, 0, CABEZA_Z + 0.3), "torso")
    for lado, s in (("L", 1), ("R", -1)):
        hueso(f"brazo.{lado}", (s * HOMBRO_X, 0, HOMBRO_Z), (s * HOMBRO_X, 0, CODO_Z), "torso")
        hueso(f"antebrazo.{lado}", (s * HOMBRO_X, 0, CODO_Z), (s * HOMBRO_X, 0, MUNECA_Z - 0.06), f"brazo.{lado}")
        hueso(f"muslo.{lado}", (s * PIERNA_X, 0, CADERA_Z), (s * PIERNA_X, 0, RODILLA_Z), "cadera")
        hueso(f"espinilla.{lado}", (s * PIERNA_X, 0, RODILLA_Z), (s * PIERNA_X, 0, TOBILLO_Z), f"muslo.{lado}")
        hueso(f"pie.{lado}", (s * PIERNA_X, 0, TOBILLO_Z), (s * PIERNA_X, -0.14, 0.02), f"espinilla.{lado}")
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.context.view_layer.update()
    for o, nombre in piezas:
        mw = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = "BONE"
        o.parent_bone = nombre
        bpy.context.view_layer.update()
        o.matrix_world = mw
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    arm.scale = (ESCALA_MODELO,) * 3  # después de emparentar: las piezas escalan con el esqueleto
    return arm


# --------------------------------------------------------------------------- animación
def accion(arm, nombre: str, n: int) -> bpy.types.Action:
    act = bpy.data.actions.new(nombre)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    pb = arm.pose.bones
    for i in range(n + 1):  # el último fotograma repite el primero (bucle limpio)
        t = 2 * math.pi * (i % n) / n
        for b in pb:
            b.rotation_euler = (0, 0, 0)
            b.location = (0, 0, 0)
            b.scale = (1, 1, 1)
        if nombre == "caminar":
            muslo = math.radians(30) * math.sin(t)
            pb["muslo.L"].rotation_euler.x = muslo
            pb["muslo.R"].rotation_euler.x = -muslo
            # La rodilla se dobla mientras la pierna avanza por el aire.
            pb["espinilla.L"].rotation_euler.x = -math.radians(45) * max(0.0, math.cos(t - 0.9))
            pb["espinilla.R"].rotation_euler.x = -math.radians(45) * max(0.0, math.cos(t - 0.9 + math.pi))
            pb["pie.L"].rotation_euler.x = math.radians(12) * math.sin(t)
            pb["pie.R"].rotation_euler.x = -math.radians(12) * math.sin(t)
            brazo = math.radians(24) * math.sin(t)
            pb["brazo.L"].rotation_euler.x = -brazo
            pb["brazo.R"].rotation_euler.x = brazo
            pb["antebrazo.L"].rotation_euler.x = math.radians(18)
            pb["antebrazo.R"].rotation_euler.x = math.radians(18)
            pb["cadera"].location = (0, 0.035 * (math.cos(2 * t) + 1) / 2 - 0.02, 0)  # el eje Y del hueso es +Z
            pb["torso"].rotation_euler.y = math.radians(6) * math.sin(t)
            pb["cabeza"].rotation_euler.y = -math.radians(4) * math.sin(t)
            pb["torso"].rotation_euler.x = math.radians(4)
        else:  # reposo: respiración
            r = (1 - math.cos(t)) / 2
            pb["torso"].scale = (1 + 0.015 * r, 1 + 0.025 * r, 1 + 0.015 * r)
            pb["cabeza"].location = (0, 0.008 * r, 0)
            pb["brazo.L"].rotation_euler.z = math.radians(3 + 2 * r)
            pb["brazo.R"].rotation_euler.z = -math.radians(3 + 2 * r)
            pb["antebrazo.L"].rotation_euler.x = math.radians(6)
            pb["antebrazo.R"].rotation_euler.x = math.radians(6)
        for b in pb:
            b.keyframe_insert("rotation_euler", frame=i + 1)
            b.keyframe_insert("location", frame=i + 1)
            b.keyframe_insert("scale", frame=i + 1)
    return act


# --------------------------------------------------------------------------- cámara y luz
def camara_y_luz() -> None:
    esc = bpy.context.scene
    cam_data = bpy.data.cameras.new("camara-3-4")
    cam_data.type = "ORTHO"
    alto_plano = 2.0  # 64 px @1x = 2 casillas = 2 m
    cam_data.ortho_scale = alto_plano * max(1.0, RES[0] / RES[1])
    cam = bpy.data.objects.new("camara-3-4", cam_data)
    esc.collection.objects.link(cam)
    a = math.radians(90 - ELEVACION)
    cam.rotation_euler = (a, 0, 0)
    vista = Vector((0, math.sin(a), -math.cos(a)))
    arriba = Vector((0, math.cos(a), math.sin(a)))
    # El origen (pies) queda a 6/64 del borde inferior: pivote (24, 58) @1x.
    centro_v = -alto_plano / 2 + alto_plano * 6 / 64
    cam.location = -centro_v * arriba - 10 * vista
    esc.camera = cam

    sol_data = bpy.data.lights.new("sol", "SUN")
    sol_data.energy = 1.0
    sol_data.color = (1.0, 0.945, 0.84)  # #FFF1D6
    sol_data.angle = math.radians(8)
    sol = bpy.data.objects.new("sol", sol_data)
    esc.collection.objects.link(sol)
    # Desde la izquierda y algo por delante (oeste-suroeste), elevación 55° (biblia §3):
    # ilumina la cara del personaje que mira a cámara y las sombras caen a la derecha.
    sol.rotation_euler = (math.radians(35), 0, math.radians(-67))

    mundo = bpy.data.worlds.new("mundo")
    mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (*lin((0.725, 0.78, 0.84))[:3], 1)
    mundo.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    esc.world = mundo

    esc.render.engine = "BLENDER_EEVEE"
    esc.render.resolution_x, esc.render.resolution_y = RES
    esc.render.resolution_percentage = 100
    esc.render.film_transparent = True
    esc.render.image_settings.file_format = "PNG"
    esc.render.image_settings.color_mode = "RGBA"
    esc.view_settings.view_transform = "Standard"
    esc.render.fps = 10


def renderizar(arm, salida: Path) -> None:
    esc = bpy.context.scene
    salida.mkdir(parents=True, exist_ok=True)
    for anim, n in ANIMS.items():
        arm.animation_data.action = bpy.data.actions[anim]
        for dir_, giro in DIRECCIONES.items():
            arm.rotation_euler = (0, 0, math.radians(giro))
            for i in range(n):
                esc.frame_set(i + 1)
                esc.render.filepath = str(salida / f"{anim}-{dir_}-{i}.png")
                bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--estilo", default="b", choices=["a", "b", "c"])
    p.add_argument("--salida", required=True)
    p.add_argument("--guardar")
    p.add_argument("--solo", help="renderiza solo <anim>-<dir>-<n> (prueba rápida)")
    args = p.parse_args(argv)

    limpiar()
    arm = construir(args.estilo)
    for anim, n in ANIMS.items():
        accion(arm, anim, n)
    camara_y_luz()
    if args.guardar:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.guardar).resolve()))
    if args.solo:
        anim, dir_, i = args.solo.split("-")
        arm.animation_data.action = bpy.data.actions[anim]
        arm.rotation_euler = (0, 0, math.radians(DIRECCIONES[dir_]))
        bpy.context.scene.frame_set(int(i) + 1)
        bpy.context.scene.render.filepath = str(Path(args.salida) / f"{args.solo}.png")
        bpy.ops.render.render(write_still=True)
    else:
        renderizar(arm, Path(args.salida))


main()
