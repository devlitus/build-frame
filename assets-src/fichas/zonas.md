# Ficha — Marcas de zona y casillas de colocación (M4)

| Campo | Valor |
|---|---|
| Recursos | `zona-cultivo`, `zona-huerto`, `zona-vivienda`, `zona-almacen`; `colocacion` |
| Estado | Propuesta aprobada en la PARADA 1 (2026-11-13) |
| Generador | `assets-src/zonas/zonas.py` (procedural, numpy; **semilla 4101**) |
| Entregas | `public/assets/zonas/zona-<tipo>@1x.webp` (256 × 32: 8 casillas) y `@2x` (512 × 64); `colocacion@1x.webp` (64 × 32) y `@2x` |
| Fecha | 2026-11-13 |

## Propuesta: lavado + trama + borde

La zona no sustituye al terreno: se pinta **encima**. Una zona de Cultivo es hierba hasta que se
ara, así que un *tile* de suelo propio taparía lo que importa y chocaría con la tierra arada. Cada
casilla de zona lleva tres cosas:

1. **Lavado** semitransparente del color de la zona (≈ 30 %), con variaciones suaves de densidad y
   grano de papel: la acuarela de la biblia §6.
2. **Trama a plumilla** propia de cada zona, con un trazo algo tembloroso y la tinta que se carga
   y se interrumpe. Distingue las zonas **sin depender del color** (daltonismo, pantallas al sol) y
   tiene solo 2 trazos por casilla, así que no vibra al hacer zoom (biblia §7.5).
3. **Borde** en el perímetro de la zona: el pigmento acumulado en el filo, como cuando se seca una
   mancha de acuarela (*edge darkening*, biblia §6). Mide unos 2–3 px @1x (biblia §7.3).

| Zona | Lavado | Tinta | Trama | Por qué |
|---|---|---|---|---|
| Cultivo | `#D2A548` trigo | `#7F6026` | rayas horizontales | surcos |
| Huerto | `#B25A86` ciruela | `#6A3153` | puntos al tresbolillo | frutos |
| Vivienda | `#C0603F` terracota | `#7E3A26` | diagonales | tejados |
| Almacén | `#5F8FA8` azul | `#3B5E74` | cuadrícula | cajas apiladas |

Para Ganado, Taller y Decoración basta con añadir una entrada a `ZONAS` con su color y una trama
nueva (p. ej. ondas o cruces).

## Hoja de cada zona

8 casillas en fila: `0–3` relleno (4 variantes que se reparten con la semilla del valle, igual que
el terreno) y `4–7` borde **arriba, derecha, abajo, izquierda**. Todo es periódico con periodo de
1 casilla: el relleno repite sin costuras y los bordes de casillas vecinas continúan. El juego
dibuja en cada casilla de la zona un relleno y, encima, el borde de cada lado cuya casilla vecina
no es de la misma zona. Las esquinas, tanto las salientes como las entrantes, salen solas.

## Colocación (opcional)

`colocacion`: casilla **válida** (crema clara con filo salvia oscuro) e **inválida** (terracota con
rayas y filo rojo oscuro). Se dibujan sobre cada casilla de la huella, **encima** del edificio
fantasma, que se dibuja con su sprite al 60 % de opacidad. Si se prefiere no usar imágenes, el
mismo efecto se obtiene tiñendo el fantasma (`setTint`) y dibujando rectángulos con esos colores.
