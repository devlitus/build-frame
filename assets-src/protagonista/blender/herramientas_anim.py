"""Animaciones de uso de herramientas del protagonista (M5), para «Raíces».

Uso (Blender 5.2, sin interfaz):
  blender -b -P assets-src/protagonista/blender/herramientas_anim.py -- --salida <dir>
          [--solo hacha-derecha ...] [--guardar <ruta.blend>]

Construye el mismo protagonista que `prototipo/blender/protagonista.py` (mismo modelo, esqueleto,
cámara a 30° y sol) y le pone en la mano derecha las herramientas de
`herramientas/blender/modelos.py`, las mismas de los iconos.

Animaciones (6 fotogramas cada una, dirección abajo, arriba y derecha; izquierda = espejo):
  azada · hacha · pico   golpe a dos manos: sube por encima de la cabeza y baja al suelo
  regadera               levanta la regadera, la inclina para regar y la baja
  agacharse              se agacha y alarga las manos al suelo (cosechar con la mano y sembrar)

Marco más grande que el de caminar porque la herramienta sube por encima de la cabeza y llega
lejos por delante: 96 × 96 px @1x (768 × 768 @8x), pivote (48, 84) @1x (los pies a 12 px del
borde inferior: la herramienta toca el suelo por delante). Escribe `<salida>/<anim>-<dir>-<n>.png`.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

RAIZ = Path(__file__).resolve().parents[3]
_p = (RAIZ / "assets-src/prototipo/blender/protagonista.py").read_text(encoding="utf-8")
exec(compile(_p.rsplit("\nmain()", 1)[0], "protagonista.py", "exec"))  # el protagonista, sin su main

# Las utilidades de M4 y los modelos de herramientas van en su propio espacio de nombres: algunas
# funciones se llaman igual que las del protagonista (esfera, caja, material_npr).
ED: dict = {"__name__": "edificios"}
_e = (RAIZ / "assets-src/edificios/blender/edificios.py").read_text(encoding="utf-8")
exec(compile(_e.rsplit("\nmain()", 1)[0], "edificios.py", "exec"), ED)
exec(compile((RAIZ / "assets-src/herramientas/blender/modelos.py").read_text(encoding="utf-8"), "modelos.py", "exec"), ED)

N = 6
ANIMS_H = ("azada", "hacha", "pico", "regadera", "agacharse")
HERRAMIENTA = {"azada": "azada", "hacha": "hacha", "pico": "pico", "regadera": "regadera"}
RES_H = (768, 768)
ALTO_M = 3.0  # 96 px @1x = 3 casillas
PIES_PX = 12  # px @1x entre los pies y el borde inferior

# Golpe a dos manos: ángulo de los brazos (grados, rotación X del hueso) por fotograma.
# 0 preparado · 1 sube · 2 arriba · 3 baja · 4 impacto · 5 recupera
GOLPE_BRAZO = (-30, -110, -148, -80, -35, -45)
GOLPE_ANTEBRAZO = (15, 20, 15, 5, 0, 10)
GOLPE_TORSO = (0, -6, -10, 6, 16, 10)  # se echa atrás al subir y adelante al golpear
GOLPE_CADERA = (0, 0.0, 0.01, -0.01, -0.04, -0.03)  # flexiona algo las rodillas al golpear


def herramienta_en_mano(arm, nombre: str, mats, contorno) -> bpy.types.Collection:
    pieza = ED["MODELOS"][nombre]()
    col = ED["montar_pieza"](f"h-{nombre}", pieza, mats, contorno)
    for o in col.objects:
        for m in o.modifiers:
            if m.type == "SOLIDIFY":
                m.thickness = 0.012  # el mismo casco que el personaje
    # La mano derecha (lado −X) en reposo: el puño, bajo el antebrazo.
    mano = Vector((-HOMBRO_X, 0, MUNECA_Z - 0.04)) * ESCALA_MODELO
    # Golpe: el mango prolonga el brazo, algo adelantado (20°), y la hoja mira atrás en reposo:
    # así, con los brazos arriba la herramienta queda vertical sobre la cabeza y en el impacto
    # la hoja va por delante, hacia el suelo. Regadera: cuelga del asa.
    giro = (
        Matrix.Rotation(math.radians(-90), 4, "Z")  # el pitorro hacia delante (−Y)
        if nombre == "regadera"
        else Matrix.Rotation(math.radians(160), 4, "X") @ Matrix.Rotation(math.radians(-90), 4, "Z")
    )
    bpy.context.view_layer.update()
    for o in col.objects:
        mw = Matrix.Translation(mano) @ giro @ Matrix.Scale(ESCALA_MODELO, 4)
        o.parent = arm
        o.parent_type = "BONE"
        o.parent_bone = "antebrazo.R"
        bpy.context.view_layer.update()
        o.matrix_world = mw
    return col


def accion_h(arm, nombre: str) -> None:
    act = bpy.data.actions.new(nombre)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    pb = arm.pose.bones
    for i in range(N):
        for b in pb:
            b.rotation_euler = (0, 0, 0)
            b.location = (0, 0, 0)
            b.scale = (1, 1, 1)
        if nombre in ("azada", "hacha", "pico"):
            for lado, s in (("R", 1), ("L", -1)):
                pb[f"brazo.{lado}"].rotation_euler.x = math.radians(GOLPE_BRAZO[i])
                pb[f"brazo.{lado}"].rotation_euler.z = math.radians(s * 22)  # las dos manos al mango
                pb[f"antebrazo.{lado}"].rotation_euler.x = math.radians(GOLPE_ANTEBRAZO[i])
            pb["torso"].rotation_euler.x = math.radians(GOLPE_TORSO[i])
            pb["cabeza"].rotation_euler.x = -math.radians(GOLPE_TORSO[i] * 0.5)
            pb["cadera"].location = (0, GOLPE_CADERA[i], 0)
            for lado in ("L", "R"):
                pb[f"muslo.{lado}"].rotation_euler.x = math.radians(-GOLPE_CADERA[i] * 400)
                pb[f"espinilla.{lado}"].rotation_euler.x = math.radians(GOLPE_CADERA[i] * 800)
        elif nombre == "regadera":
            sube = (0.1, 0.6, 1.0, 1.0, 1.0, 0.4)[i]
            # El brazo adelanta la regadera; la inclinación (verter) la hace la propia regadera
            # girando sobre el asa (ver `inclinar_regadera`): el esqueleto no tiene muñeca.
            pb["brazo.R"].rotation_euler.x = math.radians(-40 * sube)
            pb["antebrazo.R"].rotation_euler.x = math.radians(-12 * sube)
            pb["brazo.L"].rotation_euler.z = math.radians(-6)
            pb["torso"].rotation_euler.x = math.radians(5 * sube)
        else:  # agacharse
            baja = (0.0, 0.5, 1.0, 1.0, 0.6, 0.15)[i]
            pb["cadera"].location = (0, -0.16 * baja, 0)
            for lado in ("L", "R"):
                pb[f"muslo.{lado}"].rotation_euler.x = math.radians(-70 * baja)
                pb[f"espinilla.{lado}"].rotation_euler.x = math.radians(110 * baja)
                pb[f"pie.{lado}"].rotation_euler.x = math.radians(-40 * baja)
                pb[f"brazo.{lado}"].rotation_euler.x = math.radians(-50 * baja)
                pb[f"antebrazo.{lado}"].rotation_euler.x = math.radians(-20 * baja)
            pb["torso"].rotation_euler.x = math.radians(25 * baja)
            pb["cabeza"].rotation_euler.x = math.radians(-8 * baja)
        for b in pb:
            b.keyframe_insert("rotation_euler", frame=i + 1)
            b.keyframe_insert("location", frame=i + 1)
            b.keyframe_insert("scale", frame=i + 1)


REGADERA_INCLINA = (0, 0, 50, 65, 50, 0)  # grados: el pitorro baja y vierte


def inclinar_regadera(col) -> None:
    """Anima la regadera girando sobre el asa (su origen) alrededor de su eje lateral (Y del
    modelo). Solo se ve en la animación `regadera`, así que su acción de objeto no estorba."""
    for o in col.objects:
        base = o.matrix_basis.copy()
        for i, g in enumerate(REGADERA_INCLINA):
            o.matrix_basis = base @ Matrix.Rotation(math.radians(g), 4, "Y")
            o.keyframe_insert("location", frame=i + 1)
            o.keyframe_insert("rotation_euler", frame=i + 1)
            o.keyframe_insert("scale", frame=i + 1)


def camara_h() -> None:
    """La cámara del protagonista con el marco ampliado a 96 × 96 @1x (pies a 12 px del borde)."""
    camara_y_luz()
    esc = bpy.context.scene
    cam = esc.camera
    esc.render.resolution_x, esc.render.resolution_y = RES_H
    cam.data.ortho_scale = ALTO_M
    a = math.radians(90 - ELEVACION)
    vista = Vector((0, math.sin(a), -math.cos(a)))
    arriba = Vector((0, math.cos(a), math.sin(a)))
    centro_v = -ALTO_M / 2 + ALTO_M * PIES_PX / 96
    cam.location = -centro_v * arriba - 10 * vista


def main_h() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", required=True)
    ap.add_argument("--solo", nargs="*")
    ap.add_argument("--guardar")
    args = ap.parse_args(argv)

    limpiar()
    arm = construir("b")
    mats = {k: material_npr(f"h-{k}", v, "b") for k, v in ED["PALETA_H"].items()}
    contorno = material_contorno("b")
    cols = {n: herramienta_en_mano(arm, n, mats, contorno) for n in set(HERRAMIENTA.values())}
    for a in ANIMS_H:
        accion_h(arm, a)
    inclinar_regadera(cols["regadera"])
    camara_h()
    if args.guardar:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.guardar).resolve()))

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    esc = bpy.context.scene
    for anim in ANIMS_H:
        arm.animation_data.action = bpy.data.actions[anim]
        for n, col in cols.items():
            col.hide_render = n != HERRAMIENTA.get(anim)
        for dir_, giro in DIRECCIONES.items():
            if args.solo and f"{anim}-{dir_}" not in args.solo:
                continue
            arm.rotation_euler = (0, 0, math.radians(giro))
            for i in range(N):
                esc.frame_set(i + 1)
                esc.render.filepath = str(salida / f"{anim}-{dir_}-{i}.png")
                bpy.ops.render.render(write_still=True)


main_h()
