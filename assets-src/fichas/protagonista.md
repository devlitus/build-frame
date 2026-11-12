# Ficha — Protagonista

| Campo | Valor |
|---|---|
| Recurso | Protagonista: reposo (4 fotogramas) y caminar (8) en las direcciones abajo, arriba y derecha (izquierda = espejo) |
| Estado | Prototipo de arte, aprobado en la PARADA 2 |
| Concepto | `assets-src/prototipo/propuestas/propuesta-b-personaje.png` (estilo B, semilla 5201) |
| Fuente | `assets-src/protagonista/protagonista.blend`, generado por `assets-src/prototipo/blender/protagonista.py` |
| Herramientas | Blender 5.2.2 LTS (EEVEE), Node 22 + sharp para el montaje |
| Entregas | `public/assets/protagonista/protagonista@1x.webp` y `@2x.webp`, con sus `.json` (JSON Hash de Phaser) |
| Marco | 48 × 64 px @1x, pivote (24, 58); filas en el orden reposo/caminar × abajo/arriba/derecha |

## Cómo se regenera

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
  -P assets-src/prototipo/blender/protagonista.py -- --estilo b --salida <dir> \
  --guardar assets-src/protagonista/protagonista.blend
node scripts/montar-hojas.mjs <dir> public/assets/protagonista/protagonista --sombra
```

El modelo, el esqueleto, las animaciones, la cámara y la luz se construyen por código: el `.blend` es un resultado y se puede tirar y regenerar. Es determinista (sin aleatoriedad).

## Estructura del `.blend`

- Colecciones `cuerpo`, `pelo`, `ropa` y `accesorios` (personalización por capas en el futuro, GDD §3).
- Esqueleto `protagonista` con huesos `raiz`, `cadera`, `torso`, `cabeza` y `brazo`, `antebrazo`, `muslo`, `espinilla`, `pie` con sufijos `.L`/`.R`. Cada pieza va emparentada a un hueso (rígido, sin pesos: es *low-poly* y no se deforma).
- Acciones `reposo` y `caminar` (marcadas con usuario falso para que se guarden).
- Material NPR por color de la paleta (biblia §6) y contorno sepia por casco invertido (biblia §5).

## Decisiones

- **Bolsa a la espalda, centrada**, en lugar de la bandolera del concepto: así el espejo de la izquierda no delata la asimetría (biblia §10).
- **Cámara a 30°** en vez de 45° (biblia §2): a 45° solo se veía la coronilla.

## Tiempo

Ver el informe del prototipo (`docs/informes/`).
