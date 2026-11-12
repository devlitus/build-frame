# Biblia de arte — «Raíces»

**Estado:** prototipo de arte (ROADMAP, Transversal). Estilo elegido en la PARADA 1: **B, tinta sepia + acuarela** (ver [la comparativa](../../assets-src/prototipo/propuestas/comparativa.png) y [la ficha](../../assets-src/fichas/propuestas-estilo.md)).
**Relacionado:** [GDD §3 y §9](../../GDD.md#9-arte-y-audio) · [ADR 0003](../adr/0003-perspectiva.md) · [PROCESO §8](../PROCESO.md#8-arte-comfyui-y-blender) · issue #11 (nitidez con DPR alto)

Esta biblia fija las reglas que todo recurso debe cumplir para que el arte se vea como una sola obra. Si una regla choca con el GDD o un ADR, manda el documento de diseño y se propone el cambio a la PO.

---

## 1. Unidades y escala

| Concepto | Valor | Notas |
|---|---|---|
| Casilla lógica | **32 × 32 px** (@1x) | La de `TAM_CASILLA` en `src/game/valle/estilo.ts` (ADR 0003). No cambia. |
| Resolución maestra | **@4x → 128 px por casilla** | Todo se pinta o renderiza a @4x y solo se reduce. Nunca se amplía. |
| Entregas | **@1x (32 px)** y **@2x (64 px)** | @2x es la textura principal (DPR 2 y zoom ≥ 1,5). Ver §8. |
| Altura del protagonista | **54 px @1x ≈ 1,7 casillas** | Proporción *chibi* de unas 3,5 cabezas. Cabe en un marco de 48 × 64 px @1x. |
| Marco del *sprite* | **48 × 64 px @1x** (96 × 128 @2x) | Pivote en los pies: (24, 58) @1x. El sobrante deja aire para el balanceo de brazos y la sombra. |
| Árbol | 2 × 3 casillas (64 × 96 @1x) | Pivote en la base del tronco, centrado. |
| Roca | 1 casilla de huella; hasta 32 × 32 @1x | Pivote en la base. |

**Referencia en Blender:** 1 casilla = **1 m**. El protagonista mide 1,7 m desde la suela hasta la coronilla (proporción de juego, no realista).

## 2. Cámara 3/4

El juego es 2D cenital con perspectiva 3/4 sobre una cuadrícula ortogonal (ADR 0003): las casillas del suelo se ven **cuadradas** y los objetos altos muestran su cara frontal. Se usan dos cámaras, como es habitual en juegos 3/4: una para lo que tiene huella en la cuadrícula y otra, más baja, para los personajes.

### Objetos con huella (árboles, rocas, edificios)

1. Cámara **ortográfica** mirando al norte, **inclinada 45°** (rotación X = 45°, Y = 0°, Z = 0°).
2. El render sale con el suelo y las alturas encogidos en vertical (× 0,707).
3. Al montar las hojas se **estira el eje vertical × √2 ≈ 1,414** (`scripts/montar-hojas.mjs --estira 1.4142`). El suelo vuelve a ser cuadrado y 1 m de altura mide 1 casilla en pantalla.

### Personajes

A 45° se veía casi solo la coronilla y la cara desaparecía. Los personajes se renderizan con la cámara **a 30° de elevación** (rotación X = 60°) y **sin estirar**: se ve la cara entera y algo de la parte de arriba de la cabeza y los hombros, que es lo que pide el 3/4. La diferencia de ángulo con el suelo no se nota a este tamaño, porque el personaje no tiene huella que tenga que casar con la cuadrícula.

| Parámetro de Blender (personaje) | Valor |
|---|---|
| Tipo | Ortográfica, rotación X 60°, Y 0°, Z 0° |
| `ortho_scale` | 2,0 m (el marco mide 1,5 × 2 casillas) |
| Escala del modelo | × 1,1 (para que la figura, vista en escorzo, mida 54 px) |
| Resolución del render | 384 × 512 px por fotograma (@8x; se reduce a @2x y @1x) |
| Pivote | (24, 58) @1x: el punto del suelo bajo el centro de los pies |
| Fondo | Transparente (*Film → Transparent*) |

## 3. Luz y sombra

- **Sol desde la izquierda y algo por delante** (oeste-suroeste del mundo), con elevación de 55° (en Blender: rotación X 35°, Z −67°). Las sombras caen **a la derecha y un poco hacia arriba**; la cara del personaje que mira abajo queda iluminada.
- La luz es cálida (`#FFF1D6`) y el relleno de ambiente, frío (`#B9C7D6` al 35 %), para que las sombras tiendan al violeta y no al negro.
- **Sombra de contacto** bajo todo lo que toca el suelo: elipse suave de color `#5A5470` al 35 % (multiplicar), achatada 2:1, con un ancho del 70 % del objeto.
- Las sombras proyectadas de árboles y edificios se pintan dentro del propio *sprite* (no hay luz dinámica en el MVP).
- El ciclo día/noche (M2) se resuelve con un tinte global sobre la escena; el arte se pinta siempre a mediodía-tarde.

## 4. Paleta

Paleta base extraída de la portada (cuantización de `assets-src/portada/portada-fuente.png`) y completada para los usos del juego. Los tonos intermedios se mezclan libremente; estos son los anclajes.

| Uso | Nombre | Hex |
|---|---|---|
| Papel / luces | Crema | `#F5ECCE` |
| Papel cálido | Crema tostada | `#F6E0BC` |
| Hierba en luz | Salvia clara | `#A2B282` |
| Hierba media | Salvia | `#969C5D` |
| Hierba en sombra | Musgo | `#6B7D4C` |
| Bosque, sombra profunda verde | Pino | `#445537` |
| Trigo, camino en luz | Ocre | `#CAB071` |
| Camino en sombra | Ocre tostado | `#9A844D` |
| Tierra arada | Tierra | `#785838` |
| Surcos | Tierra oscura | `#56402B` |
| Tejados, pañuelo del protagonista | Terracota | `#B4583C` |
| Atardecer, piel en luz | Melocotón | `#EFBF90` |
| Agua clara | Agua | `#B5D2D3` |
| Agua profunda | Agua honda | `#6F9CA6` |
| Sombras | Violeta sombra | `#5A5470` (al 35 %, multiplicar) |
| Contorno | Sepia | `#4A3426` |

**Reglas:**
- Nada de negro puro ni blanco puro. El valor más oscuro es `#2E2A33` y el más claro, `#FBF6E6`.
- Saturación: el terreno, por debajo del 45 % (HSV); el protagonista, los cultivos maduros y lo interactivo pueden llegar al 65 % para destacar.
- La interfaz (Preact) usa la misma paleta: crema de fondo, sepia para el texto y terracota para las acciones.

## 5. Contorno (estilo B)

- **Línea sepia `#4A3426`** alrededor de cada forma, de grosor uniforme: **1 px @1x** (2 px @2x, 8 px en el maestro @8x).
- Las líneas interiores (pliegues, bolsillos, ojos) son más finas: la mitad del contorno exterior, y solo donde se leen a @2x.
- Nunca negro: en las zonas en sombra la línea puede bajar a `#3A2A22`, nunca más.
- En Blender se obtiene con un **casco invertido** (modificador *Solidify* con normales invertidas y material sepia que solo se ve por detrás) más *Freestyle* desactivado: es barato, estable entre fotogramas y no parpadea.
- En los *tiles* no hay contorno: el terreno es fondo (§7.5). Sí lo llevan los objetos que sobresalen (árboles, rocas, cultivos, edificios).

## 6. Textura acuarela

- Relleno de **2–3 manchas planas por material** (luz, medio y sombra), con la sombra tendiendo al violeta (`#5A5470` multiplicado), sin degradados digitales.
- Bordes con ligeras acumulaciones de pigmento (*edge darkening*), más marcadas en el lado en sombra.
- Grano de papel *cold press* visible solo en las superficies grandes (terreno, muros) y nunca en los ojos ni en la cara.
- En los *tiles*, la textura debe ser repetible: nada de manchas grandes y únicas que delaten la repetición (ver §9).

## 7. Legibilidad en móvil

El juego se juega en pantallas de 360–430 px CSS de ancho en vertical y hasta 900 px en horizontal. Con el zoom mínimo, una casilla ocupa unos 19 px CSS.

1. **La silueta manda:** el protagonista debe reconocerse y su dirección debe leerse solo por la silueta rellena de un color, a 54 px.
2. **Contraste de valor:** entre el protagonista y cualquier terreno, al menos 25 puntos de luminosidad (L\* de CIELAB) en la cabeza y el torso. El pañuelo terracota y la camisa crema garantizan ese contraste sobre la hierba.
3. **Detalle mínimo:** ningún rasgo importante por debajo de **2 px @1x** (ojos, mano con herramienta). Los detalles más finos son decoración y pueden perderse.
4. **Lo interactivo destaca:** cultivos, objetos recogibles y el personaje llevan más saturación que el terreno y sombra de contacto.
5. **El terreno es fondo:** contraste interno bajo y sin patrones de alta frecuencia que vibren al hacer zoom o mover la cámara.
6. **Prueba obligatoria:** cada recurso se revisa a @1x sobre la porción del valle en una captura de 412 × 915 px antes de aprobarse.

## 8. Resolución de entrega y DPR (issue #11)

- El lienzo de Phaser hoy ignora `devicePixelRatio` (issue #11). El arte se entrega preparado para el arreglo propuesto allí (lienzo a CSS × min(DPR, 2)).
- **Se entregan @1x y @2x**. Con DPR 2 y zoom 1 se usa @2x a escala 0,5; con DPR 1 y zoom ≤ 1, @1x.
- A zoom 2,5 con DPR 2 (×5) incluso @2x se amplía ×2,5. Recomendación para cuando se aborde el #11: limitar el zoom máximo efectivo a ×3 o servir una variante @4x solo para el personaje (es pequeña: 192 × 256 px por fotograma).
- Formato: **WebP con canal alfa**, calidad 90 para *sprites* y 85 para *tiles*; PNG solo para fuentes.
- Filtrado lineal (no *nearest*): el estilo pintado no es *pixel art*.

## 9. *Tiles* de terreno

- Tamaño de entrega: 32 × 32 @1x y 64 × 64 @2x por casilla, agrupados en una hoja por tipo con **4 variantes** que se reparten con la semilla del valle para romper la repetición.
- Cada variante es **repetible sin costuras** consigo misma y con las otras variantes del mismo tipo (bordes compartidos).
- Las transiciones entre tipos (hierba → tierra, hierba → agua) se resuelven en M5 con *autotiling*; el prototipo solo prueba los tipos puros.
- El agua puede animarse con 4 fotogramas de ondas en el futuro; el prototipo la entrega estática.

## 10. Animación del protagonista

| Animación | Fotogramas | Velocidad | Direcciones |
|---|---|---|---|
| Reposo (respiración) | 4 | 6 fps | abajo, arriba, derecha (izquierda = espejo) |
| Caminar | 8 | 10 fps (≈ 1,4 casillas/s de zancada) | abajo, arriba, derecha (izquierda = espejo) |

- Hojas: una fila por dirección (abajo, arriba, derecha), una columna por fotograma.
- El espejo de la izquierda se hace en el juego (`flipX`). Por eso el protagonista **no lleva nada asimétrico que delate el espejo**: el concepto B lleva la bolsa en bandolera a un costado, pero en el modelo va **colgada a la espalda, centrada, con las dos correas por los hombros**, y el pelo no tiene raya marcada. Es la única desviación consciente respecto al concepto.
- El `.blend` separa en colecciones el cuerpo, el pelo, la ropa y los accesorios para poder hacer personalización por capas más adelante (GDD §3).

## 11. Nombres y rutas

- Fuentes: `assets-src/<recurso>/` y ficha en `assets-src/fichas/<recurso>.md`.
- Entregas: `public/assets/<grupo>/<recurso>@1x.webp` y `@2x.webp`, más un `.json` de marcos para las hojas de *sprites* (formato *JSON Hash* de Phaser).
- Nombres en español, en minúsculas y con guiones: `protagonista-caminar`, `tile-hierba`, `arbol-roble`.
