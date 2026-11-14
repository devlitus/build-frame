# Ficha — Tierra arada seca y mojada (M5)

| Campo | Valor |
|---|---|
| Recursos | `terreno/tierra-arada-seca`, `terreno/tierra-arada-mojada` |
| Estado | Aprobada en la PARADA 1 de M5 (2026-11-13) |
| Generador | `assets-src/tierra-arada/tierra_arada.py` (procedural, numpy; **semilla 5101**; reutiliza el ruido periódico de `zonas/zonas.py`) |
| Entregas | `public/assets/terreno/tierra-arada-<seca\|mojada>@1x.webp` (256 × 32: 8 casillas) y `@2x` (512 × 64) |
| Muestras | `assets-src/tierra-arada/muestras/tierra-arada-<estado>.png` (parche sobre hierba) |
| Fecha | 2026-11-13 |

## Formato (el mismo que las zonas de M4)

| Índice | Uso |
|---|---|
| 0–3 | Relleno opaco: una variante por casilla, elegida con la semilla del valle |
| 4 / 5 / 6 / 7 | Borde **arriba / derecha / abajo / izquierda**: encima del relleno en cada lado cuya casilla vecina no está arada |

La mojada tiene la misma geometría que la seca (mismas variantes y bordes): al regar solo se
cambia la textura y nada se mueve.

## Orden de dibujo con las zonas

Terreno → relleno de la zona → **tierra arada** → bordes de la zona → cultivos. Así la tierra
tapa el lavado y la trama de la zona (encima la ensuciaban) y el perímetro de la zona sigue
viéndose alrededor del huerto.

## Diseño

Dos surcos horizontales por casilla, cresta en tierra (#785838) y fondo en tierra oscura
(#56402B), con la ladera que mira al sol algo más clara, terrones sueltos, grano y manchas
suaves. El borde es un labio de tierra removida, con la cresta clara, su sombra hacia dentro y el
pigmento acumulado en el filo (biblia §6). La mojada oscurece (× 0,74), enfría un poco hacia el
violeta de sombra y añade charcos de pigmento en los fondos de surco. Todo es periódico con
periodo de 1 casilla: rellenos y bordes casan entre sí.
