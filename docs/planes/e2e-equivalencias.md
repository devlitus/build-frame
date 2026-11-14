# Tabla de equivalencias de lógica (E2E-16)

Historia **E2E-16** del hito E2E-velocidad ([plan](e2e-velocidad.md), secciones «Inventario» y «Núcleo»). Antes de borrar specs e2e (E2E-17a/b/c), la **lógica** que hoy solo comprueban los e2e pasa a core/prop/unit. Esta tabla dice, para cada test de los specs marcados «Borrar», «Reducir» o «Core» en el inventario, qué aserción de lógica tiene y dónde queda.

**Leyenda del destino**
- `fichero › test`: queda cubierta en vitest (existente o nuevo en esta historia, **en negrita** lo nuevo de E2E-16).
- `e2e Xn`: queda en el test e2e de la suite final del plan (S1–S4, F1–F13, T2–T10, R1–R5, G1/G2/G5, B1–B7, A1, P1–P5). Se usa cuando lo comprobado necesita navegador (entrada real, DOM, foco, render, fps).
- `capturas`: pasa a `npm run capturas` (juicio visual de la PO).
- `descartada: motivo`: no se conserva (duplicada, informativa o mide solo la herramienta de depuración).

Las rutas de vitest se abrevian: `unit/x` = `tests/unit/x.test.ts`, `prop/x` = `tests/prop/x.test.ts`, `core/x` = `src/core/x.test.ts`. «Interfaz» en la columna de lógica significa que el test no tiene aserción de lógica (solo DOM, foco, solapes, píxeles o fps).

## Tests nuevos o ampliados en E2E-16

| Fichero | Qué cubre (resumen) |
|---|---|
| **unit/faint-notice** (plan: `unit/aviso-desmayo`) | `Aviso` real sobre una `Partida` real: «Despiertas en casa» con la casa terminada (`[S3]`), «entrada del valle» sin casa o con la casa en obra, dormir en casa, reanuncio del aviso |
| **unit/zone-palette** (plan: `unit/paleta-zonas`) | Las 4 muestras de zona en gris (primer fotograma de cada tira sobre `--hierba`, 22 px) se distinguen > 18/255 — `it.fails` (#62) |
| **unit/keyboard-input** (plan: `unit/entrada`) | `EntradaMovimiento`: 8 direcciones, teclas opuestas, sin flechas, sin captura, `blur`/`hidden`, zoom `+`/`-`, `M` una vez por pulsación, repetición, Ctrl/Alt/Meta, cierre de escena |
| **unit/energy-meter** | Medidor de energía del HUD: `meter` accesible, valor, texto y marca «baja» |
| **unit/action-buttons** | Botón contextual «Cosechar» y botón Dormir (visible ⇔ `comprobarDormir`, oculto con el inventario) |
| **prop/life-camera-hud** (plan: `prop/vida-camara-hud`) | Márgenes de la cámara de Vida (modelo de `EscenaValle.margenesVida`) + `ControlCamara`: franjas fuera del valle, personaje en pantalla y fuera de barra/panel, giro, panel que se abre; `it.fails` [S3] cabeza al borde norte |
| **prop/m5-simulation** (plan: `prop/simulacion-m5`) | Partidas de N días con todos los comandos M2–M5 (andar con A*, tiempo, desmayo, dormir, modos, pausa, comprar, pintar, construir, herramientas, talar, picar, replantar); contabilidad exacta de dinero, materiales, inventario y energía; capacidad; suelo; determinismo; dormir en pausa |
| **prop/camara-rompedor** (ampliado) | `ControlCamara` con punteros falsos: arrastre, botones derecho/central, rueda (píxeles, líneas, páginas, valores extremos), pellizco con DPR, dedos superpuestos, 1→2→1 dedos, 3 dedos, redimensionar y girar, ventana diminuta, Vida sin arrastre, teclado del Plano, seguimiento, bordes a zoom extremo, Vida tras el Plano, cierre de escena |
| **prop/tactil-rompedor** (ampliado) | `ControlTactil` con escena falsa: umbrales 10/11 px y 300 ms (también como propiedad), ratón, 2.º y 3.er dedo, `pointercancel`, `blur`/`hidden`, giro, base y mando del joystick, base dentro de la pantalla con cualquier DPR, umbrales en px CSS con DPR 1/1,25/2/2,625/3, inactivo en Plano, cierre |
| **prop/tactil-posiciones-rompedor** (ampliado) | El toque cae en su casilla y en su parcela con DPR 1/1,25/2/2,625/3 (propiedad), DPR en caliente y giros; mutante «sin × factor»; `it.fails` [S3] del gancho `puntoDeToque` |
| **unit/resolucion** (ampliado) | Tramos de DPR 1–3: lienzo = round(CSS × min(DPR, 2)), pantalla lógica = CSS, `cargarArte` pide solo @1x o solo @2x |
| **unit/compra-rompedor** (ampliado) | Carreras de compra: doble confirmación, ventana antidoble, estado cambiado antes de confirmar, precio que sube, compra en la tarea del cambio de modo, botón desactivado, comprar hasta quedarse sin dinero |
| **unit/construir** (ampliado) | `ColocadorEdificio` (toque con DPR, ratón, doble clic, 2.º dedo, botón derecho, toque cancelado, cierre de escena), Esc a destiempo, «Construir aquí» dos veces, exclusión mutua de paneles |
| **unit/pincel-zonas** (ampliado) | `PintorZonas` (arrastre con DPR, toque, 2.º dedo, toque cancelado, cambio de modo, `blur`, cerrar la barra, soltar fuera, botones, cierre de escena), borrar y repintar gratis |
| **unit/camino** (ampliado) | Clic o toque → ruta + `SeguidorCamino` + núcleo: casilla lejana, agua, fuera del valle, la propia casilla sin oscilar |
| **unit/parametros-rompedor-m104** (ampliado) | Las URL de los e2e (portada o valle), `propias`, `seleccion`, `modo`, `en`, `hora`, `acelerar`, `dinero`, `aviso`, `debug`; propiedad «nunca lanza» |
| **unit/seleccion-rompedor** (ampliado) | `SelectorParcela`: toque con DPR, arrastre, toque largo, pellizco, botón derecho, cancelado, inactivo, `blur`, cierre de escena |
| `tests/unit/fixtures/fake-scene.ts` | Escena falsa (emisor, punteros, escala, cámara de Phaser) que usan los anteriores |

## Los `[S]` y su destino

Hay **19** tests con `[Sx]` en el título (uno de ellos parametrizado: solo 640×320 lleva `[S2]`) y **4** fallos marcados `FALLA (Sx)` en comentarios de `compra-rompedor.spec.ts`. El plan habla de 21: la diferencia se aclara en E2E-17 (ver «Huecos» al final). Ninguno se borra.

| # | Spec › test | Fallo | Destino |
|---|---|---|---|
| 1 | construir-rompedor › `[S3]` doble clic en «Construir» de la confirmación: una obra y el segundo clic no elige otro edificio | interfaz (2.º clic sobre el catálogo) + lógica (una sola obra) | e2e **G1**; lógica en `prop/construir-m405-rompedor › doble confirmación: construirAqui dos veces…` y **unit/construir › «Construir aquí» twice (double tap) builds once…** |
| 2 | construir-rompedor › `[S3]` mantener Enter (repetición) no debe construir sin una segunda pulsación | interfaz (repetición de tecla) | e2e **G2** |
| 3 | construir-rompedor › `[S3]` con ratón la ayuda del panel no habla de tocar | interfaz (texto según puntero) | e2e **F3** (escritorio) |
| 4 | construir-rompedor › `[S2]` 640×320: catálogo, colocación y confirmación caben y la silueta se ve | interfaz | e2e **R4** (literal) |
| 5 | m4-global › `[S3]` con la casa terminada, el aviso del desmayo dice «Despiertas en casa»… | lógica | **unit/faint-notice › [S3] with the house finished, the faint wakes you at its door…** |
| 6 | m4-global › `[S3]` móvil vertical, zoom inicial: con el panel Construir… 8 filas… y la silueta nace dentro | interfaz + lógica | e2e **R2** (foco en Plano: silueta y parcela visibles); lógica en `unit/estabilizacion-m4 › casillaInicialSilueta …` |
| 7 | m4-global › `[S3]` teclado, zoom del Plano: un edificio de la parcela de la aparición se puede elegir con Enter | interfaz (teclado) + lógica (centrar cualquier casilla) | e2e **F9**; lógica en `unit/estabilizacion-m4 › con márgenes se puede centrar cualquier casilla del valle` |
| 8 | m5-00-final › `[S3]` mientras el arte se carga, camara() y personaje() no devuelven datos | ganchos durante la carga | e2e **S1** |
| 9 | m5-00-final › `[S3]` las cuatro muestras de zona se distinguen en escala de grises | arte | **unit/zone-palette › [S3] the four zone swatches can be told apart in greyscale** (`it.fails`, #62) |
| 10 | m5-00 › `[S2]` el protagonista que pasa por detrás (al norte) de un árbol queda tapado por la copa | render | e2e **G5** |
| 11 | m5-00 › `[S2]` … (en la fila del árbol, a su lado) queda tapado por la copa | render | e2e **G5** |
| 12 | m5-00 › `[S3]` el relleno de una zona justo al norte de un árbol no tiñe su copa | render | e2e **G5** |
| 13 | mover-demoler-rompedor › `[S3]` doble clic o doble toque en «Sí, demoler» | interfaz | e2e **G1** |
| 14 | mover-demoler-rompedor › `[S3]` doble clic o doble toque en «Mover aquí» | interfaz | e2e **G1** |
| 15 | mover-demoler-rompedor › `[S3]` doble clic o doble toque en «Mover» | interfaz | e2e **G1** |
| 16 | mover-demoler-rompedor › `[S3]` Enter con la silueta de mover en su mismo sitio no sale del modo | lógica + teclado | e2e **F4**; lógica en `unit/mover-demoler › silueta de mover en su mismo sitio · es válida para el núcleo pero no se puede colocar, y moverAqui no hace nada` |
| 17 | mover-demoler-rompedor › `[S3]` en su mismo sitio la silueta de mover no se pinta verde mientras el panel dice ✕ | lógica + render | e2e **F4**; lógica en el mismo test de `unit/mover-demoler` (`sePuedeColocar` falso) |
| 18 | mover-demoler-rompedor › `[S3]` 640×320: el panel del edificio y su confirmación no tapan el HUD… | interfaz | e2e **R4** |
| 19 | mover-demoler-rompedor › `[S3]` escritorio: con el panel del edificio abierto la captura no tiene huecos transparentes | render | e2e **R1** (1280×720 con el panel del edificio; se añade la comprobación de píxeles transparentes) |
| 20 | compra-rompedor › `FALLA (S2)` doble clic/toque en «Comprar por N» compra sin confirmar | interfaz | e2e **G1** |
| 21 | compra-rompedor › `FALLA (S3)` doble clic en «Comprar» cae en el lienzo y elige otra parcela | interfaz + lógica | e2e **G1**; lógica en **unit/compra-rompedor › confirming twice in the same instant…** y **› after a purchase, canvas clicks are blocked…** |
| 22 | compra-rompedor › `FALLA (S3)` Esc con la confirmación abierta y el foco en el lienzo | teclado y foco | e2e **F1** (teclado) / **B6** |
| 23 | compra-rompedor › `FALLA (S2)` móviles horizontales bajos: «Comprar por N» fuera | interfaz | e2e **R3/R4** (controles alcanzables) |

## Por spec

### portada (3) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| la portada muestra el título y el lienzo | interfaz | e2e S1 |
| el manifiesto PWA es accesible | interfaz (red) | e2e S1 |
| la ilustración de fondo se carga | interfaz (red) | e2e S1 |

### valle (2) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| «Nueva partida» lleva al valle con una semilla nueva | semilla entera, mundo 3072 | e2e S1; semilla en `unit/valle-rompedor-m102 › nunca lanza y la semilla siempre es uint32` |
| con ?semilla=N se abre el valle directamente | `semilla` válida ⇒ arranque directo | e2e B5; **unit/parametros-rompedor-m104 › %s opens the valley with seed %i** |

### valle-rompedor (14) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| doble clic / doble toque en «Nueva partida» | interfaz | e2e B7 |
| dos «Nueva partida» en cargas distintas dan semillas distintas | `semillaNueva` aleatoria (capa de juego) | e2e B7; descartada como unit: depende de `crypto` |
| URL rara ×6: portada, sin errores | semilla inválida ⇒ portada | **unit/parametros-rompedor-m104 › %s has no valid seed: start screen**; `unit/valle-rompedor-m102 › leerParametros (URL rara)`; e2e B5 (una URL) |
| URL ×4: abre el valle | semilla válida, repetida, `propias` con basura | **unit/parametros-rompedor-m104 › %s opens the valley…**, **› ?propias keeps unique non-negative integers…**; `unit/valle-rompedor-m102 › marcarPropias` |
| girar y redimensionar en el valle no rompe nada | interfaz | e2e B4 |
| portada: botón «Nueva partida» de al menos 44 px | interfaz | e2e R* (controles alcanzables) / B7 |

### sonda (1) — Mantener `@medida`
Fuera de la tanda; sin cambios.

### support-smoke (1) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| support helpers: open, ready, emit, goTo and unchanged | prueba la herramienta de apoyo | descartada: mide solo los helpers, que usa toda la suite |

### camara (8) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| arrastrar desplaza la cámara en sentido contrario | Δcentro = Δpuntero / zoom | **prop/camara-rompedor › dragging with the mouse moves the view the opposite way…**; `unit/camara › arrastrar desplaza la vista en sentido contrario`; e2e T8 |
| la rueda acerca y aleja manteniendo el punto bajo el cursor | punto fijo | **prop/camara-rompedor › the wheel zooms keeping the world point under the cursor…**; `unit/camara › el zoom en un punto lo deja fijo en pantalla`; e2e T8 |
| el zoom tiene mínimo y máximo | límites | **prop/camara-rompedor › the wheel zooms… within min and max**; `unit/camara › limitarZoom respeta mínimo y máximo` |
| arrastrar mucho no saca el centro de la cámara del valle | límites | **prop/camara-rompedor › dragging a lot never takes the centre out of the valley** |
| un dedo arrastra la cámara en sentido contrario | igual con dedo | **prop/camara-rompedor › dragging…** (mismo cálculo); e2e T6 |
| pellizcar acerca y mantiene el punto medio | punto medio fijo | **prop/camara-rompedor › pinch (touch) zooms around the midpoint…, at every DPR**; e2e T4 |
| juntar los dedos aleja y el zoom no baja del mínimo | mínimo | **prop/camara-rompedor › pinching in never goes below the minimum zoom** |
| pasar de uno a dos dedos no da saltos | sin saltos | **prop/camara-rompedor › going from one to two fingers (and back) does not jump**; e2e T4 |

### camara-rompedor (13) — Core + T4/T8
| Test | Lógica | Destino |
|---|---|---|
| clic derecho o central arrastrando no debería desplazar la cámara | botones | **prop/camara-rompedor › right or middle button dragging does not move the camera**; e2e T8 |
| rueda con deltaMode de líneas (>5 %) | escala de la rueda | **prop/camara-rompedor › wheel in lines (Firefox deltaMode 1)…** |
| rueda con deltaY enorme, 0 y negativo | finita y en rango | **prop/camara-rompedor › property: any wheel delta…** |
| la página no se desplaza ni hace zoom nativo | navegador | e2e T8 |
| soltar el ratón fuera de la ventana y volver no deja un arrastre fantasma | navegador (`pointerupoutside`) | e2e T8 |
| redimensionar con zoom máximo y desplazado mantiene límites y el centro | límites y centro | **prop/camara-rompedor › resize with the maximum zoom and moved away keeps the limits and the centre**; e2e B4 |
| ventana diminuta no produce NaN | finitud | **prop/camara-rompedor › a tiny window (smaller than a tile, even 0×0)…**; `prop/camara-rompedor › pantalla de tamaño 0 no produce NaN` |
| el zoom inicial en móvil vertical es legible (≥ 0,6) | zoom inicial | `prop/camara-rompedor › zoom inicial >= 0.6…`; `unit/camara › el zoom inicial es legible…` |
| dedos superpuestos no hunden el zoom | distancia 0 | **prop/camara-rompedor › overlapping fingers (distance 0)…**; `prop/camara-rompedor › pellizco con dedos superpuestos…` |
| levantar un dedo a mitad del pellizco y seguir arrastrando no salta | sin saltos | **prop/camara-rompedor › going from one to two fingers (and back) does not jump**; e2e T4 |
| tres dedos no producen NaN ni saltos de zoom | 3 dedos | **prop/camara-rompedor › three fingers: finite, in range…** |
| girar el móvil con zoom máximo y desplazado queda dentro de límites | límites | **prop/camara-rompedor › resize with the maximum zoom…** (giro 412↔915 con DPR 2,625); e2e B4 |
| arrastrar con un dedo no desplaza la página | navegador | e2e T6 |

### personaje (4) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| con ?debug&en=vado el personaje empieza sobre un vado | `?en` solo con debug | `unit/partida › parámetro ?en · solo vale con debug`; **unit/parametros-rompedor-m104 › ?en=vado, ?hora…**; e2e B5 |
| al pulsar una tecla de movimiento el personaje se mueve y la cámara lo sigue | movimiento y seguimiento | `unit/personaje › MoverPersonaje …`; **unit/keyboard-input › WASD and arrows give the 8 directions**; **prop/camara-rompedor › following (Life) reaches the target…**; e2e S2 |
| las flechas también mueven y al soltar se detiene | intención | **unit/keyboard-input › WASD and arrows…**; e2e S2 |
| al perder el foco la ventana el personaje deja de andar | `blur` suelta | **unit/keyboard-input › losing the window focus (blur) or hiding the tab releases every key**; e2e B6 |
| el reloj avanza con el tiempo real | reloj | `unit/partida › a x1 un día dura unos 15 minutos reales`; e2e P4 |

### personaje-render-rompedor (6) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| medida: velocidad efectiva y fps (informativo) | velocidad | `unit/personaje-render-rompedor › a %i fps el personaje avanza ~4 casillas/s`; fps: descartada (informativa) |
| las teclas de movimiento no bloquean atajos del navegador | sin captura | **unit/keyboard-input › keys are registered without capture…**; e2e G2 |
| reiniciar la escena varias veces no duplica el zoom de la rueda ni los objetos | oyentes quitados | **prop/camara-rompedor › ControlCamara: scene shutdown · removes every listener…**; objetos: e2e B1 |
| mantener una tecla al reiniciar la escena no deja al personaje andando solo | cierre de escena | **unit/keyboard-input › removes its listeners and keys…** |
| dos teclas opuestas se anulan | intención | **unit/keyboard-input › two opposite keys cancel out…** |
| la cámara se mantiene dentro del valle caminando mucho y al redimensionar | límites | **prop/camara-rompedor › following (Life) reaches the target…** (recorrido diagonal), **› resize…**; e2e B4 |
| el reloj avanza ~1,33 min/s a x1 | reloj | `unit/personaje-render-rompedor › a 60 fps el reloj cuadra…`; e2e P4 |

### rendimiento (5) — A P1/P5
| Test | Lógica | Destino |
|---|---|---|
| el terreno está horneado: pocos objetos y ningún Graphics grande | render | e2e P5; `unit/capa-objetos › solo crea imagen para lo que cae en la vista…` |
| con el zoom mínimo la capa de objetos sigue acotada | capa | e2e P5; `unit/capa-objetos-rompedor › en cualquier vista, contarEn coincide…` |
| el contador de fps solo existe con ?debug | `debug` | `unit/parametros-rompedor-m104 › ?debug con valores raros`; e2e B5 |
| fps medias arrastrando (informativo) | fps | e2e P1 |
| reiniciar el valle varias veces no acumula texturas ni objetos | fugas | e2e B1 |

### rendimiento-rompedor (4) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| sin costuras ni huecos de fondo con zooms fraccionarios | render | e2e B3; `prop/trozos-rompedor › cubre el mundo exactamente…` |
| el contador no captura gestos | DOM | e2e B1 (debug) — descartada si solo mide el contador de depuración |
| ?debug=0, ?debug=false y ?DEBUG no crean el contador | `debug` | `unit/parametros-rompedor-m104 › debug=0…`, **› ?debug=0, ?debug=false and ?DEBUG do not enable debug…** |
| desde la portada con ?debug el contador sobrevive a «Nueva partida» | herramienta de depuración | descartada: mide solo el contador de depuración |
| tras perder y recuperar el contexto WebGL el terreno sigue dibujado | render | e2e B2 |

### tiempo-hud (14) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| el HUD muestra la hora, el día y la estación | textos | `unit/textos-reloj › fecha y estaciones visibles`; e2e S1 |
| la hora de la madrugada se ve como 02:00 | texto | `unit/textos-reloj › HH:MM con la madrugada como 02:00`; `unit/parametros-tiempo › la madrugada…` |
| aceptación M2: un día completo, desmayo a las 02:00 y fecha nueva | desmayo, día 2, aparición | `core/comandos › al superar las 02:00 pasa al día siguiente…`; `unit/personaje › desmayo · devuelve al personaje a la aparición`; e2e S4 |
| al despertar el reloj marca las 06:00 del día siguiente | 06:00 | `core/comandos`; `prop/tiempo-rompedor › minutoDelDia siempre en [inicio, fin]…` |
| la pausa detiene el reloj y reanudar lo devuelve | pausa | `core/comandos › en pausa, AvanzarTiempo es ok pero no cambia nada`; `unit/partida › en pausa no acumula`; e2e F11 |
| la tecla P alterna la pausa y se ignora con modificadores | teclado | e2e G2 / F11 |
| x2 y x3 aceleran el reloj | velocidad | `unit/acumulador-velocidad › x2 y x3 avanzan el doble y el triple…`; e2e F11 |
| tras pulsar con el puntero el foco vuelve al lienzo | foco | e2e B6 |
| en el Modo Plano se indica que el tiempo está detenido | reloj quieto en Plano | `prop/modos-rompedor › en Plano ni el reloj ni el personaje cambian…`; e2e F11 (insignia) |
| el tinte del valle cambia con la hora | luz | `unit/luz › a mediodía no hay tinte`, `› de noche el tinte es el más oscuro` |
| botones de tiempo de al menos 44 px y sin solapes ×3 | interfaz | e2e R1–R4 |
| un segundo desmayo con el aviso visible lo reanuncia | reanuncio | **unit/faint-notice › a second faint with the notice visible announces it again** |

### hud-rompedor (5) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| el aviso no tapa reloj ni botones ×3 | interfaz | e2e R1–R4 |
| el HUD no se repinta a ritmo de fotograma | repintado | e2e B1; `unit/compra-parcela › clasificador con memoria …` (memo) |
| P con foco en un botón alterna una sola vez; mantenida no repite | teclado | e2e G2 |

### modos (13) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| al empezar el personaje está en pantalla, en Modo Vida | modo inicial | `core/comandos › CambiarModo · empieza en Vida…`; e2e S1 |
| ?modo=plano empieza en Plano con la vista centrada | `?modo` | `unit/modos › ?modo=plano`; **unit/parametros-rompedor-m104 › ?seleccion only with debug; ?modo=plano also without it** |
| el botón muestra el modo, cambia al otro y es tocable | interfaz | e2e S3 |
| el botón queda abajo a la derecha | interfaz | e2e R* |
| la tecla M cambia de modo | `M` | **unit/keyboard-input › one press is read once**; e2e S3 |
| tras pulsar el botón el teclado sigue moviendo al personaje | foco | e2e B6 |
| en Plano el reloj no avanza y el personaje no se mueve | reglas | `prop/modos-rompedor › en Plano ni el reloj ni el personaje cambian…`; `core/comandos` |
| en Vida el reloj avanza | reloj | `core/comandos › suma los minutos al reloj`; e2e S3 |
| volver a Vida recupera la pausa previa | pausa | `prop/modos-rompedor › pausado solo lo cambian Pausar y Reanudar…` |
| 20 cambios rápidos seguidos no dan errores | estrés | descartada: estrés de N clics (PROCESO §5) |
| en Vida el arrastre no mueve la cámara; la rueda hace zoom | cámara Vida | **prop/camara-rompedor › Life (no drag): a drag does not move the camera; the wheel zooms around the screen centre** |
| en Plano el arrastre mueve la cámara y el personaje no se mueve | cámara Plano | **prop/camara-rompedor › dragging with the mouse…**; `prop/modos-rompedor`; e2e T6/T8 |
| en Plano WASD desplazan la cámara y +/- hacen zoom; al volver a Vida regresa | teclado del Plano | **prop/camara-rompedor › Plano keyboard: held WASD and +/- …**, **unit/keyboard-input › keyboard zoom…**; e2e T10 |

### modos-rompedor (18) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| Ctrl+M, Alt+M y Meta+M no cambian de modo | modificadores | **unit/keyboard-input › Ctrl+M, Alt+M and Meta+M do not change mode; Shift+M does**; e2e G2 |
| Enter sobre el botón enfocado cambia una sola vez aunque se mantenga | repetición en botón | e2e G2 |
| Espacio y Enter sobre el botón: un cambio por pulsación | teclado en botón | e2e G2 |
| M con el foco en el botón cambia una sola vez | doble disparo | **unit/keyboard-input › two presses between two reads count as one change**; e2e G2 |
| mantener M pulsado cambia una sola vez | repetición | **unit/keyboard-input › holding M (auto-repeat) changes the mode only once** |
| tecla mantenida al cambiar a Plano y soltada allí: al volver no anda sola | teclas soltadas | **unit/keyboard-input › losing the window focus…** (la intención solo sigue a `isDown`); e2e G2 |
| en Plano la cámara no se mueve sola tras soltar las teclas | sin deriva | **prop/camara-rompedor › following (Life)… so a manual move is kept** |
| zoom del teclado en Plano no sale de los límites | límites | **prop/camara-rompedor › Plano keyboard: held WASD and +/-…** |
| desplazar con el teclado con zoom alto: la cámara no sale del valle | límites | **prop/camara-rompedor › Plano keyboard…** |
| el botón tiene nombre accesible y contraste AA | accesibilidad | e2e A1 |
| el botón no interfiere con el lienzo | botón vs lienzo | e2e T9 |
| en Plano, arrastrar empezando sobre el botón y soltar fuera no cambia de modo | DOM | e2e T9 |
| cambiar de modo a mitad de un arrastre: en Vida el arrastre se ignora | `arrastreActivo` | **prop/camara-rompedor › Life (no drag)…**; e2e T8 |
| cambiar a Vida a mitad de un pellizco no deja el arrastre activo | `arrastreActivo=false` borra `previa` | **prop/camara-rompedor › Life (no drag)…**; e2e T5 |
| reiniciar la escena en Plano: estado y botón coherentes | B1 | e2e B1 |
| redimensionar y girar en Vida y en Plano | personaje en pantalla | **prop/life-camera-hud › wherever the character stands…**; e2e B4 |
| el personaje empieza en pantalla con varias semillas y tamaños | personaje en pantalla | **prop/life-camera-hud › wherever the character stands on a tile centre…**; `unit/personaje › aparición …` |
| Pausar y Reanudar en Plano no alteran el modo | reglas | `prop/m2-global-rompedor › pausar en Plano y volver a Vida conserva la pausa…` |

### tactil (12) — Reducir (S2 m, T2, T5, F12)
| Test | Lógica | Destino |
|---|---|---|
| un clic en el suelo lleva al personaje rodeando los obstáculos | ruta | **unit/camino › a far free tile: arrives at its centre going around obstacles…**; e2e F12 |
| arrastrar con el ratón no mueve al personaje | sin joystick con ratón | **prop/tactil-rompedor › mouse drag never shows the joystick…** |
| una tecla de movimiento cancela el destino | escena | e2e F12 |
| en el Modo Plano el clic no fija destino | inactivo | **prop/tactil-rompedor › inactive (Plano): taps and drags are ignored** |
| tocar un punto lleva al personaje hasta allí | ruta | **unit/camino › a far free tile…**; e2e S2 (m) |
| arrastrar muestra el joystick, mueve al personaje y al soltar se para | joystick | **prop/tactil-rompedor › distance threshold…**, `unit/seguirCamino › intencionJoystick …`; e2e T2 |
| el joystick cancela el destino y ambos conviven | escena | e2e T2 |
| dos dedos cancelan el joystick y no fijan destino | 2.º dedo | **prop/tactil-rompedor › a second finger cancels the joystick…**; e2e T5 |
| en el Modo Plano el toque no mueve al personaje | inactivo | **prop/tactil-rompedor › inactive (Plano)…** |
| capturas con el joystick visible | — | capturas |
| un toque cancelado por el sistema no fija destino | `pointercancel` | **prop/tactil-rompedor › a touch cancelled by the system…**; e2e T5 |
| el joystick visible mide al menos 44 px | interfaz | e2e T2 |

### tactil-rompedor (22) — Reducir
| Test | Lógica | Destino |
|---|---|---|
| el clic derecho no fija destino | botones | **prop/tactil-rompedor › mouse: right and middle click set no destination…** |
| el clic central no fija destino | botones | ídem |
| un clic mantenido más de 300 ms fija destino | ratón sin umbral de tiempo | ídem |
| arrastrar con el ratón en Vida no mueve la cámara ni al personaje | Vida | **prop/camara-rompedor › Life (no drag)…**, **prop/tactil-rompedor › mouse drag never shows the joystick…** |
| clic sobre el botón de modo no deja un destino pendiente | DOM | e2e T9 |
| clic en el agua va a la casilla libre más cercana | ruta | `unit/camino › si el destino está bloqueado va a la casilla libre más cercana`; **unit/camino › water or an obstacle: it stops on the nearest free tile** |
| clic fuera del valle lleva a una casilla dentro | ruta | `unit/camino › un destino fuera del valle se recorta…`; **unit/camino › outside the valley…** |
| clic en la propia casilla: llega y se cancela sin oscilar | seguidor | **unit/camino › its own tile: one short move to the centre and the route ends (no oscillation)** |
| pausar con destino lo cancela y un clic en pausa no deja destino | escena | e2e F12 |
| desmayo emitido fuera del bucle: la ruta vieja no se sigue | escena | e2e F12 |
| cambiar a Plano y volver a mitad de ruta no retoma el destino | escena (`aplicarModo` cancela) | e2e F12 |
| 20 clics en 1 s no bloquean el juego | estrés | descartada (estrés); rendimiento de A* en `prop/tactil-posiciones-rompedor › 20 destinos seguidos…` |
| umbral de distancia: 10 px es toque, 11 px es joystick | umbral | **prop/tactil-rompedor › distance threshold…** y **› property: a touch is a tap iff…**; e2e T3 |
| umbral de tiempo: 600 ms no es toque; 150 ms sí | umbral | **prop/tactil-rompedor › time threshold…** y la propiedad; e2e T3 |
| toque sobre el botón de modo: cambia de modo y no fija destino | DOM | e2e T9 |
| arrastre que empieza en el botón no crea joystick | DOM | e2e T9 |
| touchcancel con el joystick activo lo quita | `pointercancel` | **prop/tactil-rompedor › touchcancel with the joystick active…**; e2e T5 |
| pestaña oculta con el joystick activo | `hidden` | **prop/tactil-rompedor › window %s with the joystick active releases it** |
| levantar el primer dedo dejando el segundo no deja el gesto atascado | multitáctil | **prop/tactil-rompedor › a second finger cancels… lifting the first leaves no stuck gesture** |
| tres dedos | multitáctil | **prop/tactil-rompedor › three fingers…** |
| girar el móvil con el joystick activo | `resize` | **prop/tactil-rompedor › rotating (resize) with the joystick active releases it…** |
| el joystick cerca del borde no sale de la pantalla | geometría | **prop/tactil-rompedor › property: the joystick base never leaves the screen…** |
| la base se centra donde se apoyó el dedo y el mando no pasa del radio | geometría | **prop/tactil-rompedor › the joystick base is centred…** |
| arrastre táctil en Vida no desplaza la cámara por su cuenta | Vida | **prop/camara-rompedor › Life (no drag)…** |
| 20 toques en 1 s: sin errores y fps decentes | estrés | descartada (estrés/fps) |
| el joystick no depende de hover y la marca se ve | CSS | capturas; e2e T2 |

### seleccion-parcela (11) — Reducir a F13
| Test | Lógica | Destino |
|---|---|---|
| un clic en una parcela la selecciona y abre el panel con atributos y precio | picking, textos | `unit/seleccion-parcela › parcelaEnPunto …`, `› Textos del panel …`; e2e F13 |
| el panel no tapa la parcela ni el HUD; botones ≥ 44 px | área libre | `unit/seleccion-parcela › Área libre y cámara …`; e2e R* |
| tocar otra parcela cambia la selección; la misma la mantiene | estado | `unit/seleccion-parcela › selecciona, avisa y mantiene la misma parcela…` |
| un arrastre de cámara no selecciona | gesto | **unit/seleccion-rompedor › a camera drag does not select…**; `unit/seleccion-parcela › un arrastre largo no es toque` |
| Esc cierra el panel y deselecciona | teclado | e2e F13 |
| el botón Cerrar cierra el panel y devuelve el foco | foco | e2e B6 |
| tocar fuera del valle deselecciona | picking | `unit/seleccion-parcela › fuera del valle o con valores inválidos no hay parcela`; e2e F13 |
| en Vida no se selecciona nada | inactivo | **unit/seleccion-rompedor › right click, a cancelled touch, Life (inactive)…** |
| al volver a Vida se deselecciona | estado | `unit/seleccion-parcela › volver a Vida suelta la selección…` |
| ?seleccion=N abre el panel (solo con debug) | parámetro | **unit/parametros-rompedor-m104 › ?seleccion only with debug…** |
| sin debug no hay ganchos ni ?seleccion | parámetro | ídem; ganchos: e2e B5 |

### seleccion-rompedor (9) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| cada parcela seleccionada queda al menos medio visible | cámara | `unit/seleccion-rompedor › tras centroParaVer la parcela cabe entera…`; e2e R* (foco en Plano ≥ 50 %) |
| el panel se actualiza al comprar otra (sube el precio) y la propia («Tuya») | precio | **unit/compra-rompedor › if the price goes up with the confirmation open…**; `core/economia › crece estrictamente con las compras hechas` |
| Esc con el foco en un botón del HUD deselecciona | foco | e2e B6 |
| rotar con el panel abierto deja la parcela visible | interfaz | e2e R5 |
| con ?propias=14,15 la parcela 15 es propia | parámetro | **unit/parametros-rompedor-m104 › ?propias keeps…**; `unit/valle-rompedor-m102 › marcarPropias` |
| un toque largo (500 ms) quieto no selecciona | umbral | **unit/seleccion-rompedor › a still touch of 500 ms does not select…**; `unit/seleccion-parcela › en táctil un toque largo no selecciona` |
| un pellizco que termina dedo a dedo no selecciona | multitáctil | **unit/seleccion-rompedor › a pinch ending one finger and then the other does not select…**; e2e T5 |
| tras un pellizco el siguiente toque corto sí selecciona | multitáctil | ídem |
| reabrir el valle varias veces no deja nada colgado | fugas | e2e B1; `unit/seleccion-parcela › reemplazar el estado (reinicio del valle) suelta la selección` |

### compra-parcela (11) — Reducir a F1
| Test | Lógica | Destino |
|---|---|---|
| el HUD muestra el dinero con formato español | formato | `unit/compra-parcela › formatearDinero`; e2e F1 |
| con ?debug&dinero=N se empieza con ese dinero | parámetro | `unit/compra-parcela › ?debug&dinero=N`; **unit/parametros-rompedor-m104 › ?en=vado, ?hora, ?acelerar, ?dinero…** |
| comprar la primera parcela: el dinero baja exactamente el precio | economía | `unit/compra-parcela › compra: baja el dinero el precio exacto…`; `core/parcelas › la primera compra es libre…`; e2e F1 |
| una no adyacente tiene el botón desactivado y el motivo | regla | `core/parcelas › segunda compra adyacente sí; diagonal y lejana no`; `unit/seleccion-parcela › estado de compra según el motivo` |
| comprar una adyacente: el precio ha subido y el dinero cuadra | economía | `core/economia › crece estrictamente…`; `prop/parcelas-rompedor › la segunda compra con dinero justo…` |
| cancelar no cambia nada; Esc cancela antes de cerrar | foco/teclado | e2e F1 |
| con el teclado: Enter pide la confirmación y Espacio la acepta | teclado | e2e F1 / F9 |
| la confirmación se cancela si cambia la selección o el modo | estado de interfaz | `unit/seleccion-parcela › volver a Vida suelta la selección…`; e2e F1 |
| sin fondos el botón está desactivado y el motivo se explica | regla, texto | `core/parcelas › fondos justos sí y quedan 0; uno menos no`; `unit/compra-rompedor › «te faltan» es exactamente precio − dinero` |
| una parcela propia no tiene botón de compra | regla | `core/parcelas › ya propia` |
| el estado visual distingue propia, comprable y no comprable; no rehornea | clasificación | `unit/compra-parcela › coincide con parcelaComprable…`, `› los tres estados tienen estilos distintos…`; rehorneo: e2e B1 |

### compra-rompedor (29) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| doble clic en «Comprar por N» ×4 posiciones (`FALLA (S2)`) | interfaz | e2e G1 |
| dos toques rápidos en «Comprar por N» | interfaz | e2e G1 (m) |
| doble clic en «Comprar» (confirmar) compra una vez y no cambia la selección (`FALLA (S3)`) | una compra; clics bloqueados | **unit/compra-rompedor › confirming twice in the same instant…**, **› after a purchase, canvas clicks are blocked…**; e2e G1 |
| confirmar dos veces en el mismo instante cobra una sola vez | una compra | **unit/compra-rompedor › confirming twice in the same instant charges once…**; `prop/parcelas-rompedor › comprar dos veces la misma parcela cobra una sola vez` |
| Enter mantenido en «Comprar por N» no compra | repetición | e2e G2 |
| si el estado cambia justo antes de confirmar: alerta y nada cambia | carrera | **unit/compra-rompedor › if the state changes just before confirming…**; `unit/compra-parcela › si el núcleo la rechaza (carrera)…` |
| si el precio sube con la confirmación abierta | carrera | **unit/compra-rompedor › if the price goes up with the confirmation open…** |
| confirmar en la misma tarea que el cambio de modo | carrera | **unit/compra-rompedor › confirming in the same task as switching to Life…** |
| botón desactivado: no abre la confirmación con clic, Enter, Espacio ni toque | regla + DOM | **unit/compra-rompedor › a disabled «Comprar por N»… never buys**; DOM: e2e F1 |
| Esc con la confirmación abierta y el foco en el lienzo (`FALLA (S3)`) | foco | e2e F1 / B6 |
| comprar con clics hasta quedarse sin dinero | economía | **unit/compra-rompedor › buying with the panel until the money runs out…**; `unit/compra-rompedor › comprar sin parar hasta quedarse sin dinero…` |
| no se repinta por fotograma en Vida ni en Plano | repintado | e2e B1; `unit/compra-parcela › clasificador con memoria …` |
| móvil horizontal con poca altura ×N (`FALLA (S2)`) | interfaz | e2e R3/R4 |
| rotar con la confirmación abierta | interfaz | e2e R5 |
| con N monedas el HUD se lee entero ×5 | formato | `unit/compra-rompedor › formatearDinero (rompedor M3-04)`; lectura: e2e R* / capturas |
| el aviso de compra no pisa el dinero ni el panel | interfaz | e2e R* |

### construir (8) — Reducir a F3
| Test | Lógica | Destino |
|---|---|---|
| el catálogo muestra casa, caja y cobertizo con coste, zona y motivo | catálogo, textos | `core/catalogo`, `prop/construir-m405-rompedor › motivo de pago del catálogo ⇔ rechazo…`, `unit/construir › textos de construcción`; e2e F3 |
| la silueta sigue al cursor o al dedo, válida o inválida con motivo | silueta | `unit/construir › calcularSilueta …`, `prop/construir-m405-rompedor › la silueta no miente`, **unit/construir › mouse: the silhouette follows the cursor…**, **› DPR %f: tapping a tile…**; e2e F3 |
| confirmar muestra coste y lo que queda; construir deja una obra | economía | `unit/construir › coste y resto en palabras`, `core/construccion › cobra, crea la obra y emite obra-iniciada`; andamio y cartel: capturas/F3 |
| al pasar los días la obra termina | obras | `core/obras › obra de n días…`, `prop/obras-rompedor › … termina exactamente al empezar d+n` |
| sin fondos: catálogo y silueta dicen que no llega | regla | `core/catalogo › sin dinero: fondos-insuficientes y cuánto falta` |
| teclado: flechas, Enter, Enter, Escape | estado de interfaz | `unit/construir › flujo: abrir, elegir, colocar, confirmar…`; e2e F9 |
| construir convive con las zonas y la parcela | exclusión | `unit/construir › abrir el pincel cierra Construir y viceversa…`, **unit/construir › panels are mutually exclusive (Partida)**; e2e F10 |
| la zona requerida se ve en pantallas apaisadas bajas | interfaz | e2e R3/R4 |

### construir-rompedor (16) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| `[S3]` doble clic en «Construir» de la confirmación | ver tabla de `[S]` (#1) | e2e G1 + unit |
| doble clic o doble toque en «Construir aquí» no construye | sin confirmar no construye | `unit/construir › no confirma sin cursor`; **unit/construir › double click on the valley…**; e2e G1 |
| doble clic en el valle con la silueta válida | gesto | **unit/construir › double click on the valley with a valid silhouette: opens the confirmation once…** |
| `[S3]` mantener Enter no debe construir | ver #2 | e2e G2 |
| una sola pulsación de Espacio pide la confirmación | teclado | e2e G2 |
| M con la confirmación abierta: pasa a Vida y no cobra | estado | `prop/construir-m405-rompedor › volver a Vida con la confirmación abierta la cierra…`; `unit/construir › volver al Modo Vida cierra Construir` |
| Esc a destiempo | estado | **unit/construir › Esc out of turn: cancelling twice, closing…**; foco: e2e B6 |
| `[S3]` con ratón la ayuda no habla de tocar | ver #3 | e2e F3 |
| rendimiento: mover la silueta no hunde los fps | fps | e2e P2 |
| segundo dedo a mitad de arrastre: la silueta vuelve | gesto | **unit/construir › a second finger mid-drag puts the silhouette back…** |
| si el estado cambia con la confirmación abierta (zona borrada) | carrera | `unit/construir › si el núcleo rechaza, avisa y cierra la confirmación`; `prop/construir-m405-rompedor › si el estado cambia con la confirmación abierta…` |
| `[S2]`/sin `[S]` pantallas bajas 640×320 y 320×640 | interfaz | e2e R4 (640×320, literal) y R2/«controles alcanzables» 320×568 |
| el cartel de la casa cuenta 3, 2, 1 | días restantes | `prop/construir-m405-rompedor › diasRestantes con obras reales…`, `core/catalogo › diasRestantes` |
| construir, pasar días y reiniciar no deja objetos sueltos | fugas | e2e B1 |
| tras perder el contexto WebGL obra y edificio iguales | render | e2e B2 |
| capturas de construir | — | capturas |

### mover-demoler (14) — Reducir a F4
| Test | Lógica | Destino |
|---|---|---|
| tocar un edificio terminado lo selecciona: Mover y Demoler | estado | `unit/mover-demoler › Partida: mover …`; e2e F4 |
| la casa se puede mover pero no demoler | regla | `core/mover-demoler › la casa no se puede demoler` |
| una obra ofrece Cancelar obra; devuelve todo | reembolso | `core/mover-demoler › CancelarObra · devuelve todo lo pagado…` |
| «No, seguir con la obra» y Escape no cancelan nada | interfaz | e2e F4 |
| demoler pide confirmación con el reembolso exacto (mitad hacia abajo) | reembolso | `core/mover-demoler › un edificio terminado devuelve la mitad, redondeada hacia abajo`, `prop/mover-demoler-rompedor › el reembolso previsto (confirmación) es el del evento…` |
| construir y demoler nunca deja más dinero ni materiales | patrimonio | `prop/mover-demoler › construir y luego cancelar o demoler no deja más que al inicio…` |
| mover a un sitio válido: gratis y sin huérfanos | mover | `core/mover-demoler › mueve un edificio terminado gratis…`; profundidad/objetos: e2e B1 |
| mover a un sitio inválido: silueta roja y el botón no mueve | regla | `unit/mover-demoler › moverAqui con la silueta en rojo no mueve y avisa…` |
| mover arrastrando con un dedo; solo el botón confirma | gesto | **unit/construir › DPR %f: tapping a tile puts the silhouette on that tile and a finger never confirms** (`ColocadorEdificio` es el mismo en mover) |
| seleccionar un edificio cierra el pincel y Construir | exclusión | **unit/construir › panels are mutually exclusive (Partida)** |
| teclado: Enter elige el edificio del centro… Demoler con Enter | teclado | e2e F9 |
| teclado: con una parcela elegida, Enter sobre un edificio cambia la selección | teclado | e2e F9 |
| teclado: Mover con las flechas y Enter; Escape cancela | teclado | `unit/construir › las flechas no son suyas sin cursor…`; e2e F9 |
| una obra no se puede mover ni demoler | regla | `core/mover-demoler › una obra no se puede mover`, `› una obra no se demuele (se cancela)` |

### mover-demoler-rompedor (17) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| `[S3]` ×3 doble clic/toque (Sí, demoler · Mover aquí · Mover) | ver #13–15 | e2e G1 |
| mantener Enter sobre «Demoler» no demuele sin soltar | repetición | e2e G2 |
| M con la confirmación abierta: no demuele | estado | `unit/mover-demoler` (volver a Vida suelta el edificio); **unit/construir › panels are mutually exclusive… Life closes everything and applies nothing** |
| Esc a destiempo | foco | e2e B6 / F4 |
| `[S3]` ×2 mismo sitio (Enter · no se pinta verde) | ver #16–17 | e2e F4 + `unit/mover-demoler` |
| `${nombre}`: el edificio elegido… no quedan tapados ×N | interfaz | e2e R1–R4 (foco en Plano: edificio elegido 100 %) |
| `[S3]` 640×320 panel del edificio | ver #18 | e2e R4 |
| `[S3]` escritorio: huecos transparentes | ver #19 | e2e R1 |
| mover, demoler y cancelar muchas veces: sin huérfanos; profundidad = Y | fugas, profundidad | e2e B1; `unit/capa-objetos › … con profundidad por la base` |
| perder y recuperar el contexto WebGL tras mover | render | e2e B2 |
| capturas de mover y demoler | — | capturas |

### pincel-zonas (12) — Reducir a F2
| Test | Lógica | Destino |
|---|---|---|
| el botón Zonas abre la barra con 4 zonas, borrador y Listo | interfaz | e2e F2 |
| el botón Zonas no existe en Vida | estado | `unit/pincel-zonas › al volver al Modo Vida la barra se cierra` |
| arrastrar con una zona dibuja una vista previa y al soltar pinta el rectángulo | gesto | **unit/pincel-zonas › DPR %f: a one-finger drag paints exactly the tiles under the finger**; `unit/pincel-zonas › arrastre: la vista previa sigue al puntero…`; e2e F2 |
| repintar con otra zona la sustituye y el borrador la quita, gratis | reglas | **unit/pincel-zonas › erasing and repainting through the game is free…**; `core/zonas › repintar otra zona sustituye…`, `› borra…` |
| un toque o clic sin arrastrar pinta una casilla | gesto | **unit/pincel-zonas › a tap or click without dragging paints one tile** |
| sobre parcelas ajenas no se pinta y sale un aviso | regla | `unit/pincel-zonas › pintar un rectángulo sin parcelas propias lo rechaza…`; `core/zonas › rechaza parcelas ajenas` |
| la rueda sigue haciendo zoom y WASD mueve la cámara con el pincel | cámara | **prop/camara-rompedor › the wheel zooms…**, **› Plano keyboard…**; e2e T10 |
| con teclado: cursor, flechas, Enter marca y Enter aplica | estado | `unit/pincel-zonas › teclado: Enter coloca el cursor, marca la esquina y aplica`; e2e F9 |
| Esc primero suelta la esquina y luego el cursor | estado | `unit/pincel-zonas › teclado: Esc suelta primero la esquina y luego el cursor` |
| Esc sin nada marcado cierra la barra y devuelve el foco | foco | e2e B6 / F9 |
| con dos dedos la cámara se mueve y no se pinta | multitáctil | **unit/pincel-zonas › a second finger mid-paint cancels…**; `ControlCamara.dedosParaArrastrar`: e2e T5 |
| en Vida la capa de zonas es tenue y en Plano opaca | render | e2e F2 / capturas |

### pincel-rompedor (14) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| un segundo dedo a mitad de un pintado anula el gesto | multitáctil | **unit/pincel-zonas › a second finger mid-paint cancels the gesture…** |
| un toque cancelado por el sistema no pinta | `pointercancel` | **unit/pincel-zonas › a touch cancelled by the system does not paint** |
| cambiar de modo a mitad de un arrastre no pinta | `reiniciar` | **unit/pincel-zonas › switching mode (reset) or losing the focus mid-drag…** |
| cerrar la barra con un arrastre en curso no pinta; sin vista previa fantasma | estado | **unit/pincel-zonas › closing the bar with a drag in progress…** |
| arrastrar y soltar fuera de la pantalla pinta hasta el borde | recorte | **unit/pincel-zonas › dragging and releasing outside the screen paints up to the edge…**; `unit/pincel-zonas › casillaMasCercana…` |
| un rectángulo sobre propias y ajenas solo pinta las propias | regla | `prop/zonas-rompedor › con una sola parcela comprada solo cambian casillas de parcelas propias` |
| teclado: el cursor se queda en el borde y se pinta la esquina 0,0 | estado | `unit/pincel-zonas › teclado: sin cursor las flechas no son del pincel; el cursor no sale del valle` |
| teclado: Enter mantenido solo marca una vez | repetición | e2e G2 |
| teclado: Enter y flechas sin herramienta no hacen nada | estado | `unit/pincel-zonas › sin herramienta no se puede arrastrar`, **› right or middle button and an inactive brush…** |
| teclado: cerrar con Listo devuelve el foco | foco | e2e B6 |
| teclado: el cursor que baja nunca queda bajo la barra ×2 | interfaz | e2e R* (foco en Plano: cursor del pincel sin tapar) |
| pintar y borrar muchas veces no acumula texturas | fugas | e2e B1 |
| pintar todo el valle repetidamente no hunde los fps | fps | e2e P2; coste del núcleo en `prop/zonas-rompedor › 1000 comandos…` |
| tras perder el contexto WebGL las zonas se redibujan | render | e2e B2 |
| capturas de zonas y barra | — | capturas |

### cosechar (1) — Mantener (F5)
| Test | Lógica | Destino |
|---|---|---|
| arar, plantar, regar, dormir varios días y cosechar con el botón contextual | ciclo de cultivo; botón «Cosechar» | e2e F5 (se queda); lógica en `core/cosecha › aceptación del hito…`, **prop/m5-simulation › invariants after every command…** (cosechas = eventos), **unit/action-buttons › says «Cosechar» only with the hand facing a ripe, living plant** |

### energia (6) — Reducir a F7
| Test | Lógica | Destino |
|---|---|---|
| la barra de energía es un medidor accesible | medidor | **unit/energy-meter › is a meter from 0 to the maximum…** |
| usar la azada gasta 2 y el medidor lo refleja; la mano no gasta | costes | `core/energia › un uso válido de %s gasta su coste`; **unit/energy-meter › with %i energy…**; **prop/m5-simulation** (coste exacto en cada uso) |
| sin energía: «Estás agotado» y moverse sigue valiendo | regla | **prop/m5-simulation › energy: a long day of chopping runs out…**; `core/energia › moverse y cambiar de modo nunca se bloquean sin energía`; texto: e2e F7 |
| el botón Dormir junto a la aparición pasa de día con la energía al máximo | dormir | `core/energia › Dormir · sin casa, junto a la aparición…`; e2e F7 |
| la tecla Z duerme y el botón solo se ve donde se puede dormir | visibilidad | **unit/action-buttons › shows exactly where the core accepts Dormir…**; tecla: e2e F7 |
| en el Modo Plano no hay botón Dormir | visibilidad | **unit/action-buttons › … (in the Plano)** |

### energia-rompedor (14) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| Z con el inventario abierto: si el botón se oculta, la tecla no debe dormir | botón oculto | **unit/action-buttons › … hides with the inventory open**; la tecla: e2e G2 |
| Z con el foco en un botón del HUD no duerme | foco | e2e G2 |
| Z con el foco en `<body>` duerme | foco | e2e G2 / F7 |
| Z mantenida duerme una sola vez | repetición | e2e G2 |
| Z en el Modo Plano no hace nada | regla | `core/energia › Dormir · solo en Modo Vida` |
| Z y E a la vez: sin energía, E avisa y Z sigue durmiendo | regla | **prop/m5-simulation › energy: a long day of chopping runs out…** (dormir tras agotarse) |
| dormir en pausa conserva la pausa; a x3 conserva la velocidad | regla | **prop/m5-simulation › sleeping while paused keeps the pause, and at x3 keeps the speed…** |
| al dormir con un destino pendiente el personaje no sigue andando | escena | e2e F12 |
| aviso agotado y aviso de herramienta a la vez: queda uno | aviso | `unit/estabilizacion-m4 › unirFrases`; DOM: e2e F7 |
| el medidor: valor y texto coherentes en cada gasto | medidor | **unit/energy-meter › with %i energy the value and the «low» mark follow the state** |
| el botón Dormir al aparecer no mueve los botones | interfaz | e2e R* |
| HUD en 320×568 con energía, Dormir y aviso ×N | interfaz | e2e R* (controles alcanzables a 320×568) |

### inventario (12) — Reducir a F8/F6
| Test | Lógica | Destino |
|---|---|---|
| la barra muestra las seis herramientas, ≥ 44 px | interfaz | e2e F8 / R* |
| elegir una herramienta con un clic o toque | estado | `core/herramientas › ElegirHerramienta · elige %s`; `unit/inventario-partida › elegir «semillas»…` |
| las teclas 1 a 6 eligen la herramienta | teclado | e2e G2 / F8 |
| E y Espacio usan la herramienta en la casilla de enfrente | casilla | `unit/casilla-enfrente`, `unit/inventario-partida › usarEnfrente actúa sobre la casilla de enfrente…`; teclas: e2e F8 |
| el botón de acción usa la herramienta en la casilla de enfrente | casilla | ídem; e2e F8 |
| con la pausa el uso se rechaza con su motivo | regla | `core/herramientas › con la pausa del jugador se rechaza` |
| un clic en una casilla pegada usa la herramienta; uno lejano camina | alcance | `core/herramientas › se acepta sobre la casilla del personaje y sus 8 vecinas…`, `› a 2 casillas … fuera de alcance`; **prop/tactil-posiciones-rompedor › property: … maps back to it**; e2e T7 |
| inventario: el botón abre el panel con ranuras, cantidades y capacidad | inventario | `core/inventario › trae el lote de regalo…`, `› capacidad base 12…`; e2e F8 |
| inventario: elegir una semilla del panel activa «Semillas» | estado | `unit/inventario-partida › elegirSemilla deja activa la herramienta «semillas»` |
| inventario: la tecla I y Escape abren y cierran | teclado | `unit/inventario-partida › alternar abre y cierra…`; e2e F8 |
| en el Modo Plano no hay barra, ni botones, ni teclas | regla | `core/herramientas › solo en Modo Vida`; **unit/action-buttons › does not exist in the Plano** |
| el inventario abierto se cierra al pasar al Plano | estado | `unit/inventario-partida › se cierra al pasar al Modo Plano…` |

### inventario-rompedor (13) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| tras cerrar el inventario con M, las teclas siguen vivas | foco | e2e G2 / B6 |
| con el inventario abierto por teclado, un clic devuelve las teclas | foco | e2e B6 |
| E y Espacio mirando fuera del valle: «fuera-del-valle» | regla | `core/herramientas › fuera del valle`; aviso: e2e F8 |
| las teclas con modificadores no eligen ni usan | teclado | e2e G2 |
| con el foco en un botón de herramienta, Espacio pulsa el botón | foco | e2e G2 |
| clic o toque: las 9 casillas usan la herramienta y la de distancia 2 camina ×DPR | alcance + picking | `core/herramientas › se acepta sobre la casilla del personaje y sus 8 vecinas…`; **prop/tactil-posiciones-rompedor › property: any view, any CSS size, any DPR…**; e2e T7 |
| un joystick que empieza en una casilla pegada no usa la herramienta | gesto | **prop/tactil-rompedor › distance threshold…** (arrastre > 10 px no es toque); e2e T2 |
| en la esquina inferior izquierda la barra no tapa al personaje | cámara Vida | **prop/life-camera-hud › wherever the character stands… not under the bar or the panel**; e2e R2–R4 (foco en Vida) |
| el panel de inventario no se solapa con la barra ni los botones | interfaz | e2e R* |
| con el personaje en medio, el inventario abierto no lo tapa | cámara Vida | **prop/life-camera-hud › … not under the panel**, **› when a Life margin grows (panel opens)…**; e2e R* |
| girar el móvil con el inventario abierto | interfaz | e2e R5 |

### inventario-rompedor-r2 (30) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| `<vista>, esquina <esquina>`: la vista no enseña más fuera del valle que lo que tapa la barra ×12 | márgenes de Vida | **prop/life-camera-hud › in the 4 corners (and the west edge) it never shows more outside the valley…** |
| ninguna esquina deja al personaje bajo el HUD ni fuera de la pantalla | márgenes de Vida | **prop/life-camera-hud › wherever the character stands on a tile centre…**; fila superior del HUD: e2e R2–R4 |
| al girar el móvil en el borde oeste, la franja se ajusta a la barra | giro | **prop/life-camera-hud › ControlCamara: following with the Life margins converges…; rotating re-fits the west strip** |
| `<vista>`: personaje pegado al oeste, el panel abierto no lo tapa ×2 | márgenes de Vida | **prop/life-camera-hud › … not under the panel**, **› when a Life margin grows (panel opens)…** |
| con el foco en `<body>`, cada tecla actúa una sola vez | doble disparo | e2e G2 |
| con el foco en el lienzo, E usa una vez e I abre | doble disparo | e2e G2 |
| en el Plano, con el foco en `<body>`, 1–6, E e I no hacen nada | regla | `core/herramientas › solo en Modo Vida`; e2e G2 |
| con el foco en un botón del HUD (Hacha), 1 y E no actúan | foco | e2e G2 |
| en el Plano, un clic en el lienzo no roba el foco de la barra de zonas | foco | e2e B6 |
| Tab desde el lienzo recorre el HUD | foco | e2e A1 |
| `<w×h>`: el texto de «Cerrar» cabe ×N | interfaz | e2e R* (sin texto recortado) |
| `<w×h>`: la pista «▼» no tapa la cantidad ×N | interfaz | e2e R* / capturas |
| `<w×h>`: tocar una ranura bajo la pista la elige ×N | DOM | e2e F8 (m) |
| 320×568: la pista desaparece al final y vuelve al subir | DOM | capturas |
| iconos de semilla @1x/@2x según el DPR | arte | **unit/resolucion › DPR %f: every art file requested by cargarArte…** (lienzo); iconos del DOM: `unit/arte-m5-00`; descartada como e2e |

### m1-global-rompedor (15) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| portada → Nueva partida → gestos → girar → recarga → Nueva partida | flujo | e2e S1 / B4 / B7; cámara en **prop/camara-rompedor** |
| ?semilla inválida abre la portada y «Nueva partida» genera una nueva | parámetros | **unit/parametros-rompedor-m104 › %s has no valid seed…**; e2e B7 |
| `<caso>, zoom <extremo>`: se alcanzan las cuatro esquinas y bordes ×4 | límites | **prop/camara-rompedor › %i×%i, min and max zoom: dragging reaches the four edges…** |
| horneado: con zoom máximo en las esquinas el terreno cubre la pantalla | render | e2e B3 |
| Vida tras el Plano · con un panel abierto en una esquina | cámara | **prop/camara-rompedor › Life after the Plano: … the view goes back inside the valley** |
| Vida tras el Plano · con los márgenes que dejó el Plano | cámara | ídem; con barra: **prop/life-camera-hud** |
| contador de fps: sigue en la esquina tras zoom y giro | depuración | descartada: mide solo el contador de depuración |
| reiniciarValle: la cámara vuelve al encuadre inicial y los gestos no se duplican | oyentes quitados | **prop/camara-rompedor › ControlCamara: scene shutdown…**; encuadre: e2e B1 |
| DPR alto: el lienzo se dibuja a la resolución del dispositivo | resolución | **unit/resolucion › DPR %f: canvas = round(CSS × min(DPR, 2))…**; e2e T7 |
| rendimiento: fps medias arrastrando (registro) | fps | e2e P1 |

### m2-global-rompedor (11) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| un día acelerado con teclado, modos, velocidad y pausa: coherencia | reloj, luz | `prop/m2-global-rompedor › el estado siempre es válido…`; `unit/hud-rompedor › luzDelMinuto …`; e2e S4 / F11 |
| desmayo con una ruta en curso: sin destino, en la aparición, cámara con él | escena | e2e F12; aparición: `unit/personaje › desmayo …` |
| desmayo con el joystick activo | escena | e2e T2 |
| pulsar el modo con el joystick activo lo suelta | escena + DOM | e2e T9 |
| segundo dedo sobre el botón de pausa durante el arrastre | DOM | e2e T9 |
| girar el móvil de noche, en Plano y con aviso | interfaz | e2e R5 |
| P y M a la vez: cada una actúa una vez | teclado | e2e G2 |
| tras reiniciar la escena 6 veces: una P = un cambio, un joystick | fugas | e2e B1 |
| reiniciar la escena en Plano con pausa: botón e insignia coherentes | B1 | e2e B1 |
| Modo Plano con una ruta activa: se cancela | escena | e2e F12 |
| recorrido con Tab: nombre accesible y foco visible | accesibilidad | e2e A1 |
| botones de velocidad y pausa con aria-pressed; el reloj es un timer | accesibilidad | e2e A1 |
| fps de noche andando con el HUD | fps | e2e P3 |

### m3-global-rompedor (9) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| Vida → Plano, primera compra, no adyacente, adyacentes hasta sin fondos, vuelta a Vida | economía, reloj | `prop/m3-global-rompedor › invariantes de la economía, las parcelas y el personaje…`; **unit/compra-rompedor › buying with the panel until the money runs out…**; e2e F1 |
| el desmayo no toca el dinero, las propias ni deja selección | reglas | `prop/m3-global-rompedor › Partida: el desmayo y la pausa no tocan la selección ni el dinero…` |
| Pausa, x2 y x3 con la confirmación abierta: cobra una vez, reloj quieto en Plano | reglas | `prop/modos-rompedor › en Plano ni el reloj…`; `prop/parcelas-rompedor › la compra no avanza el reloj…`; e2e F11 |
| Esc y M con panel y confirmación, y destino tocado | escena | e2e F10 / F12 |
| joystick con cambio de modo (M) con el dedo puesto | escena | e2e T2 |
| reiniciar el valle 5 veces tras comprar | fugas | e2e B1 |
| elegir una parcela y comprarla solo con teclado | teclado | e2e F9 |
| con el panel abierto, Tab llega a «Comprar por N» | foco | e2e F9 / A1 |
| girar el móvil en cada paso | interfaz | e2e R5 |
| fps en Vida, Plano y con panel | fps | e2e P2 |

### m4-global-rompedor (13) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| partida completa: parcela, zonas, casa + caja + cobertizo, días, mover, demoler, cancelar y repintar | patrimonio, despertar en la puerta, zonas bajo edificios | `prop/m4-global-rompedor › invariantes en partidas aleatorias…`; **prop/m5-simulation**; e2e F3 / F4 |
| `[S3]` «Despiertas en casa» | ver #5 | **unit/faint-notice** |
| comprar parcelas con obras activas; construir a caballo de dos | reglas | `prop/construccion-rompedor › huella a caballo entre dos parcelas propias vale…`; `prop/m4-global-rompedor` |
| mover un edificio a una zona y borrar la zona | reglas | `core/construccion › BorrarZona no borra bajo un edificio terminado…`, `prop/construccion › pintar y borrar zonas nunca cambia casillas bajo un edificio` |
| Vida con cada panel abierto: se cierra todo y no se aplica nada | exclusión | **unit/construir › panels are mutually exclusive… Life closes everything and applies nothing** |
| exclusión mutua: parcela, pincel, construir y edificio | exclusión | **unit/construir › panels are mutually exclusive (Partida)**; parte de la escena: e2e F10 |
| tocar la obra con la parcela debajo y comprar la vecina: nunca dos paneles | exclusión | ídem; e2e F10 |
| `[S3]` móvil vertical: 8 filas y la silueta dentro | ver #6 | e2e R2 + `unit/estabilizacion-m4` |
| comprar, pintar, construir, mover y demoler sin ratón | teclado | e2e F9 |
| `[S3]` teclado, zoom del Plano: edificio elegible con Enter | ver #7 | e2e F9 + `unit/estabilizacion-m4` |
| muchas acciones no dejan objetos ni texturas huérfanos | fugas | e2e B1 |
| perder y recuperar el contexto WebGL con la granja llena | render | e2e B2 |
| fps con la granja llena | fps | e2e P2 |
| capturas finales de la granja (m4-final) | — | capturas |

### m5-00-rompedor (38) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| `[S2]` ×2 y `[S3]` profundidad de la copa y zona al norte del árbol | ver #10–12 | e2e G5 |
| DPR n · el lienzo mide CSS×min(DPR,2) y arte @Nx ×3 | resolución | **unit/resolucion › DPR %f: canvas = …** y **› … every art file requested by cargarArte has the tier suffix…** |
| DPR n · toque, clic de colocación y pincel caen en la casilla ×3 | picking | **prop/tactil-posiciones-rompedor › property: any view, any CSS size, any DPR…**, **prop/tactil-rompedor › DPR %f: … the tap lands on the world point…**, **unit/construir › DPR %f…**, **unit/pincel-zonas › DPR %f…**; e2e T7 |
| DPR n · Plano: el toque elige la parcela bajo el dedo ×3 | picking | **prop/tactil-posiciones-rompedor › DPR %f, Plano: the touch picks the parcel under the finger (all 36)**, **unit/seleccion-rompedor › DPR %f: a short tap…** |
| al girar el móvil el lienzo sigue a CSS×2 y el toque cae en su casilla | giro | **prop/tactil-posiciones-rompedor › DPR changes on the fly (1→2→1→3→1.25→2) and rotations…**; e2e B4 |
| volver de la portada al valle no pierde texturas | carga | e2e B7 |
| `<modo>`: a DPR 2 las fps no caen del 60 % ×2 | fps | e2e P1 |
| gestos con DPR n · joystick 10/11 px; dentro de la pantalla ×3 | umbrales | **prop/tactil-rompedor › DPR %f: the 10/11 px thresholds are CSS pixels…**, **› property: the joystick base never leaves the screen… (any DPR)** |
| gestos con DPR n · pellizco: acerca y mantiene el punto ×3 | pellizco | **prop/camara-rompedor › pinch (touch) zooms around the midpoint…, at every DPR** |
| gestos con DPR n · pincel: pinta exactamente las casillas bajo el dedo ×3 | picking | **unit/pincel-zonas › DPR %f: a one-finger drag paints exactly the tiles under the finger** |
| gestos con DPR n · construir: tocar coloca la silueta ×3 | picking | **unit/construir › DPR %f: tapping a tile puts the silhouette on that tile…** |
| los tres edificios pasan por cimientos, obra y terminado | estado visual | `unit/arte-m5-00 › estado visual de un edificio …`; texturas: e2e F3 |
| costuras con DPR n ×3 | render | e2e B3 |
| DPR n: el arte y el lienzo de su tramo ×5 (1,25 · 1,49 · 1,5 · 1,75 · 2,625) | resolución | **unit/resolucion › DPR tiers…** (los ocho tramos) |
| reiniciar el valle varias veces no acumula texturas | fugas | e2e B1 |
| capa de objetos con pool: tras saltos, justo lo visible | capa | `unit/capa-objetos-rompedor › en cualquier vista, contarEn coincide…`; e2e B1 |
| perder el contexto y mover la cámara durante la pérdida | render | e2e B2 |

### m5-00-final-rompedor (5) — Borrar
| Test | Lógica | Destino |
|---|---|---|
| DPR 1→2→1→3→1,25→2 sin cambiar el tamaño CSS ×2 | DPR en caliente | **prop/tactil-posiciones-rompedor › DPR changes on the fly…**; el aviso de `matchMedia` al juego: e2e T7 |
| `[S3]` camara() y personaje() durante la carga del arte | ver #8 | e2e S1 |
| árbol, edificio, zonas, barra y gris en las tres vistas | — | capturas |
| `[S3]` las cuatro muestras de zona en gris | ver #9 | **unit/zone-palette** (`it.fails`) |

### humo (12) — Reducir a S1–S4
| Test | Lógica | Destino |
|---|---|---|
| arrancar: la portada lleva al valle con el HUD | — | e2e S1 |
| moverse con el teclado | — | e2e S2 |
| clic o toque hasta un destino cercano | ruta | e2e S2; **unit/camino › a far free tile…** |
| cambiar de modo detiene el reloj y volver lo reanuda | reglas | e2e S3; `prop/modos-rompedor` |
| un día acelerado pasa al día siguiente con el aviso | — | e2e S4 |
| seleccionar una parcela en el Modo Plano abre el panel | — | e2e F13 (`@humo`) |
| comprar la primera parcela baja el dinero del HUD | economía | e2e F1 (`@humo`); `unit/compra-parcela › compra: baja el dinero…` |
| pintar una zona con el pincel y borrarla | zonas | e2e F2 (`@humo`); **unit/pincel-zonas › erasing and repainting…** |
| pintar una zona y construir en ella: obra visible y edificio al pasar el día | construcción | e2e F3 (`@humo`); **prop/m5-simulation** (construir en la apertura) |
| demoler un edificio terminado devuelve la mitad del coste | reembolso | e2e F4 (`@humo`); `core/mover-demoler › un edificio terminado devuelve la mitad…` |
| elegir una herramienta y abrir y cerrar el inventario | — | e2e F8 (`@humo`) |
| dormir junto a la aparición pasa de día con la energía al máximo | energía | e2e F7 (`@humo`); `core/energia › Dormir · sin casa, junto a la aparición…` |

## Huecos encontrados

1. **Lógica que vive en `EscenaValle` (no testeable sin Phaser).** Cancelar la ruta al cambiar de modo, al pausar, con una tecla o con el desmayo emitido fuera del bucle; las teclas de herramientas (1–6, E, Espacio, I, Z) y su filtro de foco y modificadores; `margenesVida`; la elección entre «usar» y «caminar» al tocar una casilla. Se queda en e2e (F12, G2, F8, T7). `prop/life-camera-hud` copia la fórmula de `margenesVida` como modelo: si cambia en la escena, hay que cambiarla allí. Extraer esas funciones puras de la escena (historia aparte, `src/` no es del Rompedor) permitiría pasarlas al núcleo.
2. **Exclusión de paneles repartida.** `Partida` cierra paneles entre sí, pero «abrir el pincel o Construir suelta la parcela» y «no se elige parcela con el pincel o Construir abiertos» están en `EscenaValle.alCambiarHerramienta`. El test de `unit/construir` modela esas dos reglas; F10 debe seguir comprobándolas en e2e.
3. **Reinicio de escena (B1).** Que `ControlCamara`, `ControlTactil`, `EntradaMovimiento`, `PintorZonas`, `ColocadorEdificio` y `SelectorParcela` quitan sus oyentes en `shutdown` queda en vitest (un test «scene shutdown» en cada fichero). Lo que crea la escena (Graphics, texturas, HUD, joystick en el DOM) sigue en e2e B1.
4. **Recuento de `[S]`.** Hay 19 títulos con `[Sx]` y 4 `FALLA (Sx)` en comentarios de `compra-rompedor` (23 en total), no 21 como dice el plan. Todos tienen destino arriba.
5. **Tiempos de vitest.** `prop/construccion-rompedor › balance (medición)` tarda ~30 s en la máquina de 16 hilos (más que los 20 s por defecto) y fallaba por tiempo en `npm run check` también sin los cambios de esta historia: se le da un tiempo propio de 120 s. Con otras tandas en paralelo en la máquina, una decena de tests que generan muchos valles también superan los 20 s.

## Fallos (bugs) encontrados

| Sev. | Fallo | Test |
|---|---|---|
| S3 | Con el personaje pegado al borde norte (pies en y = 0,3 casillas, posible andando contra el borde con el teclado), la cámara de Vida solo deja medio tile de sprite por encima del valle (`ceil(16 × zoom)`): la cabeza queda 0,2 casillas × 32 × zoom px por encima de la pantalla | `prop/life-camera-hud › [S3] pressed against the north edge (feet at y = 0.3) the head stays on screen` (`it.fails`) |
| S3 (gancho de prueba) | `puntoDeToque` (detrás de `__raices.puntoClicCasilla` y `puntoClic`) devuelve, cuando de la casilla solo queda en la zona libre una franja del grosor del error de coma flotante, un punto en el borde compartido, que pertenece a la casilla vecina: un e2e que toca ahí cae una casilla desplazado. Visto con DPR 1,25, 691×691, zoom mínimo, casilla (0, 9). Afecta a los e2e que usan esos ganchos (T7), no al jugador | `prop/tactil-posiciones-rompedor › [S3] the hook point of a tile that is only a floating-point sliver in the free area lands on that tile` (`it.fails`) |
| S3 (conocido, #62) | Las muestras de zona no se distinguen en gris: huerto 156,5 y vivienda 157,8 sobre 255 (diferencia 1,3; umbral 18) | `unit/zone-palette › [S3] the four zone swatches can be told apart in greyscale (@1x/@2x)` (`it.fails`) |

No se han encontrado fallos de economía, construcción, parcelas, energía ni inventario: la simulación M5 (80 partidas por ejecución, decenas de miles de comandos, con contabilidad exacta en cada paso) y las carreras de compra pasan.
