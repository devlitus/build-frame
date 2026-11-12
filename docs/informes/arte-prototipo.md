# Prototipo de arte — informe del pipeline

**Rama:** `arte/prototipo-estilo` · **Biblia:** [docs/arte/BIBLIA.md](../arte/BIBLIA.md) · **Fichas:** [propuestas](../../assets-src/fichas/propuestas-estilo.md), [protagonista](../../assets-src/fichas/protagonista.md), [terreno y objetos](../../assets-src/fichas/terreno-y-objetos.md)

Objetivo: fijar el estilo visual con una porción vertical a calidad final y validar el pipeline ComfyUI + Blender. No se ha tocado `src/`: las hojas están en `public/assets/` pero no se cargan en el juego.

## Resultado

- **Estilo elegido en la PARADA 1: B, tinta sepia + acuarela.** Era la única propuesta en la que la silueta y el pañuelo se leían a tamaño real (54 px) sobre la hierba.
- **Protagonista:** reposo (4 fotogramas) y caminar (8) en abajo, arriba y derecha (la izquierda es el espejo), a @1x y @2x con su JSON de Phaser.
- ***Tiles*:** hierba, tierra arada, agua y camino, con 4 variantes repetibles cada uno.
- **Objetos:** un árbol y una roca.
- **Muestra:** escena estática y GIF del paseo en `assets-src/prototipo/muestra/`.

## Acabado acuarela del protagonista: NPR frente a img2img

Se probaron las dos técnicas que pedía la tarea sobre los mismos fotogramas de Blender.

| | Shader NPR en Blender | img2img en ComfyUI con ControlNet |
|---|---|---|
| Cómo | Material de 3 bandas con sombra violeta, granulado y oscurecido de bordes, más contorno por casco invertido | Qwen-Image 2512 sobre el render (*denoise* 0,3), con ControlNet InstantX Union alimentado por los bordes Canny del render y semilla fija (6101) |
| Aspecto | Limpio pero de juguete 3D: sombreado plano, pelo de «casco», cara sin expresión | Muy cercano al concepto B: pelo ondulado con mechones, cara con expresión, pliegues y textura de acuarela |
| Coherencia entre fotogramas | Perfecta | Buena con *denoise* 0,3. Con 0,45 parpadeaba (cambiaban el pelo y los ojos de un fotograma a otro) |
| Coste | 3 min para los 36 fotogramas | ≈ 95 s por fotograma, ≈ 1 h para los 36 |
| Reproducible | Sí, determinista | Sí, con la misma semilla y el mismo modelo |

**Elegida: la combinación de las dos.** Blender pone la forma, la animación, la cámara y la luz (lo que tiene que ser estable), y la pasada img2img suave pone el acabado pintado. Por qué:

1. El NPR solo no llega a la calidad del concepto y la prioridad era que fuese lo más bonito posible.
2. La img2img sola, sin el render como guía, no mantiene al personaje igual entre fotogramas ni entre direcciones.
3. Con *denoise* 0,3 y ControlNet a 0,8 el modelo repinta la superficie pero respeta la silueta, así que el ciclo de caminar sigue siendo el de Blender.

Detalles que costaron:
- **Halo claro:** el modelo pinta un filo crema donde el render tocaba el papel. Se arregla erosionando 1 px el alfa original al recortar.
- **Parpadeo:** se nota en el zoom, no a tamaño real. Si molesta en el juego, la siguiente palanca es bajar el *denoise* a 0,25 o fijar la cara con un *inpainting*.

## Coste en tiempo por recurso

Medido en este equipo (RTX 4070 de 12 GB). Los tiempos de ComfyUI son de generación sin cola.

| Recurso | Generación | Ajuste a mano o por script | Notas |
|---|---|---|---|
| Propuesta de estilo (hoja + terreno) | 2,5–4,5 min por imagen, 6 imágenes | ≈ 15 min de láminas | Se repitieron los 3 terrenos (salían como diorama) |
| Protagonista: modelo y animación | 3 min de render (36 fotogramas) | 4 iteraciones del script | Pelo y pañuelo, lo que más vueltas dio |
| Protagonista: acuarela img2img | ≈ 95 s por fotograma, ≈ 1 h en total | 2 pruebas de parámetros | Descarga previa del ControlNet: 3,5 GB, 7 min |
| *Tile* (cada tipo) | ≈ 1,5–3 min por textura | Automático (`terreno.py`) | Hierba y agua, regeneradas una vez |
| Árbol, roca | ≈ 1,5–3 min cada uno | Automático | Regenerados una vez (rayos de sol en el fondo) |
| Escena y GIF | Segundos | Automático (`escena.py`) | |

Con la GPU ocupada por Blender, ComfyUI va varias veces más lento: no conviene lanzar los dos a la vez.

## Lo aprendido del pipeline

1. **La cámara del personaje no puede ser la del suelo.** A 45° solo se veía la coronilla, así que el personaje va a 30° y sin estirar. Los objetos con huella siguen a 45° con estirado × √2 (biblia §2).
2. **Qwen-Image pinta lo que no se le pide.** Rayos de sol, filos de papel, sombras y dioramas aparecen aunque el *prompt* los niegue. Los scripts no se fían del fondo: recortan dentro de una zona segura y separan el objeto con un relleno desde los bordes.
3. **Las texturas no salen repetibles.** Hay que hacerlas repetibles después:
   - Mezclar la textura con su copia desplazada media vuelta.
   - Igualar el tono de las variantes.
   - En la tierra arada, alinear los recortes al periodo de los surcos, que se detecta por autocorrelación.
   - Las texturas con elementos sueltos (matas) delatan la repetición: piden manchas continuas.
4. **La línea sepia es lo que hace legible el estilo B a 54 px**, y la pasada img2img la conserva porque el ControlNet ve los bordes.
5. **Todo es reproducible por script** y con semillas fijas en las fichas. Los `.blend` y los PNG intermedios son resultados que se pueden regenerar.
6. **MCP frente a HTTP:** la espera de trabajos del MCP de ComfyUI se corta a los 60 s, así que `lanzar.py` habla directamente con la API HTTP de ComfyUI.

## Pendiente y propuestas

- **Issue #11 (DPR):** el arte se entrega a @1x y @2x. Conectarlo al juego y elegir la textura según el DPR queda para ese issue (biblia §8).
- **Árbol y roca:** se han hecho con ComfyUI. Para edificios y objetos con huella exacta conviene modelarlos en Blender a 45° con la misma pasada img2img.
- **Transiciones entre terrenos y agua animada:** quedan para M5.
- **Rendimiento de la acuarela:** a ≈ 95 s por fotograma, un personaje con 10 animaciones costaría unas 5 h de GPU. Es asumible por lotes, pero conviene probar el LoRA Lightning de 4 pasos (ya instalado) para dividir el tiempo por 5 a 7.
