"""Modelos de las herramientas de M5. No es un script: lo cargan con `exec` `herramientas.py`
(iconos) y `prototipo/blender/protagonista.py` (animaciones de uso), después de las utilidades
de `edificios/blender/edificios.py` (`Pieza`, `caja`, `cilindro`, `esfera`, `viga`, `extruir`).

Convención: 1 unidad = 1 m. El punto donde agarra la mano derecha está en el origen y el mango va
a lo largo de +Z (la cabeza de la herramienta arriba). La cara «buena» mira a −Y.
"""

PALETA_H = {
    "mango": (0.69, 0.541, 0.353),  # madera clara #B08A5A
    "mango_osc": (0.541, 0.392, 0.251),  # #8A6440
    "acero": (0.66, 0.66, 0.66),
    "hierro": (0.37, 0.35, 0.37),  # #5E5A5E
    "zinc": (0.47, 0.6, 0.55),  # regadera pintada de verde agua
    "zinc_osc": (0.33, 0.45, 0.42),
    "papel": (0.961, 0.925, 0.808),  # crema #F5ECCE
    "terracota": (0.706, 0.345, 0.235),  # #B4583C
    "semilla": (0.83, 0.72, 0.5),
    "hoja": (0.42, 0.56, 0.27),
    "piel": (0.937, 0.749, 0.565),  # melocotón #EFBF90
    "saco": (0.79, 0.69, 0.5),  # arpillera
    "cuerda": (0.6, 0.47, 0.3),
    "tierra": (0.47, 0.345, 0.22),
}

# Grosor del contorno en los iconos: se encuadran a 48 px, así que el casco se ajusta al tamaño
# de cada objeto para que la línea mida lo mismo en todos.
GROSOR_CONTORNO = {
    "azada": 0.014, "regadera": 0.006, "semillas": 0.004, "mano": 0.003,
    "hacha": 0.01, "pico": 0.011, "planton": 0.006, "sobre": 0.004,
}


def m_azada() -> Pieza:
    # Mango corto (0,8 m) para que el golpe quepa en el marco de 64 × 80 px, como el hacha.
    p = Pieza()
    p.add(cilindro(0, 0, 0.018, -0.15, 0.66, seg=10), "mango")
    p.add(caja(-0.03, 0.035, -0.026, 0.026, 0.6, 0.68, bisel=0.008), "hierro")  # anilla
    # Hoja en ángulo recto con el mango: un trapecio que sale hacia +X y cuelga, más ancho abajo.
    p.add(extruir([(0.03, 0.66), (0.1, 0.66), (0.2, 0.5), (0.2, 0.46), (0.06, 0.46), (0.03, 0.6)], "y", -0.012, 0.012), "acero")
    p.add(extruir([(0.06, 0.46), (0.2, 0.46), (0.2, 0.48), (0.06, 0.48)], "y", -0.013, 0.013), "hierro", False)  # filo
    return p


def m_hacha() -> Pieza:
    p = Pieza()
    p.add(cilindro(0, 0, 0.02, -0.12, 0.6, seg=10), "mango")
    p.add(caja(-0.05, 0.04, -0.028, 0.028, 0.5, 0.6, bisel=0.008), "hierro")  # ojo y nuca
    p.add(extruir([(0.035, 0.505), (0.17, 0.46), (0.19, 0.53), (0.17, 0.64), (0.035, 0.595)], "y", -0.02, 0.02), "acero")
    p.add(extruir([(0.165, 0.46), (0.185, 0.46), (0.205, 0.53), (0.185, 0.64), (0.165, 0.64), (0.185, 0.53)], "y", -0.021, 0.021), "hierro", False)  # filo
    return p


def m_pico() -> Pieza:
    p = Pieza()
    p.add(cilindro(0, 0, 0.02, -0.12, 0.62, seg=10), "mango")
    p.add(caja(-0.035, 0.035, -0.032, 0.032, 0.54, 0.63, bisel=0.008), "hierro")  # collar
    p.add(viga((0.03, 0, 0.6), (0.2, 0, 0.56), 0.04), "acero")
    p.add(viga((0.2, 0, 0.56), (0.27, 0, 0.5), 0.026), "acero")  # punta
    p.add(viga((-0.03, 0, 0.6), (-0.19, 0, 0.57), 0.042), "acero")
    p.add(caja(-0.25, -0.18, -0.03, 0.03, 0.54, 0.585, bisel=0.006), "acero")  # pala plana
    return p


def m_regadera() -> Pieza:
    p = Pieza()
    # La mano agarra el asa de arriba: el cuerpo queda por debajo del origen.
    p.add(cilindro(0.03, 0, 0.1, -0.36, -0.16, seg=16), "zinc")
    p.add(cilindro(0.03, 0, 0.104, -0.36, -0.34, seg=16), "zinc_osc", False)  # aro de la base
    p.add(cilindro(0.03, 0, 0.104, -0.18, -0.16, seg=16), "zinc_osc", False)  # aro de arriba
    p.add(viga((0.11, 0, -0.32), (0.3, 0, -0.14), 0.035), "zinc")  # pitorro
    rosa = cilindro(0, 0, 0.04, -0.012, 0.012, seg=12)
    bmesh.ops.transform(rosa, matrix=Matrix.Translation((0.31, 0, -0.13)) @ Matrix.Rotation(math.radians(-50), 4, "Y"), verts=rosa.verts)
    p.add(rosa, "zinc_osc")
    for a, b in (((-0.05, 0, -0.17), (-0.03, 0, 0.0)), ((-0.03, 0, 0.0), (0.05, 0, 0.0)), ((0.05, 0, 0.0), (0.08, 0, -0.17))):
        p.add(viga(a, b, 0.022), "zinc_osc")  # asa
    return p


def m_semillas() -> Pieza:
    p = Pieza()
    p.add(caja(-0.07, 0.07, -0.012, 0.012, -0.1, 0.08, bisel=0.004), "papel")  # sobre
    p.add(caja(-0.071, 0.071, -0.013, 0.013, 0.05, 0.08, bisel=0.002), "terracota", False)  # solapa
    p.add(esfera(0, -0.012, -0.02, 0.035, (1, 0.25, 1.2)), "hoja", False)  # dibujo de un brote
    for dx, dz in ((-0.03, -0.075), (0.0, -0.08), (0.03, -0.072)):
        p.add(esfera(dx, -0.013, dz, 0.009, (1, 0.4, 1.3)), "semilla", False)
    return p


def m_sobre() -> Pieza:
    """Sobre de semillas vacío: el dibujo del cultivo se pega después (`montaje.py`)."""
    p = Pieza()
    p.add(caja(-0.07, 0.07, -0.012, 0.012, -0.1, 0.08, bisel=0.004), "papel")
    p.add(caja(-0.071, 0.071, -0.013, 0.013, 0.05, 0.08, bisel=0.002), "terracota", False)
    return p


def m_mano() -> Pieza:
    p = Pieza()
    p.add(caja(-0.045, 0.045, -0.018, 0.018, -0.05, 0.04, bisel=0.012), "piel")  # palma
    for i, (x, largo) in enumerate(((-0.033, 0.05), (-0.011, 0.058), (0.011, 0.056), (0.033, 0.045))):
        p.add(cilindro(x, 0, 0.0105, 0.035, 0.035 + largo, seg=8), "piel")
        p.add(esfera(x, 0, 0.035 + largo, 0.0105), "piel")
    p.add(viga((0.04, 0, -0.025), (0.08, -0.004, 0.02), 0.022), "piel")  # pulgar
    p.add(esfera(0.08, -0.004, 0.022, 0.011), "piel")
    p.add(caja(-0.047, 0.047, -0.02, 0.02, -0.1, -0.05, bisel=0.01), "papel")  # puño de la camisa
    return p


def m_planton() -> Pieza:
    p = Pieza()
    p.add(esfera(0, 0, 0, 0.07, (1, 1, 0.85)), "saco")  # cepellón en arpillera
    p.add(cilindro(0, 0, 0.073, 0.025, 0.035, seg=14), "cuerda", False)
    p.add(cilindro(0, 0, 0.012, 0.04, 0.26, seg=8), "mango_osc")  # tronquito
    p.add(viga((0, 0, 0.17), (0.05, 0, 0.22), 0.012), "mango_osc")
    for x, y, z, r in ((0, 0, 0.29, 0.055), (0.05, -0.01, 0.24, 0.04), (-0.04, 0.0, 0.23, 0.04), (0.02, -0.02, 0.33, 0.035)):
        p.add(esfera(x, y, z, r, (1, 0.8, 0.85)), "hoja")
    return p


MODELOS = {
    "azada": m_azada, "regadera": m_regadera, "semillas": m_semillas, "mano": m_mano,
    "hacha": m_hacha, "pico": m_pico, "planton": m_planton, "sobre": m_sobre,
}
